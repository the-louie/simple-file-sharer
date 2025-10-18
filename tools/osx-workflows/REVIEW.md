# OSX Workflows Review - 2025

## Executive Summary

**Status: ⚠️ BROKEN - These workflows will NOT work on modern macOS**

The workflows were created circa 2015 (Automator 2.5, build 409.2) and are incompatible with:
- Modern macOS (Monterey 12.3+)
- Current Simple File Sharer API
- Modern security requirements

**Recommendation:** Rewrite as modern macOS Shortcuts or standalone Python 3 scripts.

---

## Critical Issues

### 🔴 P0: Python 2 End-of-Life

**Problem:**
- Workflows use `#!/usr/bin/python` which defaulted to Python 2
- Python 2 reached EOL in January 2020
- **macOS 12.3 (Monterey, March 2022) removed Python 2 entirely**
- These workflows will crash immediately on macOS 12.3+

**Evidence:**
```python
# Line 237-308 (sfs_screenshot.workflow)
#! /usr/bin/python
# ...
print "ERROR 'No files specified'"  # Python 2 syntax
```

**Fix Required:**
- Change shebang to `#!/usr/bin/env python3`
- Convert all `print` statements to Python 3 syntax: `print("text")`
- Test `requests` library availability in Python 3

---

### 🔴 P0: API Incompatibility

**Problem:**
The upload script doesn't match the current server API, which has undergone major changes:

**1. Authentication Missing:**
- Current server requires login (Passport.js authentication)
- Workflows have no authentication mechanism
- All uploads will be rejected with HTTP 401/302 redirect

**2. Missing Checksum Verification:**
```python
# Old workflow (missing):
# No checksum calculation

# Current API requires:
POST /merge?checksum=<sha256>&name=...
```
Server now verifies file integrity with SHA-256 checksums.

**3. Collection URL Format Changed:**
```python
# Old: http://{TARGET}?c={collectionUUID}
# New: http://{TARGET}c/{collectionUUID}
```

**4. Error Handling Missing:**
Server now returns JSON error responses for:
- HTTP 403: Blocked file type
- HTTP 413: File too large
- HTTP 422: Checksum mismatch
- HTTP 429: Quota exceeded
- HTTP 507: Server storage full

Current workflow has no handling for these responses.

**5. Chunk Encryption:**
Server now encrypts chunks at rest (AES-256-GCM). While transparent to clients, this affects server-side processing time.

---

### 🟠 P1: No Retry Logic

**Problem:**
```python
# Line 287 (sfs_screenshot.workflow)
res = requests.post(url='...', data=data, headers={'Content-Type': 'application/octet-stream'})
chunkIndex += 1  # Continues regardless of response
```

**Issues:**
- No error checking on upload response
- No retry on network failure
- No timeout handling
- Upload fails silently on transient errors

**Current Implementation:**
The web worker (`upload.webworker.js`) implements:
- 10 retry attempts per chunk
- Exponential backoff (1s → 30s)
- 5-minute timeout per chunk
- Progress persistence to `localStorage`

---

### 🟠 P1: Security Issues

**1. Hardcoded HTTP:**
```python
TARGET="filedrop.int/"
res = requests.post(url='http://{0}upload...'.format(TARGET))
```
- Should use HTTPS
- Uploads transmitted in cleartext
- Vulnerable to MITM attacks

**2. UUID Generation:**
```python
collectionUUID = uuid.uuid1()  # MAC address-based
fileUUID = uuid.uuid1()
```
- `uuid.uuid1()` includes MAC address (privacy concern)
- Should use `uuid.uuid4()` (random)

**3. No Certificate Validation:**
- Missing `verify=True` in requests.post()
- Should verify SSL certificates

---

### 🟠 P1: User Experience Issues

**1. No Progress Indication:**
- Large files upload with no feedback
- User doesn't know if upload is progressing or stalled

**2. Notification Quality:**
```python
"The filedrop URL are on your clipboard"  # Grammatical error
```

**3. Missing Features:**
- No upload progress bar
- No pause/resume capability
- No upload history
- No file size validation before upload

---

## Modern macOS Considerations

### Automator vs Shortcuts

**Automator (Current):**
- ✅ Still works on macOS 15 Sequoia
- ⚠️ No longer actively developed
- ⚠️ Last major update: macOS 10.14 (2018)
- ❌ Not available on iOS/iPadOS

**Shortcuts (Modern):**
- ✅ Introduced macOS 12 Monterey (2021)
- ✅ Actively developed by Apple
- ✅ Cross-platform (macOS/iOS/iPadOS/watchOS)
- ✅ Better UI/UX
- ✅ iCloud sync
- ❌ More limited shell scripting capabilities

**Recommendation:** Migrate to Shortcuts for better long-term support.

---

### Modern Screenshot Handling

**Old Method:**
```bash
screencapture -ix "${TMPF}"
```

**Modern Alternatives:**
1. **Shortcuts App:** Built-in "Take Screenshot" action
2. **Screenshot.app:** New in macOS Mojave, has better options
3. **screencapture improvements:** Now supports `-U` (show cursor), `-T` (delay in seconds)

---

## Detailed Code Issues

### Issue 1: Chunk Size Mismatch

**Workflow:**
```python
CHUNKSIZE = 1024*1024  # 1MB
```

**Current Server:**
```javascript
BYTES_PER_CHUNK = 1024 * 1024 * 2  # 2MB
```

**Impact:** Inefficient (2x more HTTP requests than necessary)

---

### Issue 2: Missing File Validation

**Current Workflow:**
```python
if os.path.isdir(fileNamePath):
    continue  # Silently skips directories
```

**Missing Checks:**
- File size validation (server has `max_file_size_bytes`)
- File type validation (server has `blocked_mime_types`)
- Permission checks
- Disk space available

---

### Issue 3: Poor Error Messaging

**Current:**
```python
print "ERROR 'No files specified'"
print "FAIL\n{0}".format(fileName)
```

**Issues:**
- No error codes
- No distinction between failure types
- No actionable guidance for user

---

### Issue 4: Race Condition

**Workflow:**
```python
for f in files:
    chunkIndex = 0
    fileUUID = uuid.uuid1()  # ⚠️ Same UUID for multiple files if loop is fast
```

While unlikely, `uuid.uuid1()` can generate identical UUIDs if called in rapid succession (same timestamp + counter overflow).

**Fix:** Use `uuid.uuid4()` or generate all UUIDs at the start.

---

### Issue 5: No Cleanup on Failure

**Workflow:**
```bash
TMPF=$(mktemp -d -t sfs)"/sfs_"$(date -j +"%Y%m%d%H%M%S")".jpg"
screencapture -ix "${TMPF}"
```

If upload fails, the temporary file is never cleaned up.

**Fix:** Add trap for cleanup:
```bash
cleanup() { rm -f "${TMPF}"; }
trap cleanup EXIT
```

---

## Comparison to Modern Standards

### Current Web Implementation Features

The browser-based uploader (`static/js/upload.webworker.js`) includes:

✅ SHA-256 checksum calculation (Web Crypto API)  
✅ Sequential chunk uploads with retry  
✅ Exponential backoff (1s → 30s)  
✅ Upload progress persistence (localStorage)  
✅ 2MB chunks (optimized)  
✅ Proper error handling  
✅ User-friendly error messages  
✅ Upload warning on page navigation  
✅ Quota information display  

### Workflow Gaps

❌ No checksum calculation  
❌ No retry logic  
❌ No progress persistence  
❌ 1MB chunks (suboptimal)  
❌ Minimal error handling  
❌ Generic error messages  
❌ No upload state management  
❌ No quota awareness  

---

## Testing on Modern macOS

### Compatibility Matrix

| macOS Version | Python 2 | Automator | Verdict |
|---------------|----------|-----------|---------|
| 10.14 Mojave | ✅ Built-in | ✅ Works | ✅ Works (with API fixes) |
| 11 Big Sur | ⚠️ Deprecated | ✅ Works | ⚠️ Python 2 warning |
| 12 Monterey (< 12.3) | ⚠️ Deprecated | ✅ Works | ⚠️ Python 2 warning |
| 12.3 Monterey+ | ❌ Removed | ✅ Works | ❌ **BROKEN** |
| 13 Ventura | ❌ Removed | ✅ Works | ❌ **BROKEN** |
| 14 Sonoma | ❌ Removed | ✅ Works | ❌ **BROKEN** |
| 15 Sequoia | ❌ Removed | ✅ Works | ❌ **BROKEN** |

---

## Recommended Solutions

### Option 1: Update Automator Workflows (Minimal Effort)

**Pros:**
- Keep existing workflow structure
- Familiar for existing users

**Cons:**
- Automator is legacy technology
- Limited future support

**Changes Required:**
1. Change shebang to `#!/usr/bin/env python3`
2. Convert Python 2 → Python 3 syntax
3. Add authentication support
4. Add SHA-256 checksum calculation
5. Update API endpoints
6. Add error handling
7. Add retry logic
8. Fix collection URL format

**Estimated Effort:** 4-6 hours

---

### Option 2: Migrate to macOS Shortcuts (Recommended)

**Pros:**
- Modern, actively supported
- Better UI/UX
- Cross-platform (macOS/iOS)
- iCloud sync

**Cons:**
- Learning curve
- More limited scripting

**Implementation:**
Use Shortcuts to call standalone Python 3 script with better error handling.

**Estimated Effort:** 6-8 hours

---

### Option 3: Standalone Python 3 CLI Tool (Most Flexible)

**Pros:**
- Full control over functionality
- Easy testing and debugging
- Can be packaged as app
- Works across all macOS versions

**Cons:**
- Requires separate installation
- No built-in UI

**Features to Implement:**
```python
# sfs-upload.py
- Python 3.8+ (use typing, async/await)
- Click or argparse for CLI
- Progress bar (tqdm)
- SHA-256 checksum
- Retry logic with exponential backoff
- Configuration file (~/.sfsconfig)
- Authentication (store token securely in Keychain)
- Proper error messages
- Upload resumption
- Batch uploads
```

**Estimated Effort:** 10-12 hours

---

## Migration Plan

### Phase 1: Fix Critical Bugs (1-2 days)

1. ✅ Update to Python 3
2. ✅ Fix API compatibility
3. ✅ Add basic authentication
4. ✅ Add checksum calculation
5. ✅ Update collection URLs

**Deliverable:** Working workflows on modern macOS

---

### Phase 2: Enhance Functionality (2-3 days)

1. ✅ Add retry logic
2. ✅ Improve error handling
3. ✅ Add progress indication
4. ✅ Implement HTTPS
5. ✅ Add file validation
6. ✅ Fix security issues

**Deliverable:** Robust, production-ready workflows

---

### Phase 3: Modernize (3-5 days)

1. ✅ Create Shortcuts version
2. ✅ Build standalone CLI tool
3. ✅ Add configuration UI
4. ✅ Package as macOS app (optional)
5. ✅ Write documentation

**Deliverable:** Modern tooling for all users

---

## Immediate Action Items

### For Users (If you want to use these NOW):

1. **Install Python 3:**
   ```bash
   brew install python3
   ```

2. **Install requests library:**
   ```bash
   python3 -m pip install requests
   ```

3. **Update workflow shebangs manually:**
   - Open workflow in Automator
   - Change `#!/usr/bin/python` → `#!/usr/bin/env python3`
   - Change all `print "x"` → `print("x")`
   - Update `TARGET` variable to your server
   - **Note:** This will NOT fully fix the workflows, but will let them run

4. **Expected Issues:**
   - Authentication will fail (401 errors)
   - Checksums missing (422 errors)
   - Collection URLs will be wrong

---

### For Developers:

See the detailed implementation plan in the `/tools/osx-workflows/MODERNIZATION.md` document (to be created).

---

## Conclusion

These 10-year-old workflows are **fundamentally broken** on modern macOS and **incompatible** with the current Simple File Sharer API. While Automator itself still works, the workflows require substantial updates:

**Critical:** Python 2 → Python 3 migration  
**Critical:** API compatibility (auth, checksums, endpoints)  
**High Priority:** Security fixes (HTTPS, UUID generation)  
**High Priority:** Error handling and retry logic  

**Recommendation:** Invest in Option 3 (standalone Python 3 CLI tool) for the best long-term solution, with Option 2 (Shortcuts) as a user-friendly complement.

---

**Copyright © 2025 the_louie**

