@echo off
echo Building Installer.exe...
echo.

REM Install PyInstaller if needed
pip install pyinstaller pyuac requests pywin32

REM Build the installer using Python module
python -m PyInstaller --onefile --name=Installer --hidden-import=pyuac --hidden-import=requests --hidden-import=win32security --hidden-import=win32api --hidden-import=win32con install.py

echo.
echo Build complete! Check dist\Installer.exe
pause
