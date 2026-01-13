"""
VirusTotal integration for scanning downloaded archives.
Uploads files to VT for malware scanning before extraction.
"""

import hashlib
import time
from typing import Optional, Tuple, Dict, Any

try:
    import requests
except ImportError:
    requests = None

# VirusTotal API endpoints
VT_API_BASE = "https://www.virustotal.com/api/v3"
VT_FILE_UPLOAD = f"{VT_API_BASE}/files"
VT_ANALYSIS = f"{VT_API_BASE}/analyses"
VT_FILE_REPORT = f"{VT_API_BASE}/files"

# Scan settings
MAX_WAIT_TIME = 60  # Maximum seconds to wait for scan result
POLL_INTERVAL = 3   # Seconds between status checks
MALICIOUS_THRESHOLD = 1  # Number of detections to consider file malicious


class VirusTotalScanner:
    """Scanner for checking files against VirusTotal."""
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize scanner.
        
        Args:
            api_key: Optional VT API key. Without key, uses public rate limits (4/min).
                    With key, uses authenticated limits (500/day for free tier).
        """
        self.api_key = api_key
        self._last_request_time = 0
        self._min_request_interval = 15 if not api_key else 1  # Rate limiting
    
    def _get_headers(self) -> Dict[str, str]:
        """Get API headers."""
        if self.api_key:
            return {"x-apikey": self.api_key}
        return {}
    
    def _rate_limit(self) -> None:
        """Apply rate limiting between requests."""
        elapsed = time.time() - self._last_request_time
        if elapsed < self._min_request_interval:
            time.sleep(self._min_request_interval - elapsed)
        self._last_request_time = time.time()
    
    def _calculate_sha256(self, data: bytes) -> str:
        """Calculate SHA256 hash of data."""
        return hashlib.sha256(data).hexdigest()
    
    def check_hash(self, file_hash: str) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Check if file hash exists in VT database.
        
        Args:
            file_hash: SHA256 hash of file
            
        Returns:
            Tuple of (found, report_data)
        """
        if not requests:
            return False, None
            
        self._rate_limit()
        
        try:
            response = requests.get(
                f"{VT_FILE_REPORT}/{file_hash}",
                headers=self._get_headers(),
                timeout=10
            )
            
            if response.status_code == 200:
                return True, response.json()
            elif response.status_code == 404:
                return False, None
            else:
                return False, None
                
        except Exception:
            return False, None
    
    def upload_and_scan(self, file_data: bytes, filename: str = "archive.zip") -> Tuple[bool, Optional[str]]:
        """
        Upload file to VirusTotal for scanning.
        
        Args:
            file_data: Raw file bytes
            filename: Name for the uploaded file
            
        Returns:
            Tuple of (success, analysis_id)
        """
        if not requests:
            return False, None
            
        self._rate_limit()
        
        try:
            files = {"file": (filename, file_data)}
            response = requests.post(
                VT_FILE_UPLOAD,
                headers=self._get_headers(),
                files=files,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                analysis_id = data.get("data", {}).get("id")
                return True, analysis_id
            else:
                return False, None
                
        except Exception:
            return False, None
    
    def get_analysis_result(self, analysis_id: str) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Get analysis result from VirusTotal.
        
        Args:
            analysis_id: ID from upload_and_scan
            
        Returns:
            Tuple of (status, stats)
            status: "queued", "completed", "error"
            stats: Detection statistics if completed
        """
        if not requests:
            return "error", None
            
        self._rate_limit()
        
        try:
            response = requests.get(
                f"{VT_ANALYSIS}/{analysis_id}",
                headers=self._get_headers(),
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                attributes = data.get("data", {}).get("attributes", {})
                status = attributes.get("status", "queued")
                
                if status == "completed":
                    stats = attributes.get("stats", {})
                    return "completed", stats
                else:
                    return "queued", None
            else:
                return "error", None
                
        except Exception:
            return "error", None
    
    def wait_for_result(self, analysis_id: str, max_wait: int = MAX_WAIT_TIME) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Wait for scan to complete and return result.
        
        Args:
            analysis_id: ID from upload_and_scan
            max_wait: Maximum seconds to wait
            
        Returns:
            Tuple of (completed, stats)
        """
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            status, stats = self.get_analysis_result(analysis_id)
            
            if status == "completed":
                return True, stats
            elif status == "error":
                return False, None
            
            time.sleep(POLL_INTERVAL)
        
        return False, None  # Timeout
    
    def is_malicious(self, stats: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Determine if file is malicious based on scan stats.
        
        Args:
            stats: Detection statistics from VT
            
        Returns:
            Tuple of (is_malicious, reason)
        """
        malicious = stats.get("malicious", 0)
        suspicious = stats.get("suspicious", 0)
        
        if malicious >= MALICIOUS_THRESHOLD:
            return True, f"Detected as malicious by {malicious} antivirus engines"
        
        if suspicious >= 3:
            return True, f"Flagged as suspicious by {suspicious} antivirus engines"
        
        return False, "Clean"


def scan_archive(archive_bytes: bytes, appid: str, api_key: Optional[str] = None) -> Tuple[bool, str]:
    """
    Scan archive for malware using VirusTotal.
    
    This is the main function to use for scanning.
    
    Args:
        archive_bytes: Raw ZIP archive data
        appid: Steam app ID (for logging/filename)
        api_key: Optional VT API key (required for VT API v3)
        
    Returns:
        Tuple of (is_safe, message)
        is_safe: True if file is safe to extract
        message: Status message for logging
    """
    if not requests:
        return True, "VirusTotal check skipped (requests module not available)"
    
    if not api_key:
        return True, "VirusTotal check skipped (no API key configured)"
    
    scanner = VirusTotalScanner(api_key)
    
    # First, check if file hash already exists in VT
    file_hash = scanner._calculate_sha256(archive_bytes)
    found, report = scanner.check_hash(file_hash)
    
    if found and report:
        # File exists in VT database
        stats = report.get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
        is_malicious, reason = scanner.is_malicious(stats)
        
        if is_malicious:
            return False, f"VirusTotal: {reason}"
        else:
            return True, f"VirusTotal: File verified clean (hash: {file_hash[:16]}...)"
    
    # File not in database - upload for scanning
    success, analysis_id = scanner.upload_and_scan(archive_bytes, f"{appid}.zip")
    
    if not success:
        # Upload failed - allow file but log warning
        return True, "VirusTotal: Upload failed, skipping scan"
    
    # Wait for scan result
    completed, stats = scanner.wait_for_result(analysis_id)
    
    if not completed:
        # Scan timed out - allow file but log warning
        return True, "VirusTotal: Scan timed out, allowing file"
    
    is_malicious, reason = scanner.is_malicious(stats)
    
    if is_malicious:
        return False, f"VirusTotal: {reason}"
    else:
        return True, f"VirusTotal: Scan complete, file is clean"


def scan_file(file_data: bytes, appid: str, filename: str = "file.lua", api_key: Optional[str] = None) -> Tuple[bool, str]:
    """
    Scan any file for malware using VirusTotal.
    
    Args:
        file_data: Raw file bytes
        appid: Steam app ID (for logging)
        filename: Name for the file (e.g. "12345.lua")
        api_key: Optional VT API key
        
    Returns:
        Tuple of (is_safe, message)
    """
    if not requests:
        return True, "VirusTotal check skipped (requests module not available)"
    
    scanner = VirusTotalScanner(api_key)
    
    # First, check if file hash already exists in VT
    file_hash = scanner._calculate_sha256(file_data)
    found, report = scanner.check_hash(file_hash)
    
    if found and report:
        stats = report.get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
        is_malicious, reason = scanner.is_malicious(stats)
        
        if is_malicious:
            return False, f"VirusTotal: {reason}"
        else:
            return True, f"VirusTotal: File verified clean (hash: {file_hash[:16]}...)"
    
    # File not in database - upload for scanning
    success, analysis_id = scanner.upload_and_scan(file_data, filename)
    
    if not success:
        return True, "VirusTotal: Upload failed, skipping scan"
    
    # Wait for scan result
    completed, stats = scanner.wait_for_result(analysis_id)
    
    if not completed:
        return True, "VirusTotal: Scan timed out, allowing file"
    
    is_malicious, reason = scanner.is_malicious(stats)
    
    if is_malicious:
        return False, f"VirusTotal: {reason}"
    else:
        return True, f"VirusTotal: Scan complete, file is clean"


def scan_text(text_content: str, appid: str, api_key: Optional[str] = None) -> Tuple[bool, str]:
    """
    Scan text content (like .lua files) for malware.
    
    Args:
        text_content: Text content to scan
        appid: Steam app ID
        api_key: Optional VT API key (required for VT API v3)
        
    Returns:
        Tuple of (is_safe, message)
    """
    if not api_key:
        return True, "VirusTotal check skipped (no API key configured)"
    
    if not text_content:
        return True, "Empty content, skipping scan"
    
    # Convert text to bytes
    file_data = text_content.encode('utf-8')
    return scan_file(file_data, appid, f"{appid}.lua", api_key)
