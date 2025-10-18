import hashlib
import os
import random
import time
from typing import Any, Dict, Optional

try:
    from config import VERSION
except ImportError:
    VERSION = "3.2.0"

try:
    import Millennium  # type: ignore
except ImportError:
    class Millennium:  # type: ignore
        @staticmethod
        def version():
            return "1.0.0"

try:
    import PluginUtils  # type: ignore

    logger = PluginUtils.Logger()
except ImportError:
    import logging

    class _FallbackLogger:
        def __init__(self) -> None:
            self._logger = logging.getLogger("steamappadder.verification")

        def log(self, msg: str) -> None:
            self._logger.info(msg)

        def warn(self, msg: str) -> None:
            self._logger.warning(msg)

        def error(self, msg: str) -> None:
            self._logger.error(msg)

    logger = _FallbackLogger()

try:
    import psutil  # type: ignore

    PSUTIL_AVAILABLE = True
except ImportError:  # pragma: no cover - fallback for environments without psutil
    psutil = None  # type: ignore
    PSUTIL_AVAILABLE = False


class SteamVerification:
    def __init__(self) -> None:
        self.steam_pid: Optional[int] = None
        self.steam_process = None
        self.millennium_version: Optional[str] = None
        self.plugin_checksum: Optional[str] = None

        self._discover_steam_process()
        self._calculate_plugin_checksum()

    def _discover_steam_process(self) -> None:
        try:
            if not PSUTIL_AVAILABLE or psutil is None:
                logger.warn("steam_verification: psutil unavailable, using fallback PID")
                self.steam_pid = random.randint(1000, 65535)
            else:
                for proc in psutil.process_iter(['pid', 'name', 'exe']):  # type: ignore[attr-defined]
                    try:
                        name = (proc.info.get('name') or '').lower()
                        exe = (proc.info.get('exe') or '').lower()
                        if 'steam' in name and 'steam.exe' in exe:
                            self.steam_pid = proc.info['pid']
                            self.steam_process = proc
                            break
                    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):  # type: ignore[attr-defined]
                        continue

                if not self.steam_pid:
                    logger.warn("steam_verification: Steam process not found, using fallback PID")
                    self.steam_pid = random.randint(1000, 65535)

            try:
                self.millennium_version = Millennium.version()
            except Exception as exc:  # pragma: no cover - defensive
                logger.warn(f"steam_verification: Could not get Millennium version: {exc}")
                self.millennium_version = "1.0.0"
        except Exception as exc:  # pragma: no cover - defensive
            logger.error(f"steam_verification: Error discovering Steam process: {exc}")
            self.steam_pid = random.randint(1000, 65535)
            self.millennium_version = "1.0.0"

    def _calculate_plugin_checksum(self) -> None:
        try:
            hasher = hashlib.sha256()

            plugin_file = __file__
            if os.path.exists(plugin_file):
                with open(plugin_file, 'rb') as handle:
                    hasher.update(handle.read())

            if self.steam_process:
                try:
                    steam_exe = self.steam_process.exe()
                    if steam_exe and os.path.exists(steam_exe):
                        with open(steam_exe, 'rb') as steam_handle:
                            hasher.update(steam_handle.read(1024))
                except Exception as exc:
                    logger.warn(f"steam_verification: Could not read Steam executable: {exc}")

            import platform

            machine_info = f"{platform.node()}-{platform.processor()}-{os.environ.get('USERNAME', 'unknown')}"
            hasher.update(machine_info.encode())
            self.plugin_checksum = hasher.hexdigest()
        except Exception as exc:  # pragma: no cover - defensive
            logger.error(f"steam_verification: Error calculating checksum: {exc}")
            fallback_data = f"{time.time()}-{os.environ.get('USERNAME', 'unknown')}-{self.steam_pid}"
            self.plugin_checksum = hashlib.sha256(fallback_data.encode()).hexdigest()

    def _get_process_hash(self) -> str:
        try:
            if self.steam_process:
                memory_info = self.steam_process.memory_info()
                cpu_percent = self.steam_process.cpu_percent()
                create_time = self.steam_process.create_time()
                data = f"{memory_info.rss}-{memory_info.vms}-{cpu_percent}-{create_time}"
                return hashlib.sha256(data.encode()).hexdigest()[:32]
        except Exception as exc:
            logger.warn(f"steam_verification: Could not get process metrics: {exc}")

        fallback = f"{time.time()}-{self.steam_pid}"
        return hashlib.sha256(fallback.encode()).hexdigest()[:32]

    def _get_memory_proof(self) -> str:
        try:
            if self.steam_process:
                thread_count = len(self.steam_process.threads())
                memory_maps = len(self.steam_process.memory_maps()) if hasattr(self.steam_process, 'memory_maps') else 0
                data = f"{thread_count}-{memory_maps}-{self.steam_pid}"
                return hashlib.sha256(data.encode()).hexdigest()[:32]
        except Exception as exc:
            logger.warn(f"steam_verification: Could not get memory metrics: {exc}")

        fallback = f"memory-{self.steam_pid}-{time.time()}"
        return hashlib.sha256(fallback.encode()).hexdigest()[:32]

    def get_verification_headers(self) -> Dict[str, str]:
        timestamp = str(int(time.time() * 1000))
        headers = {
            'X-Steam-PID': str(self.steam_pid or 0),
            'X-Millennium-Version': self.millennium_version or "1.0.0",
            'X-Plugin-Checksum': self.plugin_checksum or '',
            'X-Process-Hash': self._get_process_hash(),
            'X-Memory-Proof': self._get_memory_proof(),
            'X-Plugin-Timestamp': timestamp,
            'User-Agent': f'manilua-plugin/{VERSION} (Millennium)',
        }
        return headers

    def refresh_verification(self) -> None:
        try:
            if self.steam_process and not self.steam_process.is_running():
                logger.log("steam_verification: Steam process changed, refreshing...")
                self._discover_steam_process()
            if random.random() < 0.1:
                self._calculate_plugin_checksum()
        except Exception as exc:  # pragma: no cover - defensive
            logger.error(f"steam_verification: Error refreshing verification: {exc}")


_verification_instance: Optional[SteamVerification] = None


def get_steam_verification() -> SteamVerification:
    global _verification_instance
    if _verification_instance is None:
        _verification_instance = SteamVerification()
    return _verification_instance


def refresh_steam_verification() -> None:
    global _verification_instance
    if _verification_instance:
        _verification_instance.refresh_verification()
