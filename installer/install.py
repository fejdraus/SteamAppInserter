import pyuac
import os
import sys
import subprocess
import winreg
import requests
import zipfile


def get_steam_path():
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam")
        steam_path, _ = winreg.QueryValueEx(key, "SteamPath")
        winreg.CloseKey(key)
        return steam_path.strip('"')
    except (FileNotFoundError, OSError):
        return None


def download_file(url, destination):
    print(f"Downloading from {url}...")
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()

        with open(destination, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        print(f"Downloaded to {destination}")
        return True
    except requests.RequestException as e:
        print(f"Error downloading file: {e}")
        return False


def extract_zip(zip_path, extract_to):
    print(f"Extracting archive to {extract_to}...")
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_to)
        print("Extraction completed")
        return True
    except zipfile.BadZipFile as e:
        print(f"Error extracting ZIP: {e}")
        return False


def kill_steam():
    print('Closing Steam...')
    try:
        subprocess.run(['taskkill', '/F', '/IM', 'steam.exe'], capture_output=True, check=False)
        subprocess.run(['taskkill', '/F', '/IM', 'steamwebhelper.exe'], capture_output=True, check=False)
        import time
        time.sleep(2)
        return True
    except Exception as e:
        print(f'Warning: Could not kill Steam processes: {e}')
        return True


def install_millennium(steam_path):
    print('Installing Millennium...')
    import tempfile
    import hashlib
    api_url = 'https://api.github.com/repos/SteamClientHomebrew/Millennium/releases/latest'
    try:
        response = requests.get(api_url)
        response.raise_for_status()
        release_info = response.json()
    except requests.RequestException as e:
        print(f'Error fetching Millennium release info: {e}')
        return False
    windows_asset = None
    sha256_asset = None
    for asset in release_info.get('assets', []):
        name = asset['name']
        if 'windows-x86_64.zip' in name and not name.endswith('.sha256'):
            windows_asset = asset
        elif 'windows-x86_64.sha256' in name:
            sha256_asset = asset
    if not windows_asset:
        print('Error: Could not find Windows release')
        return False
    print(f'Found Millennium {release_info["tag_name"]}')
    temp_dir = tempfile.gettempdir()
    zip_path = os.path.join(temp_dir, windows_asset['name'])
    if not download_file(windows_asset['browser_download_url'], zip_path):
        return False
    if sha256_asset:
        print('Verifying file integrity...')
        try:
            sha_response = requests.get(sha256_asset['browser_download_url'])
            expected_hash = sha_response.text.strip().split()[0].lower()
            with open(zip_path, 'rb') as f:
                actual_hash = hashlib.sha256(f.read()).hexdigest().lower()
            if expected_hash != actual_hash:
                print('Error: SHA256 mismatch!')
                os.remove(zip_path)
                return False
            print('SHA256 verification passed')
        except Exception as e:
            print(f'Warning: Could not verify SHA256: {e}')
    kill_steam()
    if not extract_zip(zip_path, steam_path):
        return False
    try:
        os.remove(zip_path)
    except OSError:
        pass
    print('Millennium installation completed')
    return True


def install_steam_plugins(steam_path):
    plugins_folder = os.path.join(steam_path, "plugins")
    os.makedirs(plugins_folder, exist_ok=True)

    print(f"Installing plugins to: {plugins_folder}")

    source_url = "https://github.com/fejdraus/SteamAppInserter/releases/download/release/release.zip"
    zip_file = os.path.join(plugins_folder, "download.zip")

    if not download_file(source_url, zip_file):
        print("Failed to download plugins")
        return False

    if not extract_zip(zip_file, plugins_folder):
        print("Failed to extract plugins")
        return False

    try:
        os.remove(zip_file)
        print("Deleted temporary ZIP file")
    except OSError as e:
        print(f"Warning: Could not delete temporary file: {e}")

    print(f"Plugins installed successfully to: {plugins_folder}")
    return True


def config_millenium(steam_path):
    ext_folder = os.path.join(steam_path, "ext")
    os.makedirs(ext_folder, exist_ok=True)

    # millennium.ini - check if plugin is enabled, add if not
    millennium_path = os.path.join(ext_folder, "millennium.ini")
    if os.path.exists(millennium_path):
        print(f"millennium.ini already exists, checking plugin status...")
        with open(millennium_path, 'r', encoding='utf-8') as f:
            content = f.read()
        if 'steam-app-inserter' not in content:
            # Add plugin to enabled_plugins
            if 'enabled_plugins' in content:
                content = content.replace('enabled_plugins = ', 'enabled_plugins = steam-app-inserter|')
                with open(millennium_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print("Added steam-app-inserter to enabled plugins")
            else:
                print("Warning: Could not find enabled_plugins in millennium.ini")
        else:
            print("Plugin already enabled in millennium.ini")
    else:
        millennium_url = "https://github.com/fejdraus/SteamAppInserter/releases/download/release/millennium.ini"
        download_file(millennium_url, millennium_path)

    # config.json - only download if doesn't exist (don't overwrite user settings)
    config_path = os.path.join(ext_folder, "config.json")
    if os.path.exists(config_path):
        print(f"config.json already exists, skipping (preserving user settings)")
    else:
        config_url = "https://github.com/fejdraus/SteamAppInserter/releases/download/release/config.json"
        download_file(config_url, config_path)

def main():
    os.system("cls")
    input("Press Enter to continue...")
    print("Steam App Adder Installer (Without SteamTools)")
    print("=" * 40)

    if sys.platform != 'win32':
        print("This script is designed for Windows only.")
        return 1

    steam_path = get_steam_path()
    if not steam_path:
        print("Steam not found in registry.")
        return 1

    print(f"Steam found at: {steam_path}")

    # Install SteamBrew (Millennium) - this handles .lua files
    if not install_millennium(steam_path):
        print("Warning: Millennium installation failed")
        return 1

    # Configure Millennium
    config_millenium(steam_path)

    # Install plugin
    print("Installing Steam App Adder plugin...")
    if not install_steam_plugins(steam_path):
        print("Plugin installation failed")
        return 1

    # Create stplug-in folder for .lua files
    config_folder = os.path.join(steam_path, "config")
    stplugin_folder = os.path.join(config_folder, "stplug-in")
    os.makedirs(stplugin_folder, exist_ok=True)
    print(f"Created stplug-in folder: {stplugin_folder}")

    print("\n\nInstallation completed successfully!")
    print("Note: Millennium (SteamBrew) will handle .lua files automatically.")
    print("SteamTools is required for this plugin to work.")
    input("Press Enter to exit...")

    return 0


if __name__ == "__main__":
    try:
        if not pyuac.isUserAdmin():
            pyuac.runAsAdmin(wait=False)
            sys.exit(1)
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\nInstallation cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)
