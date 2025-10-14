"""Configuration constants for steamappadder plugin."""

# Plugin version - used in User-Agent for API requests
# IMPORTANT: Manilua API may require version 3.0+ for compatibility
VERSION = '3.2.0'

# API Configuration
MANILUA_API_BASE = 'https://www.piracybound.com/api'
MANILUA_API_KEY_PREFIX = 'manilua_'
API_USER_ID_CACHE_TTL = 300  # 5 minutes

# HTTP Configuration
HTTP_TIMEOUT_DEFAULT = 30
HTTP_TIMEOUT = 10  # For non-Manilua requests
HTTP_MAX_RETRIES = 5
HTTP_BASE_RETRY_DELAY = 2.0
HTTP_CHUNK_SIZE = 512 * 1024

# Cache Configuration
CACHE_EXPIRY_SECONDS = 300  # 5 minutes

# Manifest URLs
MANIFEST_URLS = (
    "https://raw.githubusercontent.com/SteamAutoCracks/ManifestHub/{appid}/{appid}{extension}",
    "https://cdn.jsdmirror.com/gh/SteamAutoCracks/ManifestHub@{appid}/{appid}{extension}",
)

STEAMUI_APPINFO = "https://www.steamui.com/api/get_app_name.php?appid={appid}&no_cache=1"

# User Agent (fallback when Steam verification is not available)
USER_AGENT = f'manilua-plugin/{VERSION} (Millennium)'
