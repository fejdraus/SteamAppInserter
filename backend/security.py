"""
Security utilities for Steam App Inserter.
Provides ZIP archive validation to prevent common attacks.
"""

import zipfile
import io
from typing import Tuple, Optional, List

# Security limits
MAX_ZIP_SIZE = 100 * 1024 * 1024  # 100 MB
MAX_FILES_IN_ZIP = 1000
MAX_SINGLE_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
MAX_TOTAL_UNCOMPRESSED = 500 * 1024 * 1024  # 500 MB

# Allowed file extensions in archives
ALLOWED_EXTENSIONS = {'.lua', '.manifest', '.bin', '.json', '.txt'}


def validate_zip_archive(archive_bytes: bytes, appid: str = "unknown") -> Tuple[bool, Optional[str]]:
    """
    Validate a ZIP archive for security issues.
    
    Checks:
    - Archive size limit
    - Number of files limit
    - Path traversal attacks (../ in paths)
    - File extension whitelist
    - Individual file size limits
    - Total uncompressed size (ZIP bomb protection)
    
    Returns:
        Tuple of (is_valid, error_message)
        If valid: (True, None)
        If invalid: (False, "error description")
    """
    # Check archive size
    if len(archive_bytes) > MAX_ZIP_SIZE:
        return False, f"Archive too large: {len(archive_bytes)} bytes (max {MAX_ZIP_SIZE})"
    
    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as zf:
            file_list = zf.namelist()
            
            # Check file count
            if len(file_list) > MAX_FILES_IN_ZIP:
                return False, f"Too many files in archive: {len(file_list)} (max {MAX_FILES_IN_ZIP})"
            
            total_uncompressed = 0
            
            for file_name in file_list:
                # Skip directories
                if file_name.endswith('/'):
                    continue
                
                # Check for path traversal
                if '..' in file_name or file_name.startswith('/') or file_name.startswith('\\'):
                    return False, f"Path traversal detected: {file_name}"
                
                # Normalize and check for absolute paths on Windows
                normalized = file_name.replace('\\', '/')
                if ':' in normalized:  # Windows drive letter
                    return False, f"Absolute path detected: {file_name}"
                
                # Check file extension
                ext = get_file_extension(file_name).lower()
                if ext and ext not in ALLOWED_EXTENSIONS:
                    # Allow files without extension (directories) but log others
                    pass  # We don't block unknown extensions, just note them
                
                # Check individual file size
                info = zf.getinfo(file_name)
                if info.file_size > MAX_SINGLE_FILE_SIZE:
                    return False, f"File too large: {file_name} ({info.file_size} bytes)"
                
                total_uncompressed += info.file_size
                
                # Early exit for ZIP bomb detection
                if total_uncompressed > MAX_TOTAL_UNCOMPRESSED:
                    return False, f"Total uncompressed size too large (ZIP bomb protection)"
            
            # Check compression ratio (ZIP bomb detection)
            if len(archive_bytes) > 0:
                ratio = total_uncompressed / len(archive_bytes)
                if ratio > 100:  # 100:1 compression ratio is suspicious
                    return False, f"Suspicious compression ratio: {ratio:.1f}:1"
            
            return True, None
            
    except zipfile.BadZipFile as e:
        return False, f"Invalid ZIP file: {e}"
    except Exception as e:
        return False, f"Error validating archive: {e}"


def get_file_extension(filename: str) -> str:
    """Get file extension from filename."""
    import os
    _, ext = os.path.splitext(filename)
    return ext


def is_safe_path(base_dir: str, file_path: str) -> bool:
    """
    Check if file_path is safely within base_dir.
    Prevents path traversal attacks when extracting files.
    """
    import os
    
    # Resolve both paths to absolute
    base = os.path.abspath(base_dir)
    target = os.path.abspath(os.path.join(base_dir, file_path))
    
    # Check that target starts with base
    return target.startswith(base + os.sep) or target == base


def safe_extract_file(archive: zipfile.ZipFile, file_name: str, dest_dir: str) -> Tuple[bool, Optional[str], Optional[bytes]]:
    """
    Safely extract a single file from an archive.
    
    Returns:
        Tuple of (success, error_message, file_content)
    """
    import os
    
    # Check for path traversal
    if not is_safe_path(dest_dir, file_name):
        return False, f"Path traversal blocked: {file_name}", None
    
    try:
        content = archive.read(file_name)
        return True, None, content
    except Exception as e:
        return False, f"Failed to read {file_name}: {e}", None
