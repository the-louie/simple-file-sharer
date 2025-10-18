#!/usr/bin/env python3
"""
Simple File Sharer Client Library
Shared upload functionality for macOS and Linux tools

Requirements: Python 3.8+ (uses walrus operator)
"""
import hashlib
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List, Union
from urllib.parse import urljoin, urlparse

try:
    import requests
except ImportError:
    print("Error: requests library not found. Install: pip3 install requests")
    sys.exit(1)


class SFSClient:
    """Simple File Sharer client with authentication and retry logic"""
    
    CHUNK_SIZE = 2 * 1024 * 1024  # 2MB to match server
    MAX_RETRIES = 10
    RETRY_DELAYS = [1, 2, 4, 8, 16, 30, 30, 30, 30, 30]  # Exponential backoff
    
    def __init__(self, server_url: str, config_dir: str = None):
        """
        Initialize SFS client
        
        Args:
            server_url: Base URL of server (e.g., https://files.example.com)
            config_dir: Optional config directory path (default: ~/.sfs)
            
        Raises:
            ValueError: If server_url is not a valid URL
        """
        # Validate server URL
        if not server_url:
            raise ValueError("server_url cannot be empty")
        
        parsed = urlparse(server_url)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError(f"Invalid server URL: {server_url}")
        
        self.server_url = server_url.rstrip('/') + '/'
        self.config_dir = Path(config_dir or os.path.expanduser('~/.sfs'))
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.session_file = self.config_dir / 'session.json'
        self.session = requests.Session()
        self._load_session()
    
    def _load_session(self) -> bool:
        """Load session token if exists and valid"""
        if self.session_file.exists():
            try:
                data = json.loads(self.session_file.read_text())
                if data.get('expires_at', 0) > time.time():
                    self.session.cookies.set('sid', data['token'])
                    return True
            except (json.JSONDecodeError, KeyError):
                pass
        return False
    
    def _save_session(self, token: str, expires_in: int = 31536000):
        """
        Save session token (default: 1 year)
        
        Args:
            token: Session token from server
            expires_in: Expiration time in seconds (default: 1 year)
        """
        data = {
            'token': token,
            'expires_at': time.time() + expires_in
        }
        self.session_file.write_text(json.dumps(data))
        self.session_file.chmod(0o600)
    
    def login(self, username: str, password: str) -> bool:
        """
        Authenticate and store long-lived session
        
        Args:
            username: Username
            password: Password
            
        Returns:
            True if login successful, False otherwise
        """
        try:
            resp = self.session.post(
                urljoin(self.server_url, 'login'),
                data={'username': username, 'password': password},
                allow_redirects=False
            )
            if resp.status_code == 302:  # Successful login redirects
                token = self.session.cookies.get('sid')
                if token:
                    self._save_session(token)
                    return True
            return False
        except Exception as e:
            print(f"Login error: {e}")
            return False
    
    def ensure_authenticated(self) -> bool:
        """
        Check auth, prompt for credentials if needed
        
        Returns:
            True if authenticated, False if authentication failed
        """
        # Test if current session works
        try:
            resp = self.session.get(urljoin(self.server_url, 'api/quota'))
            if resp.status_code == 200:
                return True
        except:
            pass
        
        # Need to login
        print("Authentication required")
        username = input("Username: ")
        
        # Try to use getpass for password input (hidden)
        try:
            from getpass import getpass
            password = getpass("Password: ")
        except ImportError:
            password = input("Password (visible): ")
        
        if self.login(username, password):
            print("Login successful")
            return True
        print("Login failed")
        return False
    
    def calculate_checksum(self, filepath: Union[str, Path]) -> str:
        """
        Calculate SHA-256 checksum of entire file
        
        Args:
            filepath: Path to file (str or Path object)
            
        Returns:
            Hexadecimal SHA-256 hash string
        """
        filepath = Path(filepath) if not isinstance(filepath, Path) else filepath
        sha256 = hashlib.sha256()
        with open(filepath, 'rb') as f:
            while chunk := f.read(8192):
                sha256.update(chunk)
        return sha256.hexdigest()
    
    def upload_file(self, filepath: Union[str, Path], collection_id: Optional[str] = None,
                   progress_callback=None) -> Optional[Dict[str, Any]]:
        """
        Upload file with retry logic and progress tracking
        
        Args:
            filepath: Path to file to upload (str or Path object)
            collection_id: Optional collection UUID for grouping files
            progress_callback: Optional callback(phase, current, total)
            
        Returns:
            Dict with 'success' and 'url' or 'error' on failure
        """
        # Ensure filepath is a Path object
        filepath = Path(filepath) if not isinstance(filepath, Path) else filepath
        
        if not filepath.exists():
            return {'error': 'File not found'}
        
        file_uuid = str(uuid.uuid4())
        file_size = filepath.stat().st_size
        chunk_count = (file_size + self.CHUNK_SIZE - 1) // self.CHUNK_SIZE
        
        # Calculate checksum
        if progress_callback:
            progress_callback('checksum', 0, 1)
        checksum = self.calculate_checksum(filepath)
        
        # Upload chunks
        with open(filepath, 'rb') as f:
            for chunk_idx in range(chunk_count):
                data = f.read(self.CHUNK_SIZE)
                success = self._upload_chunk_with_retry(
                    data, chunk_idx, file_uuid, chunk_count, chunk_idx + 1, progress_callback
                )
                if not success:
                    return {'error': f'Failed to upload chunk {chunk_idx}'}
        
        # Merge chunks
        if progress_callback:
            progress_callback('merging', chunk_count, chunk_count)
        
        params = {
            'name': filepath.name,
            'chunkCount': chunk_count,
            'uuid': file_uuid,
            'checksum': checksum
        }
        if collection_id:
            params['collectionID'] = collection_id
        
        try:
            resp = self.session.post(
                urljoin(self.server_url, 'merge'),
                params=params
            )
            if resp.status_code == 200:
                result = resp.json()
                return {
                    'success': True,
                    'url': urljoin(self.server_url, f"d/{result['fileName']}"),
                    'filename': result['fileName']
                }
            else:
                error_msg = f'Merge failed: HTTP {resp.status_code}'
                try:
                    error_data = resp.json()
                    if 'error' in error_data:
                        error_msg = error_data['error']
                except:
                    pass
                return {'error': error_msg}
        except Exception as e:
            return {'error': f'Merge error: {e}'}
    
    def _upload_chunk_with_retry(self, data: bytes, chunk_idx: int, file_uuid: str,
                                 total_chunks: int, current: int, progress_callback) -> bool:
        """
        Upload single chunk with exponential backoff retry
        
        Args:
            data: Chunk data bytes
            chunk_idx: Zero-based chunk index
            file_uuid: UUID for this upload session
            total_chunks: Total number of chunks
            current: Current chunk number (1-based, for display)
            progress_callback: Optional callback for progress
            
        Returns:
            True if upload successful, False otherwise
        """
        for attempt in range(self.MAX_RETRIES):
            try:
                resp = self.session.post(
                    urljoin(self.server_url, 'upload'),
                    params={'chunkIndex': chunk_idx, 'uuid': file_uuid},
                    data=data,
                    headers={'Content-Type': 'application/octet-stream'},
                    timeout=300
                )
                if resp.status_code == 200:
                    if progress_callback:
                        progress_callback('uploading', current, total_chunks)
                    return True
                elif resp.status_code in [403, 413, 422, 429, 507]:
                    # Don't retry these errors - they're not transient
                    print(f"Server rejected chunk: HTTP {resp.status_code}")
                    try:
                        error_data = resp.json()
                        if 'error' in error_data:
                            print(f"Error: {error_data['error']}")
                    except:
                        pass
                    return False
            except Exception as e:
                if attempt < self.MAX_RETRIES - 1:
                    print(f"Chunk {chunk_idx} attempt {attempt + 1} failed: {e}")
            
            if attempt < self.MAX_RETRIES - 1:
                time.sleep(self.RETRY_DELAYS[attempt])
        
        return False
    
    def upload_multiple(self, filepaths: List[Path], progress_callback=None) -> Dict[str, Any]:
        """
        Upload multiple files as a collection
        
        Args:
            filepaths: List of file paths to upload
            progress_callback: Optional callback(phase, current, total)
            
        Returns:
            Dict with 'success' and 'collection_url' or 'error'
        """
        if len(filepaths) == 1:
            return self.upload_file(filepaths[0], progress_callback=progress_callback)
        
        collection_id = str(uuid.uuid4())
        results = []
        
        for idx, filepath in enumerate(filepaths):
            if progress_callback:
                progress_callback('file', idx + 1, len(filepaths))
            result = self.upload_file(filepath, collection_id, progress_callback)
            results.append(result)
        
        success_count = sum(1 for r in results if r.get('success'))
        if success_count > 0:
            return {
                'success': True,
                'collection_url': urljoin(self.server_url, f"c/{collection_id}"),
                'collection_id': collection_id,
                'uploaded': success_count,
                'total': len(filepaths)
            }
        return {'error': 'All uploads failed'}

