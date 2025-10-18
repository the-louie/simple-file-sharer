# Legacy OSX Workflows (DEPRECATED)

⚠️ **DEPRECATED:** These workflows are no longer maintained and **will not work** on modern macOS.

## Why Deprecated?

These 10-year-old workflows have critical compatibility issues:

- ❌ **Python 2 dependency** - Removed from macOS 12.3+ (March 2022)
- ❌ **API incompatibility** - Missing authentication, checksums, updated endpoints
- ❌ **No retry logic** - Fails on any network hiccup
- ❌ **Security issues** - HTTP only, no error handling

**See [REVIEW.md](REVIEW.md) for detailed technical analysis.**

## Modern Alternatives

### For macOS Users
Use the new **macOS Shortcuts tool** in `tools/macos/`:
- ✅ Python 3 compatible
- ✅ Works on macOS 12.3+ (Monterey, Ventura, Sonoma, Sequoia)
- ✅ Modern API with authentication
- ✅ Checksums and retry logic
- ✅ Better error handling

**[Installation Guide →](../macos/README.md)**

### For Linux Users
Use the new **Linux CLI tool** in `tools/linux/`:
- ✅ Command-line interface
- ✅ Multiple screenshot tool support
- ✅ Same reliability and features

**[Installation Guide →](../linux/README.md)**

## Migration

1. **Install new tools** (see links above)
2. **Remove old workflows** from System Settings → Keyboard → Shortcuts
3. These old workflow files can be kept for historical reference

---

## Historical Information

### Original sfs_screenshot
Intended use: Keyboard shortcut for screenshot upload.

### Original sfs_fileupload
Intended use: Right-click menu in Finder for file upload.

**Last compatible macOS version:** 12.2 (February 2022)

**Replacement timeline:**
- 2025-10: New Python 3 tools created
- 2022-03: macOS 12.3 removed Python 2 (workflows broken)
- ~2015: Original workflows created

---

**See [tools/README.md](../README.md) for modern tool overview.**