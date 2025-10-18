# Linux CLI Tool Installation

Command-line upload tool for Linux with subcommands for file upload and screenshots.

## Prerequisites

### Python 3.8+
```bash
# Debian/Ubuntu
sudo apt install python3 python3-pip

# Fedora
sudo dnf install python3 python3-pip

# Arch
sudo pacman -S python python-pip
```

### Python Dependencies
```bash
cd /path/to/simple-file-sharer
pip3 install --user -r tools/requirements.txt
```

### Screenshot Tools (install at least one)
```bash
# GNOME Screenshot (recommended for GNOME desktop)
sudo apt install gnome-screenshot

# scrot (lightweight, works everywhere)
sudo apt install scrot

# maim (modern, feature-rich)
sudo apt install maim

# ImageMagick (if you already have it)
sudo apt install imagemagick
```

### Clipboard Support (optional but recommended)
```bash
# xclip (recommended)
sudo apt install xclip

# or xsel
sudo apt install xsel
```

## Installation

### 1. Copy Script to User Bin

```bash
mkdir -p ~/.local/bin
cp tools/linux/sfs ~/.local/bin/
chmod +x ~/.local/bin/sfs
```

### 2. Add to PATH

If `~/.local/bin` is not in your PATH:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

For other shells:
- **zsh:** `~/.zshrc`
- **fish:** `~/.config/fish/config.fish`

### 3. First Run Configuration

```bash
sfs config
# Enter your server URL when prompted

sfs login
# Enter username and password
```

## Usage

### Upload Files

```bash
# Single file
sfs upload photo.jpg

# Multiple files as collection
sfs upload *.png
sfs upload document.pdf presentation.pptx data.csv

# With globbing
sfs upload ~/Downloads/*.jpg
```

### Screenshot and Upload

```bash
sfs screenshot
# Select screen area with mouse
# URL automatically copied to clipboard
```

### Manage Configuration

```bash
# Configure server URL
sfs config

# Show current configuration
sfs config --show

# Re-authenticate
sfs login
```

## Keyboard Shortcuts

Add screenshot shortcut to your desktop environment:

### GNOME/Ubuntu
1. **Settings** → **Keyboard** → **Keyboard Shortcuts** → **Custom Shortcuts**
2. Click **+** to add new shortcut
3. **Name:** `Upload Screenshot`
4. **Command:** `/home/YOUR_USERNAME/.local/bin/sfs screenshot`
5. **Shortcut:** Click and press `Ctrl+Shift+U` (or your preference)

### KDE Plasma
1. **System Settings** → **Shortcuts** → **Custom Shortcuts**
2. **Edit** → **New** → **Global Shortcut** → **Command/URL**
3. **Trigger:** `Ctrl+Shift+U`
4. **Action:** `/home/YOUR_USERNAME/.local/bin/sfs screenshot`

### i3/sway
Add to config file (`~/.config/i3/config` or `~/.config/sway/config`):
```
bindsym $mod+Shift+u exec /home/YOUR_USERNAME/.local/bin/sfs screenshot
```

## Features

- Long-lived authentication (1 year sessions)
- SHA-256 checksum verification
- Automatic retry on network failures (up to 10 attempts)
- Progress bars for large uploads
- Clipboard integration (xclip/xsel)
- Collection support for multiple files
- Auto-detection of screenshot tools
- User-friendly error messages

## Examples

```bash
# Upload vacation photos as collection
sfs upload ~/Pictures/vacation/*.jpg

# Quick screenshot share
sfs screenshot

# Upload and share immediately
sfs upload report.pdf && xdg-open $(pbpaste)

# Batch upload
find ~/Documents -name "*.pdf" -exec sfs upload {} \;
```

## Session Management

Sessions are stored in `~/.sfs/session.json` and last 1 year.

**View session info:**
```bash
cat ~/.sfs/session.json
# Shows: {"token": "...", "expires_at": 1766000000}
```

**Clear session (logout):**
```bash
rm ~/.sfs/session.json
```

**Re-authenticate:**
```bash
sfs login
```

## Troubleshooting

### Command not found
Ensure `~/.local/bin` is in your PATH:
```bash
echo $PATH | grep .local/bin
# If nothing, add to ~/.bashrc as shown in installation
```

### "requests library not found"
Install dependencies:
```bash
pip3 install --user requests
```

### "No screenshot tool found"
Install at least one screenshot tool:
```bash
sudo apt install gnome-screenshot scrot
```

### "Authentication failed"
Check server URL configuration:
```bash
sfs config --show
# Verify URL is correct
```

### Clipboard not working
Install clipboard tool:
```bash
sudo apt install xclip
```

### Permission denied
Make script executable:
```bash
chmod +x ~/.local/bin/sfs
```

### Debug mode
Run with `-h` for help:
```bash
sfs upload -h
sfs screenshot -h
```

For detailed debugging, edit `tools/lib/sfs_client.py` and add print statements.

## Advanced Usage

### Change Server URL
```bash
sfs config
# Enter new server URL
```

### Upload with custom naming
The server generates unique names automatically. To see the generated URL:
```bash
url=$(sfs upload file.txt | tail -1)
echo "File available at: $url"
```

### Integration with other tools

**Upload clipboard screenshot (using scrot):**
```bash
alias scrotup='scrot -s /tmp/scrot.png && sfs upload /tmp/scrot.png && rm /tmp/scrot.png'
```

**File manager integration (Thunar):**
1. Edit → Configure custom actions
2. Name: "Upload to SFS"
3. Command: `sfs upload %F`

**File manager integration (Nautilus):**
Create `~/.local/share/nautilus/scripts/Upload to SFS`:
```bash
#!/bin/bash
sfs upload "$@"
```

## Configuration Reference

**Config file:** `~/.sfs/config`
- Contains server URL
- Plain text file

**Session file:** `~/.sfs/session.json`
- Contains session token and expiry
- Permissions: 600 (read/write for owner only)
- Auto-created on first login
- Valid for 1 year

## Uninstall

```bash
rm ~/.local/bin/sfs
rm -rf ~/.sfs
```

---

**See also:** [tools/README.md](../README.md) for overview of all platform tools.

