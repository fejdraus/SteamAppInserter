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


def install_steambrew():
    print("Installing SteamBrew (Millennium)...")
    try:
        subprocess.run([
            "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
            "iwr -useb 'https://steambrew.app/install.ps1' | iex"
        ], check=True)
        print("SteamBrew installation completed")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error installing SteamBrew: {e}")
        return False


def install_steam_plugins(steam_path):
    plugins_folder = os.path.join(steam_path, "plugins")
    os.makedirs(plugins_folder, exist_ok=True)

    print(f"Installing plugins to: {plugins_folder}")

    source_url = "https://github.com/fejdraus/steamappadder/releases/download/release/release.zip"
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
    # Download millennium.ini
    ext_folder = os.path.join(steam_path, "ext")
    os.makedirs(ext_folder, exist_ok=True)
    millennium_url = "https://github.com/fejdraus/steamappadder/releases/download/release/millennium.ini"
    millennium_path = os.path.join(ext_folder, "millennium.ini")
    download_file(millennium_url, millennium_path)

    # Download config.json
    config_url = "https://github.com/fejdraus/steamappadder/releases/download/release/config.json"
    config_path = os.path.join(ext_folder, "config.json")
    download_file(config_url, config_path)


def dns_change():
    # Change DNS settings
    try:
        dns_command = 'wmic nicconfig where (IPEnabled=TRUE) call SetDNSServerSearchOrder ("94.140.14.14", "94.140.15.15")'
        subprocess.run(dns_command, shell=True, check=True)
        print("DNS settings changed successfully")
    except subprocess.CalledProcessError as e:
        print(f"Failed to change DNS settings: {e}")


def main():
    dns_change()
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
    if not install_steambrew():
        print("Warning: SteamBrew installation failed")
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
