# 🎮 Steam App Inserter

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.5-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**Convenient UI for managing SteamTools lua manifests directly from Steam Store pages**

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Requirements](#%EF%B8%8F-requirements) • [How It Works](#-how-it-works)

</div>

---

## 📖 What is this?

**Steam App Inserter** is a [Millennium](https://steambrew.app/) plugin that adds a convenient interface for managing game manifests right on Steam Store pages. It works as a **UI frontend for SteamTools**, allowing you to add games and DLC to your library with just a few clicks.

### The Plugin Stack

This plugin is part of a three-component system:

1. **🛠️ SteamTools** (required) - Processes lua manifests and unlocks games in Steam
2. **⚙️ Millennium** (SteamBrew) - Provides the plugin framework for Steam UI modding
3. **🎯 Steam App Inserter** (this plugin) - Adds buttons and UI for easy manifest management

> **⚠️ Important:** This plugin **requires SteamTools** to function. Without SteamTools, the plugin will create manifest files but won't unlock any games.

---

## ✨ Features

### 🎨 Seamless Integration

- **Store Page Buttons** - Automatically adds "Add to library" and "Remove from library" buttons on Steam store pages
- **Native Steam UI** - Uses Steam's native button styling for a seamless experience
- **Auto-detection** - Automatically detects if a game is already in your library

### 🎯 DLC Management

- **DLC Selection Dialog** - Choose which DLC to add with an intuitive checkbox interface
- **Smart Detection** - Automatically marks already installed DLC
- **Bulk Operations** - Add or remove multiple DLC at once
- **Live Updates** - See which DLC are already in your library in real-time

### 🔧 Advanced Features

- **Multiple Mirror Support** - Automatically tries multiple sources for manifest files
- **Error Handling** - Clear error messages if manifests aren't available
- **Automatic Processing** - Processes manifests with SteamTools-compatible logic
- **One-Click Restart** - Optional Steam restart prompt after adding games

---

## 📥 Installation

### Option 1: Automatic (Recommended)

1. Download **`Installer.exe`** from the [latest release](https://github.com/fejdraus/SteamAppInserter/releases)
2. Run as administrator (Right-click → "Run as administrator")
3. The installer will automatically:
   - ✅ Install Millennium (SteamBrew)
   - ✅ Download and configure the plugin
   - ✅ Create necessary directories
   - ✅ Configure settings
4. Restart Steam

> **Note:** You must install **SteamTools separately** - the installer creates the plugin infrastructure but doesn't include SteamTools.

### Option 2: Manual Installation

**Prerequisites:**

- [Millennium (SteamBrew)](https://steambrew.app/) installed
- SteamTools installed and running

**Steps:**

1. Download `release.zip` from [releases](https://github.com/fejdraus/SteamAppInserter/releases)
2. Extract to `Steam\plugins\SteamAppInserter\`
3. Restart Steam

---

## 🎮 Usage

### Adding a Game

1. **Navigate** to any game's Steam Store page
2. **Click** the blue **"Add to library"** button
3. **Select DLC** (if available) in the dialog that appears
4. **Confirm** your selection
5. **Restart Steam** when prompted
6. **Done!** SteamTools will process the manifest and unlock the game

### Managing DLC

1. **Navigate** to a game that's already added
2. **Click** the blue **"Edit DLC library"** button
3. **Check/Uncheck** DLC you want to add or remove
4. **Confirm** changes
5. **Restart Steam**

### Removing a Game

1. **Navigate** to an added game's Steam Store page
2. **Click** the blue **"Remove from library"** button
3. **Confirm** the removal dialog
4. **Restart Steam** when prompted

---

## ⚠️ Requirements

### System Requirements

- **OS:** Windows (x64)
- **Steam:** Installed and running
- **Admin Rights:** Required for installation

### Software Dependencies

- **[SteamTools](https://www.steamtools.net/)** - **MANDATORY** for game unlocking
- **[Millennium](https://steambrew.app/)** - Plugin framework (auto-installed by installer)

---

## 🔍 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  1. You visit a Steam Store page                          │
│     ↓                                                       │
│  2. Plugin injects "Add to library" button                │
│     ↓                                                       │
│  3. You click the button and select DLC                   │
│     ↓                                                       │
│  4. Plugin downloads .lua manifest from public mirrors     │
│     ↓                                                       │
│  5. Plugin processes manifest (removes setManifestid,     │
│     adds decryption keys)                                  │
│     ↓                                                       │
│  6. Plugin saves to Steam/config/stplug-in/{appid}.lua    │
│     ↓                                                       │
│  7. You restart Steam                                      │
│     ↓                                                       │
│  8. SteamTools reads the .lua file                        │
│     ↓                                                       │
│  9. SteamTools unlocks the game in Steam                  │
│     ↓                                                       │
│ 10. Game appears in your library! 🎉                      │
└─────────────────────────────────────────────────────────────┘
```

### Architecture

- **Frontend (webkit)** - TypeScript/React UI injected into Steam Store pages
- **Backend (Python)** - Handles manifest downloads, processing, and file management
- **Communication** - RPC calls between frontend and backend using Millennium's IPC

### Manifest Sources

The plugin supports **two sources** for downloading manifests:

#### Public Mirrors (Default)

- Primary: `https://raw.githubusercontent.com/SteamAutoCracks/ManifestHub/`
- Fallback: `https://cdn.jsdmirror.com/gh/SteamAutoCracks/ManifestHub/`
- **No authentication required**

#### Manilua Mirror (Advanced)

- URL: `https://manilua.golde.org/`
- **Requires API token** for enhanced compatibility
- Access to private/locked games and extra DLC

#### Getting Manilua API Token

1. **Visit** the external service: https://www.piracybound.com/manilua
2. **Authorize** through **Discord login**
3. **Go to Profile Settings**
4. **API Keys** section - click **"Generate Key"**
5. **Copy** the generated token (starts with `manilua_`)
6. **In the plugin:** Select "Manilua (Advanced)" mirror and paste the token when prompted

> **Note:** Manilua token is optional but unlocks access to more games and DLC not available in public mirrors.

---

## 🛠️ Development

### Build Commands

```bash
# Development build with watch mode
npm run dev

# Production build
npm run build
```

### Project Structure

```
steamappadder/
├── webkit/           # Browser UI (Steam Store pages)
│   └── index.tsx    # Main entry point
├── backend/         # Python backend
│   └── main.py      # Manifest processing logic
├── frontend/        # Desktop UI (currently empty)
│   └── index.tsx
├── .millennium/     # Compiled output
│   └── Dist/
└── plugin.json      # Plugin metadata
```

### Key Technologies

- **Build System:** millennium-ttc (Millennium TypeScript Compiler)
- **Frontend:** TypeScript, React, @steambrew/webkit
- **Backend:** Python 3, requests
- **Target:** ES2020, Steam's Chromium Embedded Framework

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Credits

- **[Millennium](https://steambrew.app/)** - Plugin framework
- **[SteamTools](https://www.steamtools.net/)** - Game unlocking engine
- **[ManifestHub](https://github.com/SteamAutoCracks/ManifestHub)** - Public manifest repository
- **[Manilua](https://github.com/piracybound)** - Public (with free registration) manifest repository

---

## ⚠️ Disclaimer

This tool is for educational purposes only. Use at your own risk. The developers are not responsible for any consequences of using this software.

---

<div align="center">

**Made with ❤️ for the Steam community**

[Report Bug](https://github.com/fejdraus/SteamAppInserter/issues) • [Request Feature](https://github.com/fejdraus/SteamAppInserter/issues)

</div>
