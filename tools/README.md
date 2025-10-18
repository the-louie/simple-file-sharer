# Simple File Sharer - Desktop Upload Tools

Modern desktop upload tools for macOS and Linux with authentication, retry logic, and checksum verification.

## Available Tools

### macOS - Shortcuts Integration
**Location:** `tools/macos/`

- Unified Shortcuts-based tool for screenshots and file uploads
- Keyboard shortcut support (e.g., ⌘⇧U)
- Right-click menu integration in Finder
- Native macOS notifications
- Automatic clipboard copying

**[Read Installation Guide →](macos/README.md)**

---

### Linux - CLI Tool
**Location:** `tools/linux/`

- Command-line tool with subcommands
- Screenshot capture and upload
- Batch file uploads
- Progress bars and status indicators
- Desktop environment integration (GNOME, KDE, i3, sway)

**[Read Installation Guide →](linux/README.md)**

---

## Shared Features

Both tools share common functionality via `tools/lib/sfs_client.py`:

- ✅ **Long-lived authentication** - 1-year session tokens
- ✅ **SHA-256 checksum verification** - Ensures file integrity
- ✅ **Smart retry logic** - Up to 10 attempts with exponential backoff (1s → 30s)
- ✅ **Progress tracking** - Real-time upload progress
- ✅ **Collection support** - Multiple files grouped with single URL
- ✅ **Clipboard integration** - URLs automatically copied
- ✅ **Modern security** - HTTPS, proper authentication
- ✅ **Error handling** - User-friendly messages for quota, blocked types, etc.

## Quick Start

### macOS
```bash
# Install dependencies
pip3 install --user -r tools/requirements.txt

# Edit server URL
nano tools/macos/sfs-shortcut.py

# Test
python3 tools/macos/sfs-shortcut.py
```

### Linux
```bash
# Install dependencies
pip3 install --user -r tools/requirements.txt

# Install CLI tool
cp tools/linux/sfs ~/.local/bin/
chmod +x ~/.local/bin/sfs

# Configure
sfs config
sfs login

# Use
sfs upload file.txt
sfs screenshot
```

## Architecture

```
tools/
├── lib/
│   ├── __init__.py           # Package init
│   └── sfs_client.py         # Shared client library
├── macos/
│   ├── sfs-shortcut.py       # macOS Shortcuts helper
│   └── README.md             # Installation guide
├── linux/
│   ├── sfs                   # Linux CLI tool
│   └── README.md             # Installation guide
├── osx-workflows/            # Legacy (deprecated)
│   ├── README.md             # Deprecation notice
│   └── REVIEW.md             # Analysis of old workflows
├── requirements.txt          # Python dependencies
└── README.md                 # This file
```

## Dependencies

**Python:** 3.8+ (required for walrus operator in checksum calculation)

**Python packages:**
```bash
pip3 install -r requirements.txt
```
- `requests>=2.31.0` - HTTP client library

**Platform-specific:**
- **macOS:** screencapture (built-in), pbcopy (built-in)
- **Linux:** gnome-screenshot/scrot/maim (any one), xclip/xsel (optional)

## Migration from Legacy Tools

If you're upgrading from the old OSX Automator workflows:

**What changed:**
- ✅ Python 3 instead of Python 2
- ✅ Modern API with authentication
- ✅ SHA-256 checksums for integrity
- ✅ Retry logic for reliability
- ✅ HTTPS support
- ✅ Better error messages
- ✅ Collection URL format: `/c/` instead of `?c=`

**Migration steps:**
1. Install new tools (see platform-specific READMEs)
2. Remove old Automator workflows from Services
3. Delete old scripts: `tools/sfs_upload.py`, `tools/sfs_screenshot.sh`, `tools/sfs_osx_helper.sh`

See [osx-workflows/REVIEW.md](osx-workflows/REVIEW.md) for detailed analysis of legacy tools.

## Testing

### Test authentication:
```bash
# macOS
python3 tools/macos/sfs-shortcut.py

# Linux
sfs login
```

### Test upload:
```bash
# macOS
echo "test" > /tmp/test.txt
python3 tools/macos/sfs-shortcut.py /tmp/test.txt

# Linux
echo "test" > /tmp/test.txt
sfs upload /tmp/test.txt
```

## Troubleshooting

### "requests library not found"
```bash
pip3 install --user requests
```

### "Authentication failed"
- Verify server URL is correct
- Check username/password
- Ensure server is running

### "Server rejected chunk: HTTP 429"
- You've exceeded upload quota
- Wait or contact administrator

### Progress not showing
- Normal for small files (<2MB)
- Large files show chunk-by-chunk progress

### Clipboard not working
- **macOS:** pbcopy should be built-in
- **Linux:** Install xclip or xsel

## Development

**Modify chunk size or retry count:**
Edit `tools/lib/sfs_client.py`:
```python
CHUNK_SIZE = 2 * 1024 * 1024  # 2MB default
MAX_RETRIES = 10  # 10 attempts default
RETRY_DELAYS = [1, 2, 4, 8, 16, 30, 30, 30, 30, 30]
```

**Add new features:**
The shared library (`sfs_client.py`) can be extended with additional methods for new functionality.

## License

Copyright © 2025 the_louie

See the main [LICENSE](../LICENSE) file for details.
