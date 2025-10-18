#!/usr/bin/env python3
"""
Simple File Sharer - macOS Shortcut Helper
Auto-detects input type (screenshot or files) and uploads

Usage:
  - No arguments: Takes screenshot and uploads
  - With arguments: Uploads specified files
"""
import sys
import os
import subprocess
import tempfile
from pathlib import Path
from datetime import datetime

# Add lib to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'lib'))
from sfs_client import SFSClient

# Configuration - EDIT THIS
SERVER_URL = "https://your-server.com/"

def take_screenshot() -> Path:
    """Capture interactive screenshot, return temp file path"""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    tmpdir = Path(tempfile.gettempdir()) / 'sfs'
    tmpdir.mkdir(exist_ok=True)
    filepath = tmpdir / f"sfs_{timestamp}.png"
    
    # Use screencapture with interactive selection
    try:
        subprocess.run(['screencapture', '-ix', str(filepath)], check=True)
    except subprocess.CalledProcessError as e:
        return None
    
    if not filepath.exists() or filepath.stat().st_size == 0:
        return None
    
    return filepath

def progress_callback(phase, current, total):
    """Print progress for user feedback"""
    if phase == 'checksum':
        print("Calculating checksum...")
    elif phase == 'uploading':
        percent = (current / total) * 100
        print(f"Uploading: {current}/{total} chunks ({percent:.1f}%)")
    elif phase == 'merging':
        print("Merging chunks on server...")
    elif phase == 'file':
        print(f"Processing file {current}/{total}...")

def notify_success(title, message, url):
    """Display macOS notification"""
    subprocess.run([
        'osascript', '-e',
        f'display notification "{message}" with title "{title}" subtitle "{url}"'
    ], check=False)
    # Play success sound
    subprocess.run(['afplay', '/System/Library/Sounds/Purr.aiff'], check=False)

def notify_failure(title, message):
    """Display failure notification"""
    subprocess.run([
        'osascript', '-e',
        f'display notification "{message}" with title "{title}"'
    ], check=False)
    # Play error sound
    subprocess.run(['afplay', '/System/Library/Sounds/Basso.aiff'], check=False)

def copy_to_clipboard(text):
    """Copy text to macOS clipboard"""
    try:
        process = subprocess.Popen(['pbcopy'], stdin=subprocess.PIPE)
        process.communicate(text.encode('utf-8'))
        return True
    except:
        return False

def main():
    # Initialize client
    try:
        client = SFSClient(SERVER_URL)
    except ValueError as e:
        notify_failure("Configuration Error", str(e))
        print(f"Error: {e}")
        sys.exit(1)
    
    # Ensure authenticated
    if not client.ensure_authenticated():
        notify_failure("Upload Failed", "Authentication required")
        sys.exit(1)
    
    # Determine input type
    if len(sys.argv) > 1:
        # Files provided as arguments
        filepaths = [Path(arg) for arg in sys.argv[1:]]
        mode = "file"
    else:
        # No arguments = screenshot mode
        screenshot_path = take_screenshot()
        if not screenshot_path:
            notify_failure("Screenshot Failed", "No screenshot captured")
            sys.exit(1)
        filepaths = [screenshot_path]
        mode = "screenshot"
    
    # Upload
    if len(filepaths) == 1:
        result = client.upload_file(filepaths[0], progress_callback=progress_callback)
        if result.get('success'):
            url = result['url']
            copy_to_clipboard(url)
            notify_success(
                "Upload Successful",
                "URL copied to clipboard",
                url
            )
            print(url)  # Output for Shortcut
            
            # Clean up screenshot temp file
            if mode == "screenshot":
                try:
                    filepaths[0].unlink()
                except:
                    pass
        else:
            notify_failure("Upload Failed", result.get('error', 'Unknown error'))
            print(f"Error: {result.get('error')}")
            sys.exit(1)
    else:
        result = client.upload_multiple(filepaths, progress_callback=progress_callback)
        if result.get('success'):
            url = result['collection_url']
            copy_to_clipboard(url)
            notify_success(
                "Collection Uploaded",
                f"{result['uploaded']}/{result['total']} files",
                url
            )
            print(url)
        else:
            notify_failure("Upload Failed", result.get('error', 'Unknown error'))
            print(f"Error: {result.get('error')}")
            sys.exit(1)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        notify_failure("Upload Cancelled", "Upload interrupted by user")
        print("\nCancelled")
        sys.exit(130)
    except Exception as e:
        notify_failure("Upload Error", f"Unexpected error: {str(e)}")
        print(f"Unexpected error: {e}")
        sys.exit(1)

