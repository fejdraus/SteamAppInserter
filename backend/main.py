import json
import os
import re
import subprocess
from typing import Optional, Any

import requests

try:
    import Millennium
    import PluginUtils
    logger = PluginUtils.Logger()
except ImportError:
    # Fallback for development/testing outside Millennium
    import logging
    logger = logging.getLogger(__name__)
    class Millennium:
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


def getSteamPath() -> str:
    return Millennium.steam_path()


def _build_manifest_urls(appid: str, extension: str) -> list[str]:
    return [template.format(appid=appid, extension=extension) for template in MANIFEST_URLS]


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


def download_lua_manifest(appid: str) -> Optional[str]:
    return _download_text(_build_manifest_urls(appid, '.lua'))


def download_json_manifest(appid: str) -> Optional[dict[str, Any]]:
    raw = _download_text(_build_manifest_urls(appid, '.json'))
    if not raw:
        return None
    try:
        return json.loads(raw)
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


def write_lua_file(appid: str, content: str) -> str:
    steam_path = getSteamPath()
    plugin_dir = os.path.join(steam_path, 'config', 'stplug-in')
    _ensure_directory(plugin_dir)
    target_path = os.path.join(plugin_dir, f'{appid}.lua')
    with open(target_path, 'w', encoding='utf-8') as handle:
        normalized = content.rstrip('\r\n')
        if normalized:
            handle.write(normalized + '\n')
        else:
            handle.write('')
    return target_path


def collect_dlc_candidates(appid: str) -> list[dict[str, Any]]:
    info = fetch_game_info(appid)
    if not info:
        return []
    related = info.get('related_content') or []
    steam_path = getSteamPath()
    plugin_dir = os.path.join(steam_path, 'config', 'stplug-in')

    # Read main game file to check which DLC are already installed
    main_file = os.path.join(plugin_dir, f'{appid}.lua')
    installed_dlc_ids = set()
    if os.path.isfile(main_file):
        try:
            with open(main_file, 'r', encoding='utf-8') as f:
                content = f.read()
                logger.log(f"Reading {main_file}, content length: {len(content)}")
                # Find all addappid() calls in the file
                import re
                for match in re.finditer(r'addappid\((\d+)\)', content):
                    found_id = match.group(1)
                    logger.log(f"Found addappid({found_id}) in file, main appid={appid}")
                    # Skip main game appid, only count DLC
                    if found_id != appid:
                        installed_dlc_ids.add(found_id)
                        logger.log(f"Added {found_id} to installed_dlc_ids")
                logger.log(f"Total installed DLC IDs: {installed_dlc_ids}")
        except Exception as e:
            logger.log(f"Error reading {main_file}: {e}")
    else:
        logger.log(f"File does not exist: {main_file}")

    candidates: list[dict[str, Any]] = []
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
        # Check if this DLC appid is in the main game file
        already_installed = dlc_appid in installed_dlc_ids
        logger.log(f"DLC {dlc_appid} ({name}): alreadyInstalled={already_installed}")
        candidates.append({
            'appid': dlc_appid,
            'name': name,
            'alreadyInstalled': already_installed,
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
    existing_file = os.path.join(getSteamPath(), 'config', 'stplug-in', f'{appid}.lua')
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
            result['details'] = (
                f"Manifest for {appid} ({name}) is not available on the public mirrors. "
                'It may require manual review or private access.'
            )
        else:
            result['details'] = (
                f"Manifest for {appid} is not available on the public mirrors. "
                'Check your network or request manual access.'
            )
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
        stplugin = os.path.join(getSteamPath(), 'config', 'stplug-in')
        lua = os.path.join(stplugin, f'{id}.lua')
        return os.path.exists(lua)

    @staticmethod
    def deletelua(id: str):
        stplugin = os.path.join(getSteamPath(), 'config', 'stplug-in')
        manifest_path = os.path.join(stplugin, f'{id}.lua')
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
        requested = [str(dlc).strip() for dlc in requested_raw if str(dlc).strip()]

        # Check if base game file exists, if not - download it
        base_game_path = os.path.join(getSteamPath(), 'config', 'stplug-in', f'{appid}.lua')
        if not os.path.isfile(base_game_path):
            logger.log(f'Base game manifest not found, downloading for {appid}')
            # Download and process base game manifest
            lua_content = download_lua_manifest(appid)
            if not lua_content:
                details = f'Manifest for {appid} is not available on the public mirrors.'
                logger.log(details)
                return {'success': False, 'details': details, 'installed': [], 'failed': requested}

            json_data = download_json_manifest(appid)
            if json_data:
                lua_content = process_lua_content(lua_content, json_data)

            write_lua_file(appid, lua_content)

        with open(base_game_path, 'r', encoding='utf-8') as handle:
            base_content = handle.read()

        # Get game info to fetch DLC names
        game_info = fetch_game_info(appid)
        dlc_info_map: dict[str, dict[str, Any]] = {}
        if game_info:
            related = game_info.get('related_content') or []
            for item in related:
                if isinstance(item, dict) and item.get('type', '').lower() == 'dlc':
                    dlc_appid = str(item.get('appid', ''))
                    if dlc_appid:
                        dlc_info_map[dlc_appid] = item

        # Remove existing DLC entries from base content
        import re
        lines = base_content.split('\n')
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
            skip_next = False
            filtered_lines.append(line)

        base_content = '\n'.join(filtered_lines).rstrip('\r\n')

        # Build DLC lines
        dlc_lines: list[str] = []
        installed_ids: list[str] = []

        for dlc_appid in requested:
            dlc_info = dlc_info_map.get(dlc_appid, {})
            dlc_name = dlc_info.get('name') or f'DLC {dlc_appid}'

            dlc_lines.append(f'-- DLC: {dlc_name}')
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


