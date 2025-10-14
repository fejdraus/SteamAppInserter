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
    # Fallback for development/testing outside Millennium
    import logging

    class _FallbackLogger:
        def __init__(self) -> None:
            self._logger = logging.getLogger("steamappadder")

        def log(self, msg: str) -> None:
            self._logger.info(msg)

        def warn(self, msg: str) -> None:
            self._logger.warning(msg)

        def error(self, msg: str) -> None:
            self._logger.error(msg)

    logger = _FallbackLogger()

    class Millennium:  # type: ignore
        @staticmethod
        def steam_path():
            return os.path.expandvars(r'%PROGRAMFILES(X86)%\Steam')

        @staticmethod
        def ready():
            pass
_MANILUA_KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "manilua_api_key.txt")
_manilua_api_key: Optional[str] = None

try:
    from steam_verification import get_steam_verification, refresh_steam_verification
    _steam_verification = get_steam_verification()
except Exception:  # pragma: no cover - fallback outside Millennium
    _steam_verification = None
    def refresh_steam_verification() -> None:  # type: ignore
        return None


# Simple in-memory cache with expiry
_cache: dict[str, tuple[Any, float]] = {}


def _get_manilua_key_path() -> str:
    return _MANILUA_KEY_FILE


def _load_manilua_api_key() -> None:
    global _manilua_api_key
    # try:
    #     path = _get_manilua_key_path()
    #     logger.log(f"Loading Manilua API key from: {path}")
    #     if os.path.isfile(path):
    #         with open(path, "r", encoding="utf-8") as handle:
    #             candidate = handle.read().strip()
    #             _manilua_api_key = candidate or None
    #             if _manilua_api_key:
    #                 logger.log(f"Loaded Manilua API key: {_mask_api_key(_manilua_api_key)}")
    #             else:
    #                 logger.log("API key file is empty")
    #     else:
    #         logger.log(f"API key file does not exist: {path}")
    #         _manilua_api_key = None
    # except Exception as exc:
    #     logger.log(f"Failed to load Manilua API key: {exc}")
    #     _manilua_api_key = None


def _save_manilua_api_key(value: Optional[str]) -> None:
    global _manilua_api_key
    path = _get_manilua_key_path()
    try:
        if value:
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(value.strip())
            _manilua_api_key = value.strip()
            purge = [key for key in list(_cache.keys()) if key.startswith('lua_manilua_')]
            for key in purge:
                _cache.pop(key, None)
        else:
            if os.path.isfile(path):
                os.remove(path)
            _manilua_api_key = None
            purge = [key for key in list(_cache.keys()) if key.startswith('lua_manilua_')]
            for key in purge:
                _cache.pop(key, None)
    except Exception as exc:
        logger.log(f"Failed to save Manilua API key: {exc}")
        raise


_load_manilua_api_key()


def getSteamPath() -> str:
    return Millennium.steam_path()


def get_stplug_in_path() -> str:
    """Get path to SteamTools plugin directory (for .lua files)."""
    steam_path = getSteamPath()
    return os.path.join(steam_path, 'config', 'stplug-in')


def get_depotcache_path() -> str:
    """Get path to Steam depotcache directory (for .manifest files)."""
    steam_path = getSteamPath()
    return os.path.join(steam_path, 'config', 'depotcache')


def get_stats_export_path() -> str:
    """Get path to Steam StatsExport directory (for UserStats .bin files)."""
    steam_path = getSteamPath()
    return os.path.join(steam_path, 'config', 'StatsExport')


def create_message(message_code: str, fallback: str, **params) -> dict[str, Any]:
    """
    Create a localized message response.

    Args:
        message_code: The i18n key for the message (e.g., 'backend.manifestAlreadyExists')
        fallback: Fallback English text for backward compatibility
        **params: Parameters for message interpolation

    Returns:
        Dictionary with message_code, message_params, and details (fallback)
    """
    return {
        'message_code': message_code,
        'message_params': params,
        'details': fallback  # Fallback for backward compatibility
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


# Validation removed - following original manilua-plugin v3.2.0 approach
# API key validation now happens only during actual download attempts (401 error handling)


def _extract_manilua_archive(appid: str, archive_bytes: bytes) -> dict[str, Any]:
    """
    Extract Manilua archive and distribute files to appropriate directories.

    Returns:
        Dictionary with 'lua_content' (main .lua file content as string),
        'installed_files' (list of file paths), and 'success' (bool)
    """
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

            # Prepare target directories
            stplug_in_dir = get_stplug_in_path()
            depotcache_dir = get_depotcache_path()
            stats_export_dir = get_stats_export_path()

            _ensure_directory(stplug_in_dir)
            _ensure_directory(depotcache_dir)
            _ensure_directory(stats_export_dir)

            lua_files_found = []

            for file_name in file_list:
                # Skip directories
                if file_name.endswith('/'):
                    continue

                base_name = os.path.basename(file_name)
                file_name_lower = file_name.lower()

                try:
                    file_content = archive.read(file_name)

                    # Route files to appropriate directories
                    if file_name_lower.endswith('.lua'):
                        # .lua files → Steam/config/stplug-in/ (preserve original name)
                        dest_path = os.path.join(stplug_in_dir, base_name)
                        try:
                            decoded = file_content.decode('utf-8')
                            with open(dest_path, 'w', encoding='utf-8') as f:
                                f.write(decoded)
                            lua_files_found.append(decoded)
                        except UnicodeDecodeError:
                            # Fallback to binary write
                            with open(dest_path, 'wb') as f:
                                f.write(file_content)
                            lua_files_found.append(file_content.decode('utf-8', errors='replace'))
                        result['installed_files'].append(dest_path)
                        logger.log(f"Extracted {file_name} → {dest_path}")

                    elif file_name_lower.endswith('.manifest'):
                        # .manifest files → Steam/depotcache/ (preserve original name)
                        dest_path = os.path.join(depotcache_dir, base_name)
                        with open(dest_path, 'wb') as f:
                            f.write(file_content)
                        result['installed_files'].append(dest_path)
                        logger.log(f"Extracted {file_name} → {dest_path}")

                    elif base_name.lower().startswith('userstats_') and file_name_lower.endswith('.bin'):
                        # UserStats .bin files → Steam/config/StatsExport/ (preserve original name)
                        dest_path = os.path.join(stats_export_dir, base_name)
                        with open(dest_path, 'wb') as f:
                            f.write(file_content)
                        result['installed_files'].append(dest_path)
                        logger.log(f"Extracted {file_name} → {dest_path}")

                    elif file_name_lower.endswith('.json'):
                        # .json files → Steam/config/stplug-in/ for metadata processing
                        dest_path = os.path.join(stplug_in_dir, base_name)
                        with open(dest_path, 'wb') as f:
                            f.write(file_content)
                        result['installed_files'].append(dest_path)
                        logger.log(f"Extracted {file_name} → {dest_path}")

                    else:
                        # Unknown file types - log and skip
                        logger.log(f"Skipping unknown file type in archive: {file_name}")

                except Exception as exc:
                    logger.error(f"Failed to extract {file_name}: {exc}")
                    continue

            if not lua_files_found:
                result['error'] = "No .lua files found in archive"
                logger.log(f"Manilua archive for {appid} did not contain any .lua files")
                return result

            # Return the first .lua file content as the main manifest
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


def download_lua_manifest_manilua(appid: str, api_key: str) -> Optional[str]:
    try:
        client = get_global_client()

        # Updated API endpoint: /game/ instead of /file/ (as of manilua-plugin v3.2.0+)
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
            return None

        content_type = (result.get("content_type") or "").lower()
        raw = result['data']

        # Check for JSON error responses (server errors)
        if content_type.startswith("application/json"):
            try:
                data = json.loads(raw.decode("utf-8", errors="replace"))
                logger.log(f"Manilua mirror returned an error for {appid}: {data}")
                # Check for authentication errors in JSON response
                error_msg = str(data).lower()
                if 'authentication' in error_msg or 'unauthorized' in error_msg:
                    logger.log("API key authentication failed (from JSON response)")
            except json.JSONDecodeError:
                logger.log(f"Manilua mirror returned a JSON error for {appid}, but it could not be parsed.")
            return None

        # Handle ZIP archives (extract all files to appropriate directories)
        if content_type.startswith("application/zip") or raw[:2] == b"PK":
            extract_result = _extract_manilua_archive(appid, raw)
            if extract_result['success']:
                return extract_result['lua_content']
            else:
                logger.log(f"Archive extraction failed: {extract_result.get('error', 'Unknown error')}")
                return None

        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("utf-8", errors="replace")

        return text if text.strip() else None
    except Exception as exc:
        logger.log(f"Failed to download manifest from Manilua mirror for {appid}: {exc}")
        return None


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
    """Get value from cache if not expired."""
    if key in _cache:
        value, expiry_time = _cache[key]
        if time.time() < expiry_time:
            return value
        else:
            # Clean up expired entry
            del _cache[key]
    return None


def _set_to_cache(key: str, value: Any) -> None:
    """Store value in cache with expiry time."""
    _cache[key] = (value, time.time() + CACHE_EXPIRY_SECONDS)


def _download_text(urls: list[str]) -> Optional[str]:
    """
    Download text content from public mirrors (GitHub, jsdmirror).
    Uses HTTPClient WITHOUT Steam verification headers since public mirrors don't need them.
    """
    client = get_global_client()

    for url in urls:
        try:
            # Use HTTPClient.get_text() to get raw text, without Steam verification headers
            result = client.get_text(
                url,
                accept="text/plain, application/json, */*",
                use_steam_verification=False  # Public mirrors don't need Steam verification
            )

            if result['success']:
                return result['data']  # Already a string from get_text()

            status_code = result.get('status_code')
            if status_code:
                logger.log(f"HTTP {status_code} for {url}")
            else:
                logger.log(f"Failed request {url}: {result.get('error', 'Unknown error')}")
        except Exception as exc:
            logger.log(f"Failed request {url}: {exc}")

    return None


def download_lua_manifest(appid: str, mirror: str = 'default') -> Optional[str]:
    """Download lua manifest with caching."""
    mirror_key = mirror or 'default'
    cache_key = f'lua_{mirror_key}_{appid}'
    cached = _get_from_cache(cache_key)
    if cached is not None:
        logger.log(f"Using cached lua manifest for {appid}")
        return cached
    if mirror_key == 'manilua':
        if not _manilua_api_key:
            logger.log("Manilua mirror requested but API key is not configured.")
            return None
        result = download_lua_manifest_manilua(appid, _manilua_api_key)
    else:
        result = _download_text(_build_manifest_urls(appid, '.lua'))

    if result is not None:
        _set_to_cache(cache_key, result)
    return result


def download_json_manifest(appid: str) -> Optional[dict[str, Any]]:
    """Download JSON manifest with caching."""
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
    """
    Build DLC lua content from JSON manifest.
    Returns content with both addappid and setManifestid (if available).
    The caller will extract setManifestid lines as needed.
    """
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
    # Note: SteamUI API doesn't require Steam verification headers, use simple requests
    url = STEAMUI_APPINFO.format(appid=appid)
    try:
        response = requests.get(url, timeout=HTTP_TIMEOUT)
        if response.status_code != 200:
            logger.log(f"SteamUI API returned {response.status_code} for {appid}")
            return None
        return response.json()
    except Exception as exc:
        logger.log(f"SteamUI API error for {appid}: {exc}")
        return None


def _ensure_directory(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def get_manifest_path(appid: str) -> str:
    """Get path to manifest file for given appid."""
    steam_path = getSteamPath()
    plugin_dir = os.path.join(steam_path, 'config', 'stplug-in')
    return os.path.join(plugin_dir, f'{appid}.lua')


def write_lua_file(appid: str, content: str) -> str:
    target_path = get_manifest_path(appid)
    plugin_dir = os.path.dirname(target_path)
    _ensure_directory(plugin_dir)
    with open(target_path, 'w', encoding='utf-8') as handle:
        normalized = content.rstrip('\r\n')
        if normalized:
            handle.write(normalized + '\n')
        else:
            handle.write('')
    return target_path


def remove_dlc_entries_from_content(content: str, all_available_dlc: set[str]) -> str:
    """
    Remove existing DLC entries from lua content.
    Removes both comment lines (-- DLC: Name) and their corresponding addappid() calls.
    Also removes addappid() calls for any DLC in all_available_dlc set.
    """
    lines = content.split('\n')
    filtered_lines = []
    skip_next = False

    for line in lines:
        # Skip comment lines that start with "-- DLC:"
        if line.strip().startswith('-- DLC:'):
            skip_next = True
            continue
        # Skip addappid lines for DLC (not main game)
        if skip_next and 'addappid' in line:
            skip_next = False
            continue

        # Remove addappid lines for ALL available DLC (they will be re-added if selected by user)
        if 'addappid' in line:
            match = re.search(r'addappid\((\d+)', line)
            if match and match.group(1) in all_available_dlc:
                # This addappid is for an available DLC, remove it
                continue

        skip_next = False
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

def collect_dlc_candidates(appid: str) -> list[dict[str, Any]]:
    info = fetch_game_info(appid)
    if not info:
        return []
    related = info.get('related_content') or []
    steam_path = getSteamPath()
    plugin_dir = os.path.join(steam_path, 'config', 'stplug-in')

    # Check if main app is type "Application" - requires DLC to have decryption keys
    app_type = (info.get('type') or '').lower()
    is_application = app_type == 'application'

    # Read main game file to check which DLC are already installed
    main_file = get_manifest_path(appid)
    installed_dlc_ids = set()
    if os.path.isfile(main_file):
        try:
            with open(main_file, 'r', encoding='utf-8') as f:
                content = f.read()
                logger.log(f"Reading {main_file}, content length: {len(content)}")
                # Find all addappid() calls in the file (with or without parameters)
                import re
                for match in re.finditer(r'addappid\((\d+)', content):
                    found_id = match.group(1)
                    logger.log(f"Found addappid({found_id}...) in file, main appid={appid}")
                    # Skip main game appid, only count DLC
                    if found_id != appid:
                        installed_dlc_ids.add(found_id)
                        logger.log(f"Added {found_id} to installed_dlc_ids")
                logger.log(f"Total installed DLC IDs: {installed_dlc_ids}")
        except Exception as e:
            logger.log(f"Error reading {main_file}: {e}")
    else:
        logger.log(f"File does not exist: {main_file}")

    # For Application type, load main game JSON manifest for DLC keys
    main_game_json = None
    if is_application:
        main_game_json = download_json_manifest(appid)
        if main_game_json:
            logger.log(f"Loaded main game JSON manifest for {appid}")

    # First pass: collect DLC info
    dlc_items: list[tuple[str, str]] = []  # (dlc_appid, name)
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

    # For Application type: fetch all decryption keys in parallel
    dlc_keys_map: dict[str, str] = {}
    if is_application:
        dlc_ids = [dlc_id for dlc_id, _ in dlc_items]
        dlc_keys_map = fetch_dlc_decryption_keys(dlc_ids, appid, main_game_json)

    # Second pass: build candidates list
    candidates: list[dict[str, Any]] = []
    for dlc_appid, name in dlc_items:
        # Get decryption key (if applicable)
        decryption_key = dlc_keys_map.get(dlc_appid)

        # For Application type, skip DLC without decryption keys
        if is_application and not decryption_key:
            logger.log(f"Skipping DLC {dlc_appid} ({name}) - no decryption key found")
            continue

        # Check if this DLC appid is in the main game file
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
    """
    Process lua content per SteamTools logic:
    1. Remove all setManifestid lines
    2. Add decryptionkey to addappid calls from JSON data
    """
    import re

    lines = lua_content.split('\n')
    filtered_lines = []

    depot_data = json_data.get('depot', {})
    workshop_key = depot_data.get('workshopdepotdecryptionkey', '')
    main_appid = str(json_data.get('appid', ''))

    for line in lines:
        stripped = line.strip()

        # Skip setManifestid lines
        if stripped.startswith('setManifestid'):
            continue

        # Process addappid lines - add decryptionkey if missing
        if 'addappid(' in line:
            # Match: addappid(123) or addappid(123, 0)
            pattern = r'addappid\((\d+)(?:,\s*(\d+))?\)'
            match = re.search(pattern, line)

            if match:
                appid_in_lua = match.group(1)
                second_param = match.group(2) or '0'

                # Check if key already present
                if not re.search(r'"[^"]+"', line):
                    # Get decryptionkey from JSON
                    key = ''

                    # For main appid, use workshopdepotdecryptionkey
                    if appid_in_lua == main_appid and workshop_key:
                        key = workshop_key
                    else:
                        # For depot appids, get decryptionkey from depot info
                        depot_info = depot_data.get(appid_in_lua, {})
                        if isinstance(depot_info, dict):
                            key = depot_info.get('decryptionkey', '')

                    if key:
                        # Replace with: addappid(id, 0, "key")
                        new_call = f'addappid({appid_in_lua},{second_param},"{key}")'
                        line = line.replace(match.group(0), new_call)

        filtered_lines.append(line)

    return '\n'.join(filtered_lines)

# TODO: Это зачем нужно?
def install_manifest_for_app(appid: str) -> dict[str, Any]:
    """
    Install base game manifest per SteamTools logic:
    1. Check if file already exists - if yes, skip download/save but still return DLC list
    2. If not exists: Download .lua and .json for the game
    3. Process lua content (remove setManifestid, add decryptionkey)
    4. Save processed content
    5. Return DLC list for selection (always fetch fresh list from API)
    """
    result: dict[str, Any] = {'success': False, 'dlc': [], 'appid': appid}

    # Check if file already exists
    existing_file = get_manifest_path(appid)
    file_exists = os.path.isfile(existing_file)

    if file_exists:
        logger.log(f"Manifest for {appid} already exists at {existing_file}")
        result['success'] = True
        msg = create_message('backend.manifestAlreadyExists', 'Manifest already exists')
        result.update(msg)
        # Always fetch fresh DLC list from API (may have new DLC)
        result['dlc'] = collect_dlc_candidates(appid)
        return result

    # Download .lua file
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

    # Download .json file
    json_data = download_json_manifest(appid)
    if not json_data:
        logger.log(f"JSON manifest not available for {appid}, saving raw lua")
        target = write_lua_file(appid, lua_content)
        result['success'] = True
        msg = create_message('backend.manifestSavedNoJson', f"Manifest saved to {target} (no JSON processing)", target=target)
        result.update(msg)
        result['dlc'] = collect_dlc_candidates(appid)
        return result

    # Process lua content (SteamTools logic)
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
    def deletelua(id: str):
        """
        Delete all files associated with a game from Manilua archives.
        Removes files from:
        - Steam/config/stplug-in/ (.lua files)
        - Steam/config/depotcache/ (.manifest files for all depot IDs found in .lua)
        - Steam/config/StatsExport/ (UserStats .bin files)
        """
        removed_files = []
        errors = []

        stplug_in_dir = get_stplug_in_path()
        lua_file = os.path.join(stplug_in_dir, f'{id}.lua')

        # 1. Extract all depot IDs from the .lua file before deletion
        depot_ids = set()
        if os.path.isfile(lua_file):
            try:
                with open(lua_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # Find all addappid() calls and extract depot IDs
                    for match in re.finditer(r'addappid\((\d+)', content):
                        depot_ids.add(match.group(1))
                    logger.log(f"Found {len(depot_ids)} depot IDs in {lua_file}: {depot_ids}")
            except Exception as exc:
                logger.log(f"Failed to read {lua_file} for depot ID extraction: {exc}")

        # 2. Remove main .lua file from stplug-in/
        if os.path.isfile(lua_file):
            try:
                os.remove(lua_file)
                removed_files.append(lua_file)
                logger.log(f"Removed {lua_file}")
            except Exception as exc:
                errors.append(f"Failed to remove {lua_file}: {exc}")
                logger.log(errors[-1])

        # 3. Remove .manifest files from depotcache/ for all depot IDs found in .lua
        depotcache_dir = get_depotcache_path()
        if os.path.isdir(depotcache_dir) and depot_ids:
            try:
                for filename in os.listdir(depotcache_dir):
                    if not filename.endswith('.manifest'):
                        continue

                    # Check if filename starts with any of the depot IDs
                    # Pattern: {depot_id}_*.manifest
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
                            break  # Stop checking other depot IDs for this file
            except Exception as exc:
                errors.append(f"Failed to scan depotcache directory: {exc}")
                logger.log(errors[-1])

        # 4. Remove UserStats .bin files from StatsExport/ for all depot IDs
        stats_export_dir = get_stats_export_path()
        if os.path.isdir(stats_export_dir) and depot_ids:
            try:
                for filename in os.listdir(stats_export_dir):
                    if not filename.lower().endswith('.bin'):
                        continue

                    # Check if filename matches UserStats_{depot_id}_*.bin
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
                            break  # Stop checking other depot IDs for this file
            except Exception as exc:
                errors.append(f"Failed to scan StatsExport directory: {exc}")
                logger.log(errors[-1])

        # 5. Remove .json metadata files from stplug-in/ (if any)
        json_file = os.path.join(stplug_in_dir, f'{id}.json')
        if os.path.isfile(json_file):
            try:
                os.remove(json_file)
                removed_files.append(json_file)
                logger.log(f"Removed {json_file}")
            except Exception as exc:
                errors.append(f"Failed to remove {json_file}: {exc}")
                logger.log(errors[-1])

        # Return success if at least one file was removed
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
        """Return whether a Manilua API key is configured."""
        # Reload key from file in case it was created/modified after module load
        _load_manilua_api_key()
        return {'success': bool(_manilua_api_key), 'configured': bool(_manilua_api_key)}

    @staticmethod
    def get_manilua_api_status(payload: Any = None, **kwargs) -> dict[str, Any]:
        """Return detailed information about the configured Manilua API key (no validation, like original manilua-plugin v3.2.0)."""
        try:
            # Reload key from file in case it was created/modified after module load
            _load_manilua_api_key()
            if not _manilua_api_key:
                msg = create_message('backend.apiKeyNotConfigured', 'No API key configured.')
                return {
                    'success': True,
                    'hasKey': False,
                    'maskedKey': '',
                    **msg,
                }

            masked = _mask_api_key(_manilua_api_key)
            msg = create_message('backend.apiKeyConfigured', 'API key is configured.')

            return {
                'success': True,
                'hasKey': True,
                'isValid': True,  # Always True if key exists (like original plugin)
                'maskedKey': masked,
                **msg,
            }
        except Exception as exc:
            logger.log(f"Failed to retrieve Manilua API key status: {exc}")
            return {'success': False, 'error': str(exc)}

    @staticmethod
    def set_manilua_api_key(payload: Any = None, **kwargs) -> dict[str, Any]:
        """Store the Manilua API key without validation (like original manilua-plugin v3.2.0)."""
        try:
            # Frontend always sends {'api_key': '...'}, so we only need to handle that format
            api_key = None
            if isinstance(payload, dict):
                api_key = payload.get('api_key')

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

            # Save without validation (like original plugin)
            _save_manilua_api_key(candidate)
            logger.log('Manilua API key stored.')

            msg = create_message('backend.apiKeySaved', 'API key saved successfully.')
            return {'success': True, **msg}
        except Exception as exc:
            logger.log(f"Failed to save Manilua API key: {exc}")
            return {'success': False, 'error': str(exc)}

    @staticmethod
    def get_dlc_list(payload: Any = None, **kwargs) -> dict[str, Any]:
        """
        Get DLC list without downloading anything.
        Just return available DLC from API and mark which ones are already installed.
        """
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
        # Verify main game manifest exists before showing DLC
        main_game_manifest = download_lua_manifest(appid, mirror)
        if not main_game_manifest:
            game_info = fetch_game_info(appid)
            name = game_info.get('name') if game_info else 'Unknown'
            if mirror == 'manilua':
                msg = create_message('backend.manifestNotAvailableManilua', f"Manifest for {appid} ({name}) is not available via the Manilua mirror. Please check your API key.", appid=appid, name=name)
            else:
                msg = create_message('backend.manifestNotAvailablePublic', f"Manifest for {appid} ({name}) is not available on the public mirrors.", appid=appid, name=name)
            logger.log(msg['details'])
            return {'success': False, **msg, 'dlc': [], 'appid': appid}

        result: dict[str, Any] = {'success': True, 'dlc': [], 'appid': appid}
        result['dlc'] = collect_dlc_candidates(appid)
        return result

    # TODO: Это зачем нужно?
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
        """
        Install DLC per SteamTools logic:
        1) Гарантировать наличие базового .lua (через выбранный mirror)
        2) Удалить старые DLC-вставки
        3) Добавить выбранные DLC (с ключами, если найдены)
        """
        # ---- входные данные ----
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

        if mirror == 'manilua' and not _manilua_api_key:
            msg = create_message('backend.maniluaRequiresApiKey', 'The Manilua mirror requires a valid API key.')
            logger.log(msg['details'])
            return {'success': False, **msg, 'installed': [], 'failed': requested}

        # ---- базовый .lua ----
        base_game_path = get_manifest_path(appid)
        if not os.path.isfile(base_game_path):
            logger.log(f'Base game manifest not found, downloading for {appid} via mirror={mirror}')
            lua_content = download_lua_manifest(appid, mirror)  # ВАЖНО: учитывать mirror
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

            write_lua_file(appid, lua_content)

        with open(base_game_path, 'r', encoding='utf-8') as handle:
            base_content = handle.read()

        # ---- инфо об игре и доступные DLC ----
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

        # ---- ключи для DLC: с учётом mirror ----
        # ожидается обновлённая сигнатура:
        # fetch_dlc_decryption_keys(dlc_ids, main_appid, main_game_json: Optional[dict]=None, mirror: str='default')
        dlc_keys_map = fetch_dlc_decryption_keys(requested, appid, None, mirror)

        # ---- очистка старых DLC-вставок ----
        base_content = remove_dlc_entries_from_content(base_content, all_available_dlc)

        # ---- формирование DLC-вставок ----
        dlc_lines: list[str] = []
        installed_ids: list[str] = []

        for dlc_appid in requested:
            dlc_info = dlc_info_map.get(dlc_appid, {})
            dlc_name = dlc_info.get('name') or f'DLC {dlc_appid}'

            dlc_lines.append(f'-- DLC: {dlc_name}')
            key = dlc_keys_map.get(dlc_appid, '').strip()
            if key:
                dlc_lines.append(f'addappid({dlc_appid},0,"{key}")')
            else:
                dlc_lines.append(f'addappid({dlc_appid})')

            installed_ids.append(dlc_appid)

        final_content = base_content
        if dlc_lines:
            final_content += '\n\n' + '\n'.join(dlc_lines)

        target = write_lua_file(appid, final_content)

        msg = create_message('backend.dlcAdded',
                             f"Added {len(installed_ids)} DLC to {target}.",
                             count=len(installed_ids), target=target)
        return {'success': True, **msg, 'installed': installed_ids, 'failed': []}


class Plugin:
    def _front_end_loaded(self):
        logger.log('Frontend loaded!')

    def _load(self):
        logger.log('Backend loaded')
        Millennium.ready()

    def _unload(self):
        logger.log('unloading')


