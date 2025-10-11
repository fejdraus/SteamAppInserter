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

MANIFEST_URLS = (
    "https://raw.githubusercontent.com/SteamAutoCracks/ManifestHub/{appid}/{appid}{extension}",
    "https://cdn.jsdmirror.com/gh/SteamAutoCracks/ManifestHub@{appid}/{appid}{extension}",
)
STEAMUI_APPINFO = "https://www.steamui.com/api/get_app_name.php?appid={appid}&no_cache=1"
HTTP_TIMEOUT = 10
CACHE_EXPIRY_SECONDS = 300  # 5 minutes
MANILUA_API_BASE = "https://www.piracybound.com/api"
MANILUA_API_KEY_PREFIX = "manilua_"
MANILUA_TIMEOUT = 30
MANILUA_STATUS_TTL = 300
_MANILUA_KEY_FILE = os.path.join(os.path.dirname(__file__), "manilua_api_key.txt")
_manilua_api_key: Optional[str] = None
_manilua_validation_cache: dict[str, Any] = {"timestamp": 0.0, "valid": None, "message": ""}

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
    try:
        path = _get_manilua_key_path()
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as handle:
                candidate = handle.read().strip()
                _manilua_api_key = candidate or None
        else:
            _manilua_api_key = None
    except Exception as exc:
        logger.log(f"Failed to load Manilua API key: {exc}")
        _manilua_api_key = None


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
        "X-Requested-With": "steam-app-adder",
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


def validate_manilua_api_key(api_key: str) -> tuple[bool, str]:
    try:
        headers = _manilua_headers(None, "application/json")
        headers["Content-Type"] = "application/json"
        response = requests.post(
            f"{MANILUA_API_BASE}/validate-api-key",
            json={"key": api_key},
            headers=headers,
            timeout=MANILUA_TIMEOUT,
        )
        if response.status_code == 200:
            try:
                data = response.json()
            except json.JSONDecodeError:
                return False, "Unexpected response while validating API key."
            if data.get("isValid"):
                return True, data.get("userId", "")
            return False, data.get("message") or "API key is invalid."
        if response.status_code == 401:
            return False, "API key was rejected by the Manilua service."
        return False, f"Validation request failed with HTTP {response.status_code}."
    except Exception as exc:
        return False, f"API key validation failed: {exc}"


def _cached_manilua_validation(force_refresh: bool = False) -> tuple[Optional[bool], str]:
    if not _manilua_api_key:
        _manilua_validation_cache.update({"timestamp": 0.0, "valid": None, "message": ""})
        return None, ""

    now = time.time()
    cached_valid = _manilua_validation_cache.get("valid")
    cached_timestamp = _manilua_validation_cache.get("timestamp", 0.0)
    cached_message = _manilua_validation_cache.get("message", "")

    if (
        not force_refresh
        and cached_valid is not None
        and now - cached_timestamp < MANILUA_STATUS_TTL
    ):
        return bool(cached_valid), str(cached_message or "")

    valid, message = validate_manilua_api_key(_manilua_api_key)
    _manilua_validation_cache.update({"timestamp": now, "valid": valid, "message": message})
    return valid, message


def download_lua_manifest_manilua(appid: str, api_key: str) -> Optional[str]:
    try:
        headers = _manilua_headers(api_key)
        response = requests.get(
            f"{MANILUA_API_BASE}/file/{appid}",
            headers=headers,
            timeout=MANILUA_TIMEOUT,
        )
        if response.status_code == 401:
            logger.log("Manilua mirror rejected the configured API key.")
            return None
        if response.status_code >= 400:
            logger.log(f"Manilua mirror returned HTTP {response.status_code} for {appid}")
            return None

        content_type = (response.headers.get("Content-Type") or "").lower()
        raw = response.content

        if content_type.startswith("application/json"):
            try:
                data = response.json()
                logger.log(f"Manilua mirror returned an error for {appid}: {data}")
            except json.JSONDecodeError:
                logger.log(f"Manilua mirror returned a JSON error for {appid}, but it could not be parsed.")
            return None

        if content_type.startswith("application/zip") or raw[:2] == b"PK":
            try:
                with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                    for member in archive.namelist():
                        if member.lower().endswith(".lua"):
                            with archive.open(member) as handle:
                                return handle.read().decode("utf-8", errors="replace")
                logger.log(f"Manilua mirror archive for {appid} did not contain a Lua manifest.")
                return None
            except Exception as exc:
                logger.log(f"Failed to process Manilua archive for {appid}: {exc}")
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
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
    }
    for url in urls:
        try:
            response = requests.get(url, headers=headers, timeout=HTTP_TIMEOUT)
            if response.status_code == 200:
                return response.text
            logger.log(f"HTTP {response.status_code} for {url}")
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


def fetch_dlc_decryption_keys(dlc_ids: list[str], main_appid: str, main_game_json: Optional[dict[str, Any]] = None) -> dict[str, str]:
    """
    Fetch decryption keys for DLC from main game manifest and individual DLC manifests.
    Returns a dict mapping DLC appid to decryption key.
    """
    dlc_keys_map: dict[str, str] = {}

    # First, check main game manifest for DLC keys
    if main_game_json is None:
        main_game_json = download_json_manifest(main_appid)

    if main_game_json:
        depot_data = main_game_json.get('depot', {})
        for dlc_id in dlc_ids:
            dlc_depot = depot_data.get(dlc_id)
            if not dlc_depot and dlc_id.isdigit():
                dlc_depot = depot_data.get(int(dlc_id))
            if isinstance(dlc_depot, dict):
                key = str(dlc_depot.get('decryptionkey') or '').strip()
                if key:
                    dlc_keys_map[dlc_id] = key
                    logger.log(f"Found key for DLC {dlc_id} in main game manifest")

    # For DLC without keys in main manifest, check individual DLC manifests in parallel
    dlcs_to_fetch = [dlc_id for dlc_id in dlc_ids if dlc_id not in dlc_keys_map]

    if dlcs_to_fetch:
        logger.log(f"Fetching manifests for {len(dlcs_to_fetch)} DLC in parallel")

        def fetch_dlc_key(dlc_id: str) -> tuple[str, Optional[str]]:
            dlc_json = download_json_manifest(dlc_id)
            if dlc_json:
                dlc_depot_data = dlc_json.get('depot', {})
                dlc_depot = dlc_depot_data.get(dlc_id)
                if not dlc_depot and dlc_id.isdigit():
                    dlc_depot = dlc_depot_data.get(int(dlc_id))
                if isinstance(dlc_depot, dict):
                    key = str(dlc_depot.get('decryptionkey') or '').strip()
                    if key:
                        return (dlc_id, key)
            return (dlc_id, None)

        # Use ThreadPoolExecutor for parallel downloads (max 5 concurrent requests)
        with ThreadPoolExecutor(max_workers=min(5, len(dlcs_to_fetch))) as executor:
            futures = [executor.submit(fetch_dlc_key, dlc_id) for dlc_id in dlcs_to_fetch]

            for future in as_completed(futures):
                try:
                    dlc_id, key = future.result()
                    if key:
                        dlc_keys_map[dlc_id] = key
                        logger.log(f"Found key for DLC {dlc_id} in DLC manifest")
                except Exception as exc:
                    logger.log(f"Error fetching manifest for DLC: {exc}")

    return dlc_keys_map


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


def install_manifest_for_app(appid: str) -> dict[str, Any]:
    """
    Install base game manifest per SteamTools logic:
    1. Check if file already exists - if yes, skip download/save but still return DLC list
    2. If not exists: Download .lua and .json for the game
    3. Process lua content (remove setManifestid, add decryptionkey)
    4. Save processed content
    5. Return DLC list for selection (always fetch fresh list from API)
    """
    result: dict[str, Any] = {'success': False, 'details': '', 'dlc': [], 'appid': appid}

    # Check if file already exists
    existing_file = get_manifest_path(appid)
    file_exists = os.path.isfile(existing_file)

    if file_exists:
        logger.log(f"Manifest for {appid} already exists at {existing_file}")
        result['success'] = True
        result['details'] = f"Manifest already exists"
        # Always fetch fresh DLC list from API (may have new DLC)
        result['dlc'] = collect_dlc_candidates(appid)
        return result

    # Download .lua file
    lua_content = download_lua_manifest(appid)
    if not lua_content:
        info = fetch_game_info(appid)
        if info:
            name = info.get('name') or 'Unknown'
            result['details'] = f"Manifest for {appid} ({name}) is not available on the public mirrors."
        else:
            result['details'] = f"Manifest for {appid} is not available on the public mirrors."
        return result

    # Download .json file
    json_data = download_json_manifest(appid)
    if not json_data:
        logger.log(f"JSON manifest not available for {appid}, saving raw lua")
        target = write_lua_file(appid, lua_content)
        result['success'] = True
        result['details'] = f"Manifest saved to {target} (no JSON processing)"
        result['dlc'] = collect_dlc_candidates(appid)
        return result

    # Process lua content (SteamTools logic)
    processed_content = process_lua_content(lua_content, json_data)
    target = write_lua_file(appid, processed_content)

    result['success'] = True
    result['details'] = f"Manifest saved to {target}"
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
        manifest_path = get_manifest_path(id)
        if os.path.isfile(manifest_path):
            try:
                os.remove(manifest_path)
                return True
            except Exception as exc:
                logger.log(f"Failed removing {manifest_path}: {exc}")
                return False
        logger.log(f"Manifest for {id} not found")
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
        return {'success': bool(_manilua_api_key), 'configured': bool(_manilua_api_key)}

    @staticmethod
    def get_manilua_api_status(payload: Any = None, **kwargs) -> dict[str, Any]:
        """Return detailed information about the configured Manilua API key."""
        try:
            if not _manilua_api_key:
                return {
                    'success': True,
                    'hasKey': False,
                    'isValid': False,
                    'maskedKey': '',
                    'message': 'API key not configured.',
                }

            force = bool(kwargs.get('force')) if kwargs else False
            valid, message = _cached_manilua_validation(force)
            masked = _mask_api_key(_manilua_api_key)

            return {
                'success': True,
                'hasKey': True,
                'isValid': bool(valid),
                'maskedKey': masked,
                'message': message or '',
            }
        except Exception as exc:
            logger.log(f"Failed to retrieve Manilua API key status: {exc}")
            return {'success': False, 'error': str(exc)}

    @staticmethod
    def set_manilua_api_key(payload: Any = None, **kwargs) -> dict[str, Any]:
        """Store and validate the Manilua API key."""
        try:
            api_key = None
            if isinstance(payload, dict):
                api_key = payload.get('api_key') or payload.get('key')
            elif isinstance(payload, str):
                api_key = payload
            elif payload is not None:
                api_key = str(payload)

            if api_key is None and kwargs:
                api_key = kwargs.get('api_key') or kwargs.get('key')

            if not api_key or not isinstance(api_key, str):
                return {'success': False, 'error': 'API key is required.'}

            candidate = api_key.strip()
            if not candidate:
                return {'success': False, 'error': 'API key is required.'}

            if not candidate.startswith(MANILUA_API_KEY_PREFIX):
                return {
                    'success': False,
                    'error': f'API key must start with {MANILUA_API_KEY_PREFIX}.'
                }

            valid, message = validate_manilua_api_key(candidate)
            if not valid:
                return {'success': False, 'error': message or 'API key validation failed.'}

            _save_manilua_api_key(candidate)
            _cached_manilua_validation(force_refresh=True)
            logger.log('Manilua API key stored.')
            return {'success': True, 'message': message or 'API key saved.'}
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
            details = 'Could not determine AppID.'
            logger.log(details)
            return {'success': False, 'details': details, 'dlc': [], 'appid': ''}

        mirror = str(data.get('mirror') or 'default').strip() or 'default'
        # Verify main game manifest exists before showing DLC
        main_game_manifest = download_lua_manifest(appid, mirror)
        if not main_game_manifest:
            game_info = fetch_game_info(appid)
            name = game_info.get('name') if game_info else 'Unknown'
            if mirror == 'manilua':
                details = f"Manifest for {appid} ({name}) is not available via the Manilua mirror. Please check your API key."
            else:
                details = f"Manifest for {appid} ({name}) is not available on the public mirrors."
            logger.log(details)
            return {'success': False, 'details': details, 'dlc': [], 'appid': appid}

        result: dict[str, Any] = {'success': True, 'details': '', 'dlc': [], 'appid': appid}
        result['dlc'] = collect_dlc_candidates(appid)
        return result

    @staticmethod
    def receive_frontend_message(message: str):
        appid = extract_appid(message)
        if not appid:
            details = 'Could not determine AppID from message.'
            logger.log(details)
            return {'success': False, 'details': details}

        result = install_manifest_for_app(appid)
        return result

    @staticmethod
    def install_dlcs(payload: Any = None, **kwargs) -> dict[str, Any]:
        """
        Install DLC per SteamTools logic:
        1. Download base game .lua file if not exists
        2. Remove existing DLC entries from file
        3. Add selected DLC
        4. Save merged content to base game file
        """
        data: dict[str, Any] = {}
        if isinstance(payload, dict):
            data.update(payload)
        elif payload is not None:
            data['appid'] = payload
        if kwargs:
            data.update(kwargs)

        appid = str(data.get('appid') or '')
        requested_raw = data.get('dlcs') or []
        if not isinstance(requested_raw, list):
            requested_raw = [requested_raw]
        requested = []
        for dlc in requested_raw:
            candidate = str(dlc).strip()
            if not candidate:
                continue
            if not candidate.isdigit():
                logger.log(f"Skipping non-numeric DLC id: {candidate}")
                continue
            requested.append(candidate)

        mirror = str(data.get('mirror') or 'default').strip() or 'default'
        if mirror == 'manilua' and not _manilua_api_key:
            details = 'The Manilua mirror requires a valid API key.'
            logger.log(details)
            return {'success': False, 'details': details, 'installed': [], 'failed': requested}

        # Check if base game file exists, if not - download it
        base_game_path = get_manifest_path(appid)
        if not os.path.isfile(base_game_path):
            logger.log(f'Base game manifest not found, downloading for {appid}')
            # Download and process base game manifest
            lua_content = download_lua_manifest(appid, mirror)
            if not lua_content:
                if mirror == 'manilua':
                    details = f'Manifest for {appid} is not available via the Manilua mirror. Please verify your API key.'
                else:
                    details = f'Manifest for {appid} is not available on the public mirrors.'
                logger.log(details)
                return {'success': False, 'details': details, 'installed': [], 'failed': requested}

            json_data = download_json_manifest(appid)
            if json_data:
                lua_content = process_lua_content(lua_content, json_data)

            write_lua_file(appid, lua_content)

        with open(base_game_path, 'r', encoding='utf-8') as handle:
            base_content = handle.read()

        # Get game info to fetch DLC names and check app type
        game_info = fetch_game_info(appid)
        dlc_info_map: dict[str, dict[str, Any]] = {}
        all_available_dlc: set[str] = set()
        app_type = ''
        if game_info:
            app_type = (game_info.get('type') or '').lower()
            related = game_info.get('related_content') or []
            for item in related:
                if isinstance(item, dict) and item.get('type', '').lower() == 'dlc':
                    dlc_appid = str(item.get('appid', ''))
                    if dlc_appid:
                        dlc_info_map[dlc_appid] = item
                        all_available_dlc.add(dlc_appid)

        # Get decryption keys for requested DLC (for all game types)
        is_application = app_type == 'application'
        dlc_keys_map = fetch_dlc_decryption_keys(requested, appid)

        # Remove existing DLC entries from base content
        base_content = remove_dlc_entries_from_content(base_content, all_available_dlc)

        # Build DLC lines
        dlc_lines: list[str] = []
        installed_ids: list[str] = []

        for dlc_appid in requested:
            dlc_info = dlc_info_map.get(dlc_appid, {})
            dlc_name = dlc_info.get('name') or f'DLC {dlc_appid}'

            dlc_lines.append(f'-- DLC: {dlc_name}')

            # Use decryption key if available (for all game types)
            if dlc_appid in dlc_keys_map:
                dlc_key = dlc_keys_map[dlc_appid]
                dlc_lines.append(f'addappid({dlc_appid},0,"{dlc_key}")')
            else:
                dlc_lines.append(f'addappid({dlc_appid})')

            installed_ids.append(dlc_appid)

        # Merge: base content + DLC lines
        final_content = base_content
        if dlc_lines:
            final_content += '\n\n' + '\n'.join(dlc_lines)

        # Write merged content to base game file
        target = write_lua_file(appid, final_content)

        message = f"Added {len(installed_ids)} DLC to {target}."
        return {'success': True, 'details': message, 'installed': installed_ids, 'failed': []}


class Plugin:
    def _front_end_loaded(self):
        logger.log('Frontend loaded!')

    def _load(self):
        logger.log('Backend loaded')
        Millennium.ready()

    def _unload(self):
        logger.log('unloading')


