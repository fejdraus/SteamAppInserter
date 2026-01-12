"""HTTP client with support for both httpx and requests (fallback)."""
from typing import Optional, Dict, Any
from config import HTTP_TIMEOUT_DEFAULT, USER_AGENT

try:
    import PluginUtils
    logger = PluginUtils.Logger()
except ImportError:
    import logging
    class _FallbackLogger:
        def __init__(self):
            self._logger = logging.getLogger("steamappadder.http")
        def log(self, msg: str):
            self._logger.info(msg)
        def warn(self, msg: str):
            self._logger.warning(msg)
        def error(self, msg: str):
            self._logger.error(msg)
    logger = _FallbackLogger()

# Try to import httpx (preferred)
try:
    import httpx
    from httpx import HTTPStatusError, RequestError
    HTTPX_AVAILABLE = True
except ImportError:
    httpx = None
    HTTPStatusError = None
    RequestError = None
    HTTPX_AVAILABLE = False

# Fallback to requests
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    requests = None
    REQUESTS_AVAILABLE = False

# Try to import steam verification
try:
    from steam_verification import get_steam_verification
    STEAM_VERIFICATION_AVAILABLE = True
except ImportError:
    get_steam_verification = None
    STEAM_VERIFICATION_AVAILABLE = False

BASE_HEADERS = {
    'Accept': 'application/json',
    'X-Requested-With': 'manilua-Plugin',
    'Origin': 'https://store.steampowered.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
}


class HTTPClient:
    """HTTP client that supports both httpx (preferred) and requests (fallback)."""

    def __init__(self, timeout: int = HTTP_TIMEOUT_DEFAULT):
        self._client = None
        self._timeout = timeout
        self._use_httpx = HTTPX_AVAILABLE

        if not HTTPX_AVAILABLE and not REQUESTS_AVAILABLE:
            raise Exception("Neither httpx nor requests library is available. Please install at least one: pip install httpx or pip install requests")

        if not HTTPX_AVAILABLE:
            logger.info("httpx not available, using requests library")

    def _ensure_client(self):
        """Ensure HTTP client is initialized (only for httpx)."""
        if self._use_httpx:
            if self._client is None:
                try:
                    if httpx is None:
                        raise Exception("httpx library is not available")
                    self._client = httpx.Client(
                        timeout=self._timeout,
                        follow_redirects=True
                    )
                except Exception as e:
                    logger.error(f'HTTPClient: Failed to initialize httpx client: {e}')
                    raise
            return self._client
        return None

    def _build_headers(self, auth_token: Optional[str] = None, accept: str = "application/json", use_steam_verification: bool = True) -> Dict[str, str]:
        """Build request headers with optional Steam verification.

        Args:
            auth_token: Optional Bearer token for authorization
            accept: Accept header value
            use_steam_verification: If True, add Steam verification headers (for Manilua API)
                                   If False, use simple User-Agent (for public mirrors)
        """
        headers = BASE_HEADERS.copy()
        headers['Accept'] = accept

        if use_steam_verification and STEAM_VERIFICATION_AVAILABLE and get_steam_verification is not None:
            try:
                verification = get_steam_verification()
                verification_headers = verification.get_verification_headers()
                headers.update(verification_headers)
            except Exception as e:
                logger.warn(f"HTTPClient: Could not add Steam verification headers: {e}")
                headers['User-Agent'] = USER_AGENT
        else:
            headers['User-Agent'] = USER_AGENT

        if auth_token:
            headers['Authorization'] = f'Bearer {auth_token}'

        return headers

    def get(self, url: str, params: Optional[Dict[str, Any]] = None, auth_token: Optional[str] = None, accept: str = "application/json", use_steam_verification: bool = True) -> Dict[str, Any]:
        """Perform GET request.

        Args:
            url: URL to request
            params: Query parameters
            auth_token: Optional Bearer token
            accept: Accept header value
            use_steam_verification: Whether to add Steam verification headers (default True)
        """
        try:
            headers = self._build_headers(auth_token, accept, use_steam_verification)

            if self._use_httpx:
                client = self._ensure_client()
                response = client.get(url, params=params or {}, headers=headers)
                response.raise_for_status()

                return {
                    'success': True,
                    'data': response.json(),
                    'status_code': response.status_code,
                    'headers': dict(response.headers)
                }
            else:
                # Fallback to requests
                response = requests.get(url, params=params or {}, headers=headers, timeout=self._timeout)
                response.raise_for_status()

                return {
                    'success': True,
                    'data': response.json(),
                    'status_code': response.status_code,
                    'headers': dict(response.headers)
                }

        except Exception as e:
            return self._handle_error(e, url)

    def get_text(self, url: str, params: Optional[Dict[str, Any]] = None, auth_token: Optional[str] = None, accept: str = "text/plain, */*", use_steam_verification: bool = True) -> Dict[str, Any]:
        """Perform GET request and return text content.

        Args:
            url: URL to request
            params: Query parameters
            auth_token: Optional Bearer token
            accept: Accept header value
            use_steam_verification: Whether to add Steam verification headers (default True)
        """
        try:
            headers = self._build_headers(auth_token, accept, use_steam_verification)

            if self._use_httpx:
                client = self._ensure_client()
                response = client.get(url, params=params or {}, headers=headers)
                response.raise_for_status()

                return {
                    'success': True,
                    'data': response.text,
                    'status_code': response.status_code,
                    'headers': dict(response.headers)
                }
            else:
                # Fallback to requests
                response = requests.get(url, params=params or {}, headers=headers, timeout=self._timeout)
                response.raise_for_status()

                return {
                    'success': True,
                    'data': response.text,
                    'status_code': response.status_code,
                    'headers': dict(response.headers)
                }

        except Exception as e:
            return self._handle_error(e, url)

    def get_binary(self, url: str, params: Optional[Dict[str, Any]] = None, auth_token: Optional[str] = None, use_steam_verification: bool = True) -> Dict[str, Any]:
        """Perform GET request and return binary content.

        Args:
            url: URL to request
            params: Query parameters
            auth_token: Optional Bearer token
            use_steam_verification: Whether to add Steam verification headers (default True)
        """
        try:
            headers = self._build_headers(auth_token, "application/octet-stream", use_steam_verification)

            if self._use_httpx:
                client = self._ensure_client()
                response = client.get(url, params=params or {}, headers=headers)
                response.raise_for_status()

                return {
                    'success': True,
                    'data': response.content,
                    'status_code': response.status_code,
                    'headers': dict(response.headers),
                    'content_type': response.headers.get('Content-Type', '')
                }
            else:
                # Fallback to requests
                response = requests.get(url, params=params or {}, headers=headers, timeout=self._timeout)
                response.raise_for_status()

                return {
                    'success': True,
                    'data': response.content,
                    'status_code': response.status_code,
                    'headers': dict(response.headers),
                    'content_type': response.headers.get('Content-Type', '')
                }

        except Exception as e:
            return self._handle_error(e, url)

    def post(self, url: str, data: Optional[Dict[str, Any]] = None, auth_token: Optional[str] = None, use_steam_verification: bool = True) -> Dict[str, Any]:
        """Perform POST request with JSON body.

        Args:
            url: URL to request
            data: JSON data to send
            auth_token: Optional Bearer token
            use_steam_verification: Whether to add Steam verification headers (default True)
        """
        try:
            headers = self._build_headers(auth_token, "application/json", use_steam_verification)

            if data:
                headers['Content-Type'] = 'application/json'

            # Detailed logging for debugging
            logger.log("HTTPClient POST request headers:")
            for key, value in headers.items():
                if key.lower() in ['authorization', 'x-plugin-checksum']:
                    logger.log(f"  {key}: {value[:30]}..." if len(value) > 30 else f"  {key}: {value}")
                else:
                    logger.log(f"  {key}: {value}")

            if self._use_httpx:
                client = self._ensure_client()
                response = client.post(url, json=data or {}, headers=headers)
                response.raise_for_status()

                return {
                    'success': True,
                    'data': response.text,
                    'status_code': response.status_code,
                    'headers': dict(response.headers)
                }
            else:
                # Fallback to requests
                response = requests.post(url, json=data or {}, headers=headers, timeout=self._timeout)
                response.raise_for_status()

                return {
                    'success': True,
                    'data': response.text,
                    'status_code': response.status_code,
                    'headers': dict(response.headers)
                }

        except Exception as e:
            return self._handle_error(e, url)

    def _handle_error(self, e: Exception, url: str) -> Dict[str, Any]:
        """Handle and format errors from HTTP requests."""
        if self._use_httpx and HTTPX_AVAILABLE and HTTPStatusError is not None and isinstance(e, HTTPStatusError):
            error_msg = f"HTTP {e.response.status_code}: {e.response.text if e.response else 'No response'}"
            logger.error(f'HTTPClient: HTTP error for {url}: {error_msg}')
            return {
                'success': False,
                'error': error_msg,
                'status_code': e.response.status_code if e.response else None
            }
        elif self._use_httpx and HTTPX_AVAILABLE and RequestError is not None and isinstance(e, RequestError):
            error_msg = f"Request error: {str(e)}"
            logger.error(f'HTTPClient: Request error for {url}: {error_msg}')
            return {
                'success': False,
                'error': error_msg
            }
        elif not self._use_httpx and REQUESTS_AVAILABLE and hasattr(requests, 'HTTPError') and isinstance(e, requests.HTTPError):
            error_msg = f"HTTP {e.response.status_code}: {e.response.text if hasattr(e, 'response') and e.response else 'No response'}"
            logger.error(f'HTTPClient: HTTP error for {url}: {error_msg}')
            return {
                'success': False,
                'error': error_msg,
                'status_code': e.response.status_code if hasattr(e, 'response') and e.response else None
            }
        else:
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(f'HTTPClient: Unexpected error for {url}: {error_msg}')
            return {
                'success': False,
                'error': error_msg
            }

    def close(self) -> None:
        """Close HTTP client."""
        if self._use_httpx and self._client is not None:
            try:
                self._client.close()
            except Exception as e:
                logger.error(f'HTTPClient: Error closing client: {e}')
            finally:
                self._client = None


_global_client: Optional[HTTPClient] = None


def get_global_client() -> HTTPClient:
    """Get or create global HTTP client instance."""
    global _global_client
    if _global_client is None:
        _global_client = HTTPClient()
    return _global_client


def close_global_client() -> None:
    """Close and cleanup global HTTP client."""
    global _global_client
    if _global_client is not None:
        _global_client.close()
        _global_client = None
