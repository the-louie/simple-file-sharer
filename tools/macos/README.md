# macOS Shortcuts Installation

Modern file upload tool for macOS using the native Shortcuts app.

## Prerequisites

1. **Python 3** (built-in on macOS 12.3+)
2. **Install Python dependencies:**
   ```bash
   cd /path/to/simple-file-sharer
   pip3 install --user -r tools/requirements.txt
   ```

## Installation

### 1. Configure Server URL

Edit the script to set your server URL:

```bash
nano tools/macos/sfs-shortcut.py
# Change line 21: SERVER_URL = "https://your-server.com/"
```

### 2. Make Script Executable

```bash
chmod +x tools/macos/sfs-shortcut.py
```

### 3. Test Authentication

```bash
python3 tools/macos/sfs-shortcut.py
```

This will:
- Prompt for username/password (first time only)
- Take a screenshot for you to select
- Upload and copy URL to clipboard

## macOS Shortcuts Integration

### Option A: Create Quick Action for Files

1. Open **Automator** (Applications > Automator)
2. Create **New Document** → **Quick Action**
3. Configure settings:
   - **Workflow receives:** `files or folders`
   - **in:** `Finder`
4. Add action: **Run Shell Script**
   - **Shell:** `/bin/bash`
   - **Pass input:** `as arguments`
   - **Script:**
     ```bash
     /usr/bin/env python3 /full/path/to/tools/macos/sfs-shortcut.py "$@"
     ```
5. Save as: **"SFS Upload"**

### Option B: Create Keyboard Shortcut for Screenshots

1. Open **Automator**
2. Create **New Document** → **Quick Action**
3. Configure settings:
   - **Workflow receives:** `no input`
   - **in:** `any application`
4. Add action: **Run Shell Script**
   - **Shell:** `/bin/bash`
   - **Pass input:** `to stdin`
   - **Script:**
     ```bash
     /usr/bin/env python3 /full/path/to/tools/macos/sfs-shortcut.py
     ```
5. Save as: **"SFS Screenshot"**
6. Go to **System Settings** → **Keyboard** → **Keyboard Shortcuts** → **Services**
7. Find "SFS Screenshot" and assign keyboard shortcut (e.g., `⌘⇧U`)

## Usage

### Screenshot Upload
- Press your keyboard shortcut (e.g., `⌘⇧U`)
- Select screen area with mouse
- URL automatically copied to clipboard
- Notification displays success/failure

### File Upload
- Right-click file(s) in Finder
- **Quick Actions** → **SFS Upload**
- URL copied to clipboard
- For multiple files, creates collection URL

## First Use

On first run, you'll be prompted for:
- **Username:** Your account username
- **Password:** Your account password

Session is saved for 1 year (~/.sfs/session.json).

## Features

- Long-lived authentication (1 year sessions)
- SHA-256 checksum verification
- Automatic retry on network failures (up to 10 attempts)
- Progress feedback in terminal
- macOS notifications for success/failure
- Clipboard integration
- Collection support for multiple files

## Troubleshooting

### "Authentication required" every time
Check if session file exists and has correct permissions:
```bash
ls -la ~/.sfs/session.json
# Should show: -rw------- (600 permissions)
```

### "requests library not found"
Install dependencies:
```bash
pip3 install --user requests
```

### Script path issues
Use absolute path in Automator:
```bash
# Find full path:
cd /path/to/simple-file-sharer
pwd
# Use: /full/path/tools/macos/sfs-shortcut.py
```

### Screenshots not captured
The script uses `screencapture -ix` which requires:
- User to select screen area
- Screen Recording permissions (System Settings → Privacy & Security)

### Debug mode
Run script manually to see detailed output:
```bash
python3 tools/macos/sfs-shortcut.py /path/to/test/file.txt
```

## Uninstall

1. Delete Automator Quick Actions:
   - Open **System Settings** → **Keyboard** → **Keyboard Shortcuts** → **Services**
   - Right-click service → **Remove**
2. Remove session data:
   ```bash
   rm -rf ~/.sfs
   ```

## Advanced Configuration

### Change chunk size or retry count
Edit `tools/lib/sfs_client.py`:
```python
CHUNK_SIZE = 2 * 1024 * 1024  # 2MB default
MAX_RETRIES = 10  # 10 attempts default
```

### Multiple servers
Create separate copies of the script with different SERVER_URL values.

---

**See also:** [tools/README.md](../README.md) for overview of all platform tools.

