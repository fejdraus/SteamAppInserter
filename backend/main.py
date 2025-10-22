import io
import json
import os
import re
import subprocess
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional, Any, Dict

import requests
from http_client import get_global_client
from config import (
    MANILUA_API_BASE,
    MANILUA_API_KEY_PREFIX,
    HTTP_TIMEOUT,
    CACHE_EXPIRY_SECONDS,
    MANIFEST_URLS,
    STEAMUI_APPINFO,
)

try:
    import Millennium
    import PluginUtils

    logger = PluginUtils.Logger()
except ImportError:
    import logging

    class _FallbackLogger:
        def __init__(self) -> None:
            self._logger = logging.getLogger("steamappadder")
            logging.basicConfig(level=logging.INFO, format='%(message)s')

        def log(self, msg: str) -> None:
            self._logger.info(msg)

        def warn(self, msg: str) -> None:
            self._logger.warning(msg)

        def error(self, msg: str) -> None:
            self._logger.error(msg)


def GetPluginDir():
    current_file = os.path.realpath(__file__)

    if current_file.endswith('/main.py/main.py') or current_file.endswith('\\main.py\\main.py'):
        current_file = current_file[:-8]
    elif current_file.endswith('/main.py') or current_file.endswith('\\main.py'):
        current_file = current_file[:-8]

    backend_dir = os.path.dirname(current_file)
    plugin_dir = os.path.dirname(backend_dir)

    return plugin_dir


class Plugin:
    def __init__(self):
        self.plugin_dir = GetPluginDir()
        self.backend_path = os.path.join(self.plugin_dir, 'backend', 'api_key.txt')
        self._api_key: Optional[str] = None
        self._load_api_key()

    def _load_api_key(self):
        try:
            path = self.backend_path
            if os.path.isfile(path):
                with open(path, "r", encoding="utf-8") as f:
                    candidate = f.read().strip()
                    self._api_key = candidate or None
                    logger.log(f"Loaded Manilua API key from backend")
            else:
                self._api_key = None
        except Exception as exc:
            logger.log(f"Failed to load Manilua API key: {exc}")
            self._api_key = None

    def _save_api_key(self, api_key: Optional[str]):
        try:
            _ensure_directory(os.path.dirname(self.backend_path))
            if api_key:
                with open(self.backend_path, "w", encoding="utf-8") as f:
                    f.write(api_key.strip())
                self._api_key = api_key.strip()
                purge = [key for key in list(_cache.keys()) if key.startswith('lua_manilua_')]
                for key in purge:
                    _cache.pop(key, None)
            else:
                if os.path.isfile(self.backend_path):
                    os.remove(self.backend_path)
                self._api_key = None
                purge = [key for key in list(_cache.keys()) if key.startswith('lua_manilua_')]
                for key in purge:
                    _cache.pop(key, None)
        except Exception as exc:
            logger.error(f"Failed to save Manilua API key: {exc}")
            raise

    def get_api_key(self) -> Optional[str]:
        return self._api_key

    def has_api_key(self) -> bool:
        return self._api_key is not None

    def set_api_key(self, api_key: Optional[str]):
        self._save_api_key(api_key)

    def _front_end_loaded(self):
        logger.log('Frontend loaded!')

    def _load(self):
        logger.log('Backend loaded')
        Millennium.ready()
        self._load_api_key()  # Если нужно перезагрузить

    def _unload(self):
        logger.log('unloading')

try:
    from steam_verification import get_steam_verification, refresh_steam_verification
    _steam_verification = get_steam_verification()
except Exception:
    _steam_verification = None
    def refresh_steam_verification() -> None:
        return None


_cache: dict[str, tuple[Any, float]] = {}


def getSteamPath() -> str:
    return Millennium.steam_path()


def get_stplug_in_path() -> str:
    steam_path = getSteamPath()
    return os.path.join(steam_path, 'config', 'stplug-in')


def get_depotcache_path() -> str:
    steam_path = getSteamPath()
    return os.path.join(steam_path, 'config', 'depotcache')


def get_stats_export_path() -> str:
    steam_path = getSteamPath()
    return os.path.join(steam_path, 'config', 'StatsExport')


def create_message(message_code: str, fallback: str, **params) -> dict[str, Any]:
    return {
        'message_code': message_code,
        'message_params': params,
        'details': fallback
    }


def _default_user_agent() -> str:
    version = "1.0.0"
    try:
        if _steam_verification and hasattr(_steam_verification, "millennium_version"):
            version = _steam_verification.millennium_version or version
    except Exception:
        pass
    if version == "1.0.0":
        return "manilua-plugin/3.1.1 (Millennium)"
    return f"manilua-plugin/{version} (Millennium)"


def _manilua_headers(api_key: Optional[str], accept: str = "application/octet-stream") -> Dict[str, str]:
    headers: Dict[str, str] = {
        "Accept": accept,
        "X-Requested-With": "manilua-Plugin",
        "Origin": "https://store.steampowered.com",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
    }
    verification_applied = False
    if _steam_verification:
        try:
            refresh_steam_verification()
            verification_headers = _steam_verification.get_verification_headers()
            headers.update(verification_headers)
            verification_applied = True
        except Exception as exc:
            logger.log(f"Failed to apply Steam verification headers: {exc}")
    if not verification_applied:
        headers["User-Agent"] = _default_user_agent()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers




def extract_user_dlc_lines(content: str, main_appid: str) -> list[str]:
    lines = content.split('\n')
    dlc_lines = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('--'):
            continue
        if 'addappid(' in line:
            match = re.search(r'addappid\((\d+)', line)
            if match:
                id_found = match.group(1)
                if id_found != main_appid:
                    if '--' in line:
                        dlc_lines.append(line)
        if 'addtoken' in line:
            dlc_lines.append(line)
    return dlc_lines

def _extract_manilua_archive(appid: str, archive_bytes: bytes) -> dict[str, Any]:
    result: dict[str, Any] = {
        'success': False,
        'lua_content': None,
        'installed_files': [],
        'error': None
    }

    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            file_list = archive.namelist()
            logger.log(f"Manilua archive for {appid} contains {len(file_list)} files: {file_list}")

            stplug_in_dir = get_stplug_in_path()
            depotcache_dir = get_depotcache_path()
            stats_export_dir = get_stats_export_path()

            _ensure_directory(stplug_in_dir)
            _ensure_directory(depotcache_dir)
            _ensure_directory(stats_export_dir)

            lua_files_found = []

            for file_name in file_list:
                if file_name.endswith('/'):
                    continue

                base_name = os.path.basename(file_name)
                file_name_lower = file_name.lower()

                try:
                    file_content = archive.read(file_name)

                    if file_name_lower.endswith('.lua'):
                        dest_path = os.path.join(stplug_in_dir, base_name)
                        try:
                            decoded = file_content.decode('utf-8')
                            lua_files_found.append(decoded)
                            merged_content = decoded

                            if os.path.isfile(dest_path):
                                with open(dest_path, 'r', encoding='utf-8') as f:
                                    existing_content = f.read()
                                user_dlc_lines = extract_user_dlc_lines(existing_content, appid)
                                for dlc_line in user_dlc_lines:
                                    if dlc_line not in merged_content:
                                        merged_content += '\n' + dlc_line
                                logger.log(f"Merged {len(user_dlc_lines)} user DLC lines into new content")
                            else:
                                logger.log(f"Writing new file {dest_path}")

                            with open(dest_path, 'w', encoding='utf-8') as f:
                                f.write(merged_content)
                            result['installed_files'].append(dest_path)
                            logger.log(f"Extracted {file_name} → {dest_path}")
                        except UnicodeDecodeError:
                            if not os.path.isfile(dest_path):
                                with open(dest_path, 'wb') as f:
                                    f.write(file_content)
                                result['installed_files'].append(dest_path)
                                logger.log(f"Extracted {file_name} → {dest_path}")
                            else:
                                logger.log(f"LUA file {dest_path} already exists, skipping binary overwrite")
                            lua_files_found.append(file_content.decode('utf-8', errors='replace'))

                    elif file_name_lower.endswith('.manifest'):
                        dest_path = os.path.join(depotcache_dir, base_name)
                        with open(dest_path, 'wb') as f:
                            f.write(file_content)
                        result['installed_files'].append(dest_path)
                        logger.log(f"Extracted {file_name} → {dest_path}")

                    elif base_name.lower().startswith('userstats_') and file_name_lower.endswith('.bin'):
                        dest_path = os.path.join(stats_export_dir, base_name)
                        with open(dest_path, 'wb') as f:
                            f.write(file_content)
                        result['installed_files'].append(dest_path)
                        logger.log(f"Extracted {file_name} → {dest_path}")

                    elif file_name_lower.endswith('.json'):
                        dest_path = os.path.join(stplug_in_dir, base_name)
                        with open(dest_path, 'wb') as f:
                            f.write(file_content)
                        result['installed_files'].append(dest_path)
                        logger.log(f"Extracted {file_name} → {dest_path}")

                    else:
                        logger.log(f"Skipping unknown file type in archive: {file_name}")

                except Exception as exc:
                    logger.error(f"Failed to extract {file_name}: {exc}")
                    continue

            if not lua_files_found:
                result['error'] = "No .lua files found in archive"
                logger.log(f"Manilua archive for {appid} did not contain any .lua files")
                return result

            result['lua_content'] = lua_files_found[0]
            result['success'] = True
            logger.log(f"Successfully extracted {len(result['installed_files'])} files from Manilua archive for {appid}")

    except zipfile.BadZipFile as exc:
        result['error'] = f"Invalid ZIP file: {exc}"
        logger.error(f"Manilua archive for {appid} is not a valid ZIP: {exc}")
    except Exception as exc:
        result['error'] = f"Failed to extract archive: {exc}"
        logger.error(f"Failed to process Manilua archive for {appid}: {exc}")

    return result


def download_lua_manifest_manilua(appid: str, api_key: str) -> tuple[Optional[str], Optional[int]]:
    try:
        client = get_global_client()

        result = client.get_binary(
            f"{MANILUA_API_BASE}/game/{appid}",
            params={'appid': appid},
            auth_token=api_key
        )

        if not result['success']:
            status_code = result.get('status_code')
            if status_code == 401:
                logger.log("Manilua mirror rejected the configured API key.")
            elif status_code == 404:
                logger.log(f"Game {appid} not found on Manilua mirror.")
            elif status_code:
                logger.log(f"Manilua mirror returned HTTP {status_code} for {appid}")
            else:
                logger.log(f"Manilua mirror request failed: {result.get('error', 'Unknown error')}")
            return None, status_code

        content_type = (result.get("content_type") or "").lower()
        raw = result['data']

        if content_type.startswith("application/json"):
            try:
                data = json.loads(raw.decode("utf-8", errors="replace"))
                logger.log(f"Manilua mirror returned an error for {appid}: {data}")
                error_msg = str(data).lower()
                if 'authentication' in error_msg or 'unauthorized' in error_msg:
                    logger.log("API key authentication failed (from JSON response)")
            except json.JSONDecodeError:
                logger.log(f"Manilua mirror returned a JSON error for {appid}, but it could not be parsed.")
            return None, None

        if content_type.startswith("application/zip") or raw[:2] == b"PK":
            extract_result = _extract_manilua_archive(appid, raw)
            if extract_result['success']:
                return extract_result['lua_content'], None
            else:
                logger.log(f"Archive extraction failed: {extract_result.get('error', 'Unknown error')}")
                return None, None

        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("utf-8", errors="replace")

        return text if text.strip() else None, None
    except Exception as exc:
        logger.log(f"Failed to download manifest from Manilua mirror for {appid}: {exc}")
        return None, None


def _mask_api_key(value: str) -> str:
    trimmed = value.strip()
    if len(trimmed) <= 4:
        return '*' * len(trimmed)
    prefix = trimmed[:4]
    suffix = trimmed[-2:] if len(trimmed) > 6 else ''
    return f"{prefix}{'*' * max(0, len(trimmed) - len(prefix) - len(suffix))}{suffix}"


def _build_manifest_urls(appid: str, extension: str) -> list[str]:
    return [template.format(appid=appid, extension=extension) for template in MANIFEST_URLS]


def _get_from_cache(key: str) -> Optional[Any]:
    if key in _cache:
        value, expiry_time = _cache[key]
        if time.time() < expiry_time:
            return value
        else:
            del _cache[key]
    return None


def _set_to_cache(key: str, value: Any) -> None:
    _cache[key] = (value, time.time() + CACHE_EXPIRY_SECONDS)

def _download_text(urls: list[str]) -> Optional[str]:
    client = get_global_client()

    for url in urls:
        try:
            result = client.get_text(
                url,
                accept="text/plain, application/json, */*",
                use_steam_verification=False
            )

            if result['success']:
                return result['data']

            status_code = result.get('status_code')
            if status_code:
                logger.log(f"HTTP {status_code} for {url}")
            else:
                logger.log(f"Failed request {url}: {result.get('error', 'Unknown error')}")
        except Exception as exc:
            logger.log(f"Failed request {url}: {exc}")

    return None


def download_lua_manifest_text(appid: str, mirror: str = 'default') -> tuple[Optional[str], Optional[int]]:
    if mirror == 'manilua':
        api_key = get_plugin().get_api_key()
        if not api_key:
            return None, None
        try:
            client = get_global_client()
            result = client.get_binary(
                f"{MANILUA_API_BASE}/game/{appid}",
                params={'appid': appid},
                auth_token=api_key
            )

            if not result['success']:
                return None, result.get('status_code')

            content_type = (result.get("content_type") or "").lower()
            raw = result['data']

            if content_type.startswith("application/zip") or raw[:2] == b"PK":
                with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                    for file_name in archive.namelist():
                        if file_name.endswith('.lua'):
                            with archive.open(file_name) as f:
                                decoded = f.read().decode('utf-8')
                                return decoded, None
                    return None, None
            else:
                text = raw.decode("utf-8")
                return text if text.strip() else None, None
        except Exception:
            return None, None
    else:
        content = _download_text(_build_manifest_urls(appid, '.lua'))
        return content, None

def download_lua_manifest(appid: str, mirror: str = 'default') -> Optional[str]:
    mirror_key = mirror or 'default'
    cache_key = f'lua_{mirror_key}_{appid}'
    cached = _get_from_cache(cache_key)
    if cached is not None:
        logger.log(f"Using cached lua manifest for {appid}")
        return cached
    if mirror_key == 'manilua':
        api_key = get_plugin().get_api_key()
        if not api_key:
            logger.log("Manilua mirror requested but API key is not configured.")
            return None
        result, _ = download_lua_manifest_manilua(appid, api_key)
    else:
        result = _download_text(_build_manifest_urls(appid, '.lua'))

    if result is not None:
        _set_to_cache(cache_key, result)
    return result


def download_json_manifest(appid: str) -> Optional[dict[str, Any]]:
    cache_key = f'json_{appid}'
    cached = _get_from_cache(cache_key)
    if cached is not None:
        logger.log(f"Using cached JSON manifest for {appid}")
        return cached

    raw = _download_text(_build_manifest_urls(appid, '.json'))
    if not raw:
        return None
    try:
        result = json.loads(raw)
        _set_to_cache(cache_key, result)
        return result
    except Exception as exc:
        logger.log(f'Failed to parse JSON manifest for {appid}: {exc}')
        return None


def build_dlc_lua_from_manifest(manifest: dict[str, Any], dlc_appid: str) -> Optional[str]:
    depot = manifest.get('depot')
    if not isinstance(depot, dict):
        return None
    dlc_info = depot.get(dlc_appid)
    if dlc_info is None and dlc_appid.isdigit():
        dlc_info = depot.get(int(dlc_appid))
    if not isinstance(dlc_info, dict):
        return None

    key = str(dlc_info.get('decryptionkey') or '').strip()
    manifests = dlc_info.get('manifests')
    manifest_id = ''
    if isinstance(manifests, dict):
        public_branch = manifests.get('public')
        if isinstance(public_branch, dict):
            manifest_id = str(public_branch.get('gid') or '').strip()

    lines: list[str] = []
    if key:
        lines.append(f'addappid({dlc_appid},0,"{key}")')
    else:
        lines.append(f'addappid({dlc_appid})')
    if manifest_id:
        lines.append(f'setManifestid({dlc_appid},"{manifest_id}")')
    if not lines:
        return None
    return '\n'.join(lines) + '\n'


def fetch_game_info(appid: str) -> Optional[dict[str, Any]]:
    url = STEAMUI_APPINFO.format(appid=appid)
    try:
        response = requests.get(url, timeout=HTTP_TIMEOUT)
        if response.status_code != 200:
            logger.log(f"Steam API returned {response.status_code} for {appid}")
            return None
        json_data = response.json()
        if str(appid) not in json_data or not json_data[str(appid)].get('success', False):
            logger.log(f"Steam API query failed for {appid}")
            return None
        app_data = json_data[str(appid)]['data']
        dlc_list = app_data.get('dlc', [])
        related_content = []

        if isinstance(dlc_list, list) and dlc_list:
            dlc_ids = [str(dlc_id) for dlc_id in dlc_list if isinstance(dlc_id, (int, str))]
            # Fetch DLC names individually
            for dlc_id in dlc_ids:
                try:
                    dlc_url = f"https://store.steampowered.com/api/appdetails?appids={dlc_id}&cc=en"
                    dlc_response = requests.get(dlc_url, timeout=HTTP_TIMEOUT)
                    if dlc_response.status_code == 200:
                        dlc_json = dlc_response.json()
                        if dlc_id in dlc_json and dlc_json[dlc_id].get('success', False):
                            name = dlc_json[dlc_id]['data'].get('name', f'DLC {dlc_id}')
                            related_content.append({'appid': dlc_id, 'name': name, 'type': 'dlc'})
                        else:
                            related_content.append({'appid': dlc_id, 'name': f'DLC {dlc_id}', 'type': 'dlc'})
                    else:
                        related_content.append({'appid': dlc_id, 'name': f'DLC {dlc_id}', 'type': 'dlc'})
                except Exception as exc:
                    logger.warn(f"Error fetching name for DLC {dlc_id}: {exc}")
                    related_content.append({'appid': dlc_id, 'name': f'DLC {dlc_id}', 'type': 'dlc'})
        return {
            'related_content': related_content,
            'type': app_data.get('type', ''),
            'name': app_data.get('name', '')
        }
    except Exception as exc:
        logger.log(f"Steam API error for {appid}: {exc}")
        return None


def _ensure_directory(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def get_manifest_path(appid: str) -> str:
    steam_path = getSteamPath()
    plugin_dir = os.path.join(steam_path, 'config', 'stplug-in')
    return os.path.join(plugin_dir, f'{appid}.lua')


def clean_lua_content(content: str) -> str:
    lines = content.split('\n')
    cleaned_lines = []

    remove_patterns = [
        r'--\s*manifest\s*(&|and)\s*lua\s*provided\s*by',
        r'--\s*via\s+manilua',
        r'--\s*https?://',
        r'--\s*provided\s+by',
        r'--\s*source:',
        r'^--\s*dlc\s*$',
    ]

    for line in lines:
        stripped = line.strip()

        if not stripped:
            continue

        should_remove = False
        if stripped.startswith('--'):
            for pattern in remove_patterns:
                if re.search(pattern, stripped, re.IGNORECASE):
                    should_remove = True
                    break

        if should_remove:
            continue

        cleaned_lines.append(line)

    return '\n'.join(cleaned_lines)


def write_lua_file(appid: str, content: str) -> str:
    target_path = get_manifest_path(appid)
    plugin_dir = os.path.dirname(target_path)
    _ensure_directory(plugin_dir)

    cleaned_content = clean_lua_content(content)

    with open(target_path, 'w', encoding='utf-8') as handle:
        normalized = cleaned_content.rstrip('\r\n')
        if normalized:
            handle.write(normalized + '\n')
        else:
            handle.write('')
    return target_path


def remove_dlc_entries_from_content(content: str, dlcs_to_remove: set[str], main_appid: str) -> str:
    lines = content.split('\n')
    filtered_lines = []
    removed_dlc_ids: set[str] = set()

    for line in lines:
        stripped = line.strip()

        if 'addtoken' in line:
            match = re.search(r'addtoken\((\d+)', line)
            if match and match.group(1) in removed_dlc_ids:
                continue
            filtered_lines.append(line)
            continue

        if 'addappid' in line:
            match = re.search(r'addappid\((\d+)', line)
            if match:
                found_id = match.group(1)

                if found_id == main_appid:
                    filtered_lines.append(line)
                    continue

                has_key = ',"' in line or ', "' in line
                has_comment = '--' in line and line.index('--') > line.index('addappid')

                if has_key and not has_comment:
                    filtered_lines.append(line)
                    continue

                if has_comment:
                    removed_dlc_ids.add(found_id)
                    continue

                removed_dlc_ids.add(found_id)
                continue

        filtered_lines.append(line)

    return '\n'.join(filtered_lines).rstrip('\r\n')


def fetch_dlc_decryption_keys(dlc_ids: list[str], main_appid: str, main_game_json: Optional[dict[str, Any]] = None, mirror: str = 'default') -> dict[str, str]:
    keys: dict[str, str] = {}
    wanted = [d for d in dlc_ids if d and d.isdigit()]
    if not wanted:
        return keys

    if mirror != 'manilua':
        try:
            if main_game_json is None:
                main_game_json = download_json_manifest(main_appid)
            if main_game_json:
                depot = main_game_json.get('depot', {}) or {}
                for dlc_id in wanted:
                    d = depot.get(dlc_id)
                    if d is None and dlc_id.isdigit():
                        d = depot.get(int(dlc_id))
                    if isinstance(d, dict):
                        key = str(d.get('decryptionkey') or '').strip()
                        if key:
                            keys[dlc_id] = key
        except Exception as exc:
            logger.log(f'fetch_dlc_decryption_keys: main JSON scan failed: {exc}')

    if mirror == 'manilua':
        for dlc_id in wanted:
            if dlc_id in keys:
                continue
            try:
                lua = download_lua_manifest(dlc_id, 'manilua')
                if not lua:
                    continue
                m = re.search(rf'addappid\(\s*{re.escape(dlc_id)}\s*,\s*\d+\s*,\s*"([^"]+)"\s*\)', lua)
                if not m:
                    m = re.search(rf'addappid\(\s*{re.escape(dlc_id)}\s*,\s*"([^"]+)"\s*\)', lua)
                if m:
                    key = m.group(1).strip()
                    if key:
                        keys[dlc_id] = key
            except Exception as exc:
                logger.log(f'fetch_dlc_decryption_keys: manilua parse failed for {dlc_id}: {exc}')

    remaining = [d for d in wanted if d not in keys]
    if remaining and mirror != 'manilua':
        def _get_key_from_dlc_json(dlc_id: str) -> tuple[str, Optional[str]]:
            try:
                j = download_json_manifest(dlc_id)
                if not j:
                    return dlc_id, None
                depot = j.get('depot', {}) or {}
                d = depot.get(dlc_id)
                if d is None and dlc_id.isdigit():
                    d = depot.get(int(dlc_id))
                if isinstance(d, dict):
                    key = str(d.get('decryptionkey') or '').strip()
                    return dlc_id, key or None
                return dlc_id, None
            except Exception as exc:
                logger.log(f'fetch_dlc_decryption_keys: dlc JSON failed for {dlc_id}: {exc}')
                return dlc_id, None

        with ThreadPoolExecutor(max_workers=min(5, len(remaining))) as ex:
            futures = [ex.submit(_get_key_from_dlc_json, d) for d in remaining]
            for fut in as_completed(futures):
                dlc_id, key = fut.result()
                if key:
                    keys[dlc_id] = key

    return keys

def extract_dlc_metadata_from_lua(content: str, main_appid: str) -> dict[str, dict[str, Any]]:
    dlc_metadata: dict[str, dict[str, Any]] = {}
    lines = content.split('\n')
    in_dlc_section = False

    for i, line in enumerate(lines):
        stripped = line.strip()

        if stripped.startswith('--') and 'dlc' in stripped.lower() and 'addappid' not in stripped:
            in_dlc_section = True
            continue

        match = re.search(r'addappid\((\d+)', stripped)
        if not match:
            continue

        found_id = match.group(1)

        if found_id == main_appid:
            continue

        has_key = ',"' in line or ', "' in line
        has_comment = '--' in line and line.index('--') > line.index('addappid')

        if has_key and not has_comment:
            continue

        if not has_comment and not in_dlc_section:
            continue

        name = None
        comment = None
        if has_comment:
            comment_part = line.split('--', 1)[1].strip()
            comment = comment_part
            for prefix in ['DLC:', 'dlc:', 'DLC', 'dlc']:
                if comment_part.startswith(prefix):
                    comment_part = comment_part[len(prefix):].strip()
                    break
            if comment_part:
                name = comment_part

        if not name:
            name = f'DLC {found_id}'

        dlc_metadata[found_id] = {
            'name': name,
            'comment': comment,
            'has_key': has_key,
            'token': None
        }

    for line in lines:
        stripped = line.strip()
        if 'addtoken' not in line:
            continue

        match = re.search(r'addtoken\((\d+)\s*,\s*"([^"]+)"\s*\)', stripped)
        if match:
            token_id = match.group(1)
            token_value = match.group(2)

            if token_id in dlc_metadata:
                dlc_metadata[token_id]['token'] = token_value

    return dlc_metadata


def parse_dlc_from_lua(content: str, main_appid: str) -> list[dict[str, Any]]:
    metadata = extract_dlc_metadata_from_lua(content, main_appid)
    dlc_list: list[dict[str, Any]] = []

    for appid, data in metadata.items():
        dlc_list.append({
            'appid': appid,
            'name': data['name'],
            'source': 'manilua'
        })

    return dlc_list


def collect_dlc_candidates(appid: str, mirror: str = 'default') -> list[dict[str, Any]]:
    info = fetch_game_info(appid)
    if not info:
        return []
    related = info.get('related_content') or []
    steam_path = getSteamPath()
    plugin_dir = os.path.join(steam_path, 'config', 'stplug-in')

    app_type = (info.get('type') or '').lower()
    is_application = app_type == 'application'

    main_file = get_manifest_path(appid)
    installed_dlc_ids = set()
    manilua_dlc_list: list[dict[str, Any]] = []

    if mirror == 'manilua' and get_plugin().get_api_key():

        user_installed_dlcs = set()
        if os.path.isfile(main_file):
            try:
                with open(main_file, 'r', encoding='utf-8') as f:
                    local_content = f.read()
                    for match in re.finditer(r'addappid\((\d+)', local_content):
                        found_id = match.group(1)
                        if found_id != appid:
                            logger.log(f"Found addappid in file: {found_id}")

                    local_dlc_list = parse_dlc_from_lua(local_content, appid)
                    local_dlc_appids = [d['appid'] for d in local_dlc_list]
                    user_installed_dlcs = set(local_dlc_appids)
                    logger.log(f"DLC list from local file for {appid} (user installed): {local_dlc_appids} ({len(local_dlc_appids)} items)")
            except Exception as e:
                logger.log(f"Error reading {main_file}: {e}")

        logger.log(f"Fetching DLC list text from Manilua API for {appid}")
        manilua_content, _ = download_lua_manifest_text(appid, 'manilua')
        if manilua_content:
            logger.log(f"Downloaded Manilua manifest text for {appid} ({len(manilua_content)} chars)")
            manilua_dlc_list = parse_dlc_from_lua(manilua_content, appid)
            logger.log(f"Found {len(manilua_dlc_list)} DLC in Manilua manifest")
        else:
            logger.log(f"Failed to download Manilua manifest text for {appid}, using local file as fallback")
            manilua_dlc_list = parse_dlc_from_lua(local_content, appid) if 'local_content' in locals() else []

        installed_dlc_ids.update(user_installed_dlcs)
    elif os.path.isfile(main_file):
        try:
            with open(main_file, 'r', encoding='utf-8') as f:
                content = f.read()
                logger.log(f"Reading {main_file}, content length: {len(content)}")

                for match in re.finditer(r'addappid\((\d+)', content):
                    found_id = match.group(1)
                    logger.log(f"Found addappid({found_id}...) in file, main appid={appid}")
                    if found_id != appid:
                        installed_dlc_ids.add(found_id)
                        logger.log(f"Added {found_id} to installed_dlc_ids")

                manilua_dlc_list = parse_dlc_from_lua(content, appid)
                logger.log(f"Found {len(manilua_dlc_list)} DLC in Manilua file")
                logger.log(f"Total installed DLC IDs: {installed_dlc_ids}")
        except Exception as e:
            logger.log(f"Error reading {main_file}: {e}")
    else:
        logger.log(f"File does not exist: {main_file}")

    main_game_json = None
    if is_application:
        main_game_json = download_json_manifest(appid)
        if main_game_json:
            logger.log(f"Loaded main game JSON manifest for {appid}")

    dlc_items: list[tuple[str, str]] = []
    for item in related:
        if not isinstance(item, dict):
            continue
        item_type = (item.get('type') or '').lower()
        if item_type != 'dlc':
            continue
        dlc_appid = str(item.get('appid') or '').strip()
        if not dlc_appid:
            continue
        name = item.get('name') or f'DLC {dlc_appid}'
        dlc_items.append((dlc_appid, name))

    dlc_keys_map: dict[str, str] = {}
    if is_application:
        dlc_ids = [dlc_id for dlc_id, _ in dlc_items]
        dlc_keys_map = fetch_dlc_decryption_keys(dlc_ids, appid, main_game_json)

    candidates: list[dict[str, Any]] = []
    steamui_dlc_ids = set()

    for dlc_appid, name in dlc_items:
        steamui_dlc_ids.add(dlc_appid)

        decryption_key = dlc_keys_map.get(dlc_appid)

        if is_application and not decryption_key:
            logger.log(f"Skipping DLC {dlc_appid} ({name}) - no decryption key found")
            continue

        already_installed = dlc_appid in installed_dlc_ids
        logger.log(f"DLC {dlc_appid} ({name}): alreadyInstalled={already_installed}, key={'present' if decryption_key else 'none'}")

        candidate_data = {
            'appid': dlc_appid,
            'name': name,
            'alreadyInstalled': already_installed,
        }
        if decryption_key:
            candidate_data['decryptionKey'] = decryption_key

        candidates.append(candidate_data)

    for manilua_dlc in manilua_dlc_list:
        dlc_appid = manilua_dlc['appid']
        if dlc_appid not in steamui_dlc_ids:
            logger.log(f"Adding Manilua-only DLC {dlc_appid} ({manilua_dlc['name']}) to candidates")
            already_installed = dlc_appid in installed_dlc_ids
            candidates.append({
                'appid': dlc_appid,
                'name': manilua_dlc['name'],
                'alreadyInstalled': already_installed,
                'source': 'manilua'
            })

    return candidates


def extract_appid(raw: str) -> Optional[str]:
    text = raw.strip()
    if not text:
        return None
    if text.isdigit():
        return text
    match = re.search(r'store\.steampowered\.com/app/(\d+)/', text)
    if match:
        return match.group(1)
    match = re.match(r'(\d+)\s*-', text)
    if match:
        return match.group(1)
    return None


def process_lua_content(lua_content: str, json_data: dict[str, Any]) -> str:
    import re

    lines = lua_content.split('\n')
    filtered_lines = []

    depot_data = json_data.get('depot', {})
    workshop_key = depot_data.get('workshopdepotdecryptionkey', '')
    main_appid = str(json_data.get('appid', ''))

    for line in lines:
        stripped = line.strip()

        if stripped.startswith('setManifestid'):
            continue

        if 'addappid(' in line:
            pattern = r'addappid\((\d+)(?:,\s*(\d+))?\)'
            match = re.search(pattern, line)

            if match:
                appid_in_lua = match.group(1)
                second_param = match.group(2) or '0'

                if not re.search(r'"[^"]+"', line):
                    key = ''

                    if appid_in_lua == main_appid and workshop_key:
                        key = workshop_key
                    else:
                        depot_info = depot_data.get(appid_in_lua, {})
                        if isinstance(depot_info, dict):
                            key = depot_info.get('decryptionkey', '')

                    if key:
                        new_call = f'addappid({appid_in_lua},{second_param},"{key}")'
                        line = line.replace(match.group(0), new_call)

        filtered_lines.append(line)

    return '\n'.join(filtered_lines)

def install_manifest_for_app(appid: str) -> dict[str, Any]:
    result: dict[str, Any] = {'success': False, 'dlc': [], 'appid': appid}

    existing_file = get_manifest_path(appid)
    file_exists = os.path.isfile(existing_file)

    if file_exists:
        logger.log(f"Manifest for {appid} already exists at {existing_file}")
        result['success'] = True
        msg = create_message('backend.manifestAlreadyExists', 'Manifest already exists')
        result.update(msg)
        result['dlc'] = collect_dlc_candidates(appid)
        return result

    lua_content = download_lua_manifest(appid)
    if not lua_content:
        info = fetch_game_info(appid)
        if info:
            name = info.get('name') or 'Unknown'
            msg = create_message('backend.manifestNotAvailablePublic', f"Manifest for {appid} ({name}) is not available on the public mirrors.", appid=appid, name=name)
        else:
            msg = create_message('backend.manifestNotAvailablePublicNoName', f"Manifest for {appid} is not available on the public mirrors.", appid=appid)
        result.update(msg)
        return result

    json_data = download_json_manifest(appid)
    if not json_data:
        logger.log(f"JSON manifest not available for {appid}, saving raw lua")
        target = write_lua_file(appid, lua_content)
        result['success'] = True
        msg = create_message('backend.manifestSavedNoJson', f"Manifest saved to {target} (no JSON processing)", target=target)
        result.update(msg)
        result['dlc'] = collect_dlc_candidates(appid)
        return result

    processed_content = process_lua_content(lua_content, json_data)
    target = write_lua_file(appid, processed_content)

    result['success'] = True
    msg = create_message('backend.manifestSaved', f"Manifest saved to {target}", target=target)
    result.update(msg)
    result['dlc'] = collect_dlc_candidates(appid)
    return result


class Backend:

    @staticmethod
    def print(message: str):
        logger.log(message)
        return True

    @staticmethod
    def checkpirated(id: str):
        manifest_path = get_manifest_path(id)
        return os.path.exists(manifest_path)

    @staticmethod
    def delete_lua(id: str):
        removed_files = []
        errors = []

        stplug_in_dir = get_stplug_in_path()
        lua_file = os.path.join(stplug_in_dir, f'{id}.lua')

        depot_ids = set()
        if os.path.isfile(lua_file):
            try:
                with open(lua_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    for match in re.finditer(r'addappid\((\d+)', content):
                        depot_ids.add(match.group(1))
                    logger.log(f"Found {len(depot_ids)} depot IDs in {lua_file}: {depot_ids}")
            except Exception as exc:
                logger.log(f"Failed to read {lua_file} for depot ID extraction: {exc}")

        if os.path.isfile(lua_file):
            try:
                os.remove(lua_file)
                removed_files.append(lua_file)
                logger.log(f"Removed {lua_file}")
            except Exception as exc:
                errors.append(f"Failed to remove {lua_file}: {exc}")
                logger.log(errors[-1])

        depotcache_dir = get_depotcache_path()
        if os.path.isdir(depotcache_dir) and depot_ids:
            try:
                for filename in os.listdir(depotcache_dir):
                    if not filename.endswith('.manifest'):
                        continue

                    for depot_id in depot_ids:
                        if filename.startswith(f'{depot_id}_'):
                            manifest_file = os.path.join(depotcache_dir, filename)
                            try:
                                os.remove(manifest_file)
                                removed_files.append(manifest_file)
                                logger.log(f"Removed {manifest_file}")
                            except Exception as exc:
                                errors.append(f"Failed to remove {manifest_file}: {exc}")
                                logger.log(errors[-1])
                            break
            except Exception as exc:
                errors.append(f"Failed to scan depotcache directory: {exc}")
                logger.log(errors[-1])

        stats_export_dir = get_stats_export_path()
        if os.path.isdir(stats_export_dir) and depot_ids:
            try:
                for filename in os.listdir(stats_export_dir):
                    if not filename.lower().endswith('.bin'):
                        continue

                    for depot_id in depot_ids:
                        if filename.lower().startswith(f'userstats_{depot_id}_'):
                            bin_file = os.path.join(stats_export_dir, filename)
                            try:
                                os.remove(bin_file)
                                removed_files.append(bin_file)
                                logger.log(f"Removed {bin_file}")
                            except Exception as exc:
                                errors.append(f"Failed to remove {bin_file}: {exc}")
                                logger.log(errors[-1])
                            break
            except Exception as exc:
                errors.append(f"Failed to scan StatsExport directory: {exc}")
                logger.log(errors[-1])

        json_file = os.path.join(stplug_in_dir, f'{id}.json')
        if os.path.isfile(json_file):
            try:
                os.remove(json_file)
                removed_files.append(json_file)
                logger.log(f"Removed {json_file}")
            except Exception as exc:
                errors.append(f"Failed to remove {json_file}: {exc}")
                logger.log(errors[-1])

        if removed_files:
            logger.log(f"Successfully removed {len(removed_files)} file(s) for {id}")
            return True
        elif errors:
            logger.log(f"Failed to remove files for {id}: {'; '.join(errors)}")
            return False
        else:
            logger.log(f"No files found for {id}")
            return False

    @staticmethod
    def restart():
        steampath = getSteamPath()
        cmd = f'taskkill /f /im steam.exe && start "" "{steampath}\\steam.exe"'
        DETACHED_PROCESS = 0x00000008
        CREATE_NO_WINDOW = 0x08000000
        flags = DETACHED_PROCESS | CREATE_NO_WINDOW
        subprocess.Popen(cmd, shell=True, creationflags=flags)
        return True

    @staticmethod
    def has_manilua_api_key(payload: Any = None, **kwargs) -> dict[str, Any]:
        return {'success': get_plugin().has_api_key(), 'configured': get_plugin().has_api_key()}

    @staticmethod
    def get_manilua_api_status(payload: Any = None, **kwargs) -> dict[str, Any]:
        try:
            api_key = get_plugin().get_api_key()

            if not api_key:
                msg = create_message('backend.apiKeyNotConfigured', 'No API key configured.')
                return {
                    'success': True,
                    'hasKey': False,
                    'maskedKey': '',
                    **msg,
                }

            masked = _mask_api_key(api_key)
            msg = create_message('backend.apiKeyConfigured', 'API key is configured.')

            return {
                'success': True,
                'hasKey': True,
                'isValid': True,
                'maskedKey': masked,
                **msg,
            }
        except Exception as exc:
            logger.log(f"Failed to retrieve Manilua API key status: {exc}")
            return {'success': False, 'error': str(exc)}

    @staticmethod
    def set_manilua_api_key(payload: Any = None, **kwargs) -> dict[str, Any]:
        try:
            data: dict[str, Any] = {}
            if isinstance(payload, dict):
                data.update(payload)
            if kwargs:
                data.update(kwargs)
            api_key = data.get('api_key')
            if not api_key or not isinstance(api_key, str):
                msg = create_message('backend.apiKeyRequired', 'API key is required.')
                return {'success': False, **msg}
            candidate = api_key.strip()
            if not candidate:
                msg = create_message('backend.apiKeyRequired', 'API key is required.')
                return {'success': False, **msg}
            if not candidate.startswith(MANILUA_API_KEY_PREFIX):
                msg = create_message('backend.apiKeyMustStartWith', f'API key must start with {MANILUA_API_KEY_PREFIX}.', prefix=MANILUA_API_KEY_PREFIX)
                return {'success': False, **msg}
            get_plugin().set_api_key(candidate)
            logger.log('Manilua API key stored.')

            msg = create_message('backend.apiKeySaved', 'API key saved successfully.')
            return {'success': True, **msg}
        except Exception as exc:
            logger.log(f"Failed to save Manilua API key: {exc}")
            return {'success': False, 'error': str(exc)}

    @staticmethod
    def get_dlc_list(payload: Any = None, **kwargs) -> dict[str, Any]:
        data: dict[str, Any] = {}
        if isinstance(payload, dict):
            data.update(payload)
        elif payload is not None:
            data['appid'] = payload
        if kwargs:
            data.update(kwargs)

        appid = str(data.get('appid') or '').strip()
        if not appid:
            appid = extract_appid(str(payload or ''))

        if not appid:
            msg = create_message('backend.couldNotDetermineAppid', 'Could not determine AppID.')
            logger.log(msg['details'])
            return {'success': False, **msg, 'dlc': [], 'appid': ''}

        mirror = str(data.get('mirror') or 'default').strip() or 'default'

        manifest_content, status_code = download_lua_manifest_text(appid, mirror)
        if mirror == 'manilua' and not manifest_content:
            info = fetch_game_info(appid)
            if status_code == 401:
                msg = create_message('backend.apiKeyRejectedManilua', "API key is rejected by the Manilua mirror. Please check your API key.", appid=appid)
            elif status_code == 404:
                if info:
                    name = info.get('name') or 'Unknown'
                    msg = create_message('backend.manifestNotFoundManilua', f"Manifest for {name} ({appid}) not found on the Manilua mirror.", appid=appid, name=name)
                else:
                    msg = create_message('backend.manifestNotFoundManiluaNoName', f"Manifest for {appid} not found on the Manilua mirror.", appid=appid)
            else:
                # Other errors, generic message
                if info:
                    name = info.get('name') or 'Unknown'
                    msg = create_message('backend.manifestNotAvailableManilua', f"Manifest for {name} ({appid}) is not available via the Manilua mirror. Please check your API key.", name=name, appid=appid)
                else:
                    msg = create_message('backend.manifestNotAvailableManiluaNoName', f"Manifest for {appid} is not available via the Manilua mirror. Please check your API key.", appid=appid)
            logger.log(msg['details'])
            return {'success': False, **msg, 'dlc': [], 'appid': appid}

        result: dict[str, Any] = {'success': True, 'dlc': [], 'appid': appid}
        result['dlc'] = collect_dlc_candidates(appid, mirror)
        return result

    @staticmethod
    def receive_frontend_message(message: str):
        appid = extract_appid(message)
        if not appid:
            msg = create_message('backend.couldNotDetermineAppidFromMessage', 'Could not determine AppID from message.')
            logger.log(msg['details'])
            return {'success': False, **msg}

        result = install_manifest_for_app(appid)
        return result

    @staticmethod
    def install_dlcs(payload: Any = None, **kwargs) -> dict[str, Any]:
        data: dict[str, Any] = {}
        if isinstance(payload, dict):
            data.update(payload)
        elif payload is not None:
            data['appid'] = payload
        if kwargs:
            data.update(kwargs)

        appid = str(data.get('appid') or '').strip()
        requested_raw = data.get('dlcs') or []
        if not isinstance(requested_raw, list):
            requested_raw = [requested_raw]
        requested: list[str] = []
        for dlc in requested_raw:
            candidate = str(dlc).strip()
            if candidate and candidate.isdigit():
                requested.append(candidate)

        mirror = str(data.get('mirror') or 'default').strip() or 'default'
        logger.log(f'install_dlcs: appid={appid} mirror={mirror} requested={requested}')

        if not appid:
            msg = create_message('backend.couldNotDetermineAppid', 'Could not determine AppID.')
            logger.log(msg['details'])
            return {'success': False, **msg, 'installed': [], 'failed': requested}

        if mirror == 'manilua' and not get_plugin().get_api_key():
            msg = create_message('backend.maniluaRequiresApiKey', 'The Manilua mirror requires a valid API key.')
            logger.log(msg['details'])
            return {'success': False, **msg, 'installed': [], 'failed': requested}

        base_game_path = get_manifest_path(appid)
        if not os.path.isfile(base_game_path):
            logger.log(f'Base game manifest not found, downloading for {appid} via mirror={mirror}')
            lua_content = download_lua_manifest(appid, mirror)
            if not lua_content:
                if mirror == 'manilua':
                    msg = create_message('backend.manifestNotAvailableManiluaNoName',
                                         f'Manifest for {appid} is not available via the Manilua mirror. Please verify your API key.',
                                         appid=appid)
                else:
                    msg = create_message('backend.manifestNotAvailablePublicNoName',
                                         f'Manifest for {appid} is not available on the public mirrors.',
                                         appid=appid)
                logger.log(msg['details'])
                return {'success': False, **msg, 'installed': [], 'failed': requested}

            json_data = download_json_manifest(appid)
            if json_data:
                lua_content = process_lua_content(lua_content, json_data)
            if mirror == 'manilua':
                lua_content = remove_dlc_entries_from_content(lua_content, set(), appid)

            write_lua_file(appid, lua_content)

        with open(base_game_path, 'r', encoding='utf-8') as handle:
            base_content = handle.read()
        if mirror == 'manilua':
            logger.log(f'Extracting DLC metadata from fresh Manilua manifest for {appid}')
            manilua_fresh_content = download_lua_manifest(appid, 'manilua')
            if manilua_fresh_content:
                manilua_metadata = extract_dlc_metadata_from_lua(manilua_fresh_content, appid)
                logger.log(f'Extracted metadata for {len(manilua_metadata)} DLC from Manilua')
            else:
                logger.log(f'Failed to fetch fresh Manilua manifest, using local file metadata')
                manilua_metadata = extract_dlc_metadata_from_lua(base_content, appid)
        else:
            manilua_metadata = extract_dlc_metadata_from_lua(base_content, appid)
        game_info = fetch_game_info(appid)
        dlc_info_map: dict[str, dict[str, Any]] = {}
        all_available_dlc: set[str] = set()
        app_type = ''
        if game_info:
            app_type = (game_info.get('type') or '').lower()
            related = game_info.get('related_content') or []
            for item in related:
                if isinstance(item, dict) and item.get('type', '').lower() == 'dlc':
                    dlc_appid = str(item.get('appid') or '').strip()
                    if dlc_appid:
                        dlc_info_map[dlc_appid] = item
                        all_available_dlc.add(dlc_appid)
        dlc_keys_map = fetch_dlc_decryption_keys(requested, appid, None, mirror)

        if not requested:
            base_content = remove_dlc_entries_from_content(base_content, None, appid)
        else:
            base_content = remove_dlc_entries_from_content(base_content, set(requested), appid)
        dlc_lines: list[str] = []
        installed_ids: list[str] = []

        for dlc_appid in requested:
            manilua_meta = manilua_metadata.get(dlc_appid)

            if manilua_meta and manilua_meta.get('comment'):
                dlc_lines.append(f"addappid({dlc_appid}) -- {manilua_meta['comment']}")

                if manilua_meta.get('token'):
                    dlc_lines.append(f"addtoken({dlc_appid},\"{manilua_meta['token']}\")")
            else:
                dlc_info = dlc_info_map.get(dlc_appid, {})
                dlc_name = dlc_info.get('name') or f'DLC {dlc_appid}'
                key = dlc_keys_map.get(dlc_appid, '').strip()

                if key:
                    dlc_lines.append(f'addappid({dlc_appid},0,"{key}") -- {dlc_name}')
                else:
                    dlc_lines.append(f'addappid({dlc_appid}) -- {dlc_name}')

            installed_ids.append(dlc_appid)

        final_content = base_content
        if dlc_lines:
            final_content += '\n' + '\n'.join(dlc_lines)

        target = write_lua_file(appid, final_content)

        msg = create_message('backend.dlcAdded',
                             f"Added {len(installed_ids)} DLC to {target}.",
                             count=len(installed_ids), target=target)
        return {'success': True, **msg, 'installed': installed_ids, 'failed': []}


_plugin_instance = None

def get_plugin():
    global _plugin_instance
    if _plugin_instance is None:
        _plugin_instance = Plugin()
    return _plugin_instance

plugin = get_plugin()
