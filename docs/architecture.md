# Application Architecture

This document details the backend and frontend architecture of Simple File Sharer.

## Backend Architecture

### Main Application (`index.js`)

**Structure (~1500 lines):**

```javascript
// 1. Imports & Dependencies (lines 1-15)
import fs, crypto, express, session, passport, bcrypt, helmet, etc.

// 2. Security Configuration (lines 16-39)
helmet() middleware with CSP

// 3. Helper Functions (lines 40-281)
- log(), logError() - ISO timestamp logging
- handleValidationErrors() - Input validation
- checkUploadQuotas() - Parallel quota checks
- audit() - Security event logging
- sanitizeFilename() - Path traversal prevention
- timingSafeEqual() - Timing attack prevention
- hashIP() - GDPR-compliant IP hashing
- getEncryptionKey() - PBKDF2 key derivation
- encryptChunk(), decryptChunk() - AES-256-GCM

// 4. Configuration (lines 282-300)
Load config.json with fallback defaults
Validate SESSION_SECRET environment variable

// 5. Database Setup (lines 301-366)
Create tables: uploaded_files, uploaded_chunks, audit_log, users
Create indices for performance

// 6. Cleanup Functions (lines 367-513)
- cleanupOrphanedChunks() - Delete chunks >24h old
- cleanupOldFiles() - File retention policy
- cleanupOldAuditLogs() - Audit log retention

// 7. Authentication Setup (lines 514-795)
- failedLogins tracking for account lockout
- activeSessions tracking for concurrent limits
- Rate limiters (login, upload, download)
- Passport.js LocalStrategy with multi-user support
- Session configuration with security options

// 8. Routes (lines 796-1349)
- POST /upload - Chunk upload with encryption
- POST /merge - Merge chunks with checksum verification
- GET /d/:fileName - Download file
- GET /c/:collectionID - View collection
- GET /api/quota - Quota usage API
- POST /login - Authentication endpoint
- GET /login - Login page

// 9. Server Start (lines 1350-1353)
app.listen() with configuration
```

### Key Design Patterns

**1. Async/Await Pattern:**
```javascript
// All file operations are async to prevent event loop blocking
const data = await fsPromises.readFile(path);
const result = await checkUploadQuotas(ip);
```

**2. Promise-Based Database Helpers:**
```javascript
function dbGet(query, params) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

// Enables parallel queries
const [globalRow, ipRow, filesRow] = await Promise.all(queries);
```

**3. Middleware Chaining:**
```javascript
app.post('/upload',
  uploadLimiter,                    // Rate limiting
  query('uuid').isUUID(4),          // Validation
  handleValidationErrors,           // Error handler
  async function(req, res) { }      // Route handler
);
```

**4. Encryption at Rest:**
```javascript
// Write: plaintext → encrypt → disk
const encryptedChunk = encryptChunk(fileBuffer);
chunkFile.write(encryptedChunk);

// Read: disk → decrypt → plaintext
const encryptedData = await fsPromises.readFile(chunkPath);
const chunkData = decryptChunk(encryptedData);
```

---

## Frontend Architecture

### File Structure

```
static/
├── index.html          # Main upload page
├── login.html          # Login page
├── css/
│   └── style.css       # Styling
└── js/
    ├── global.js       # Main UI logic (~650 lines)
    └── upload.webworker.js  # Upload worker (~414 lines)
```

### Main UI Logic (`global.js`)

**Key Components:**

```javascript
// 1. Utility Functions (lines 1-45)
- guid() - UUID v4 generation
- getUrlVars() - Parse URL parameters
- humanFileSize() - Format bytes
- relativeTime() - Format timestamps

// 2. Debug System (lines 1-16)
- debug flag (disabled by default)
- debugLog() - Conditional logging
- Enable via ?debug=1 or localStorage

// 3. Clipboard Functions (lines 89-245)
- copyToClipboard() - Modern Clipboard API
- fallbackCopyTextToClipboard() - Legacy support
- Toast notifications for errors

// 4. State Management (lines 246-265)
var allFiles = [];           // Queue of files to upload
var currentFileID = 0;       // Current file being processed
var locked = false;          // Upload lock
var uploadsInProgress = false; // For beforeunload warning
var uploadWorker = null;     // Reusable worker

// 5. Core Functions (lines 266-548)
- setupUploadWarning() - Prevent accidental navigation
- loadQuotaInfo() - Fetch quota data via API
- handleNewFiles() - Process dropped/selected files
- uploadFinish() - Mark file as complete
- handleNextFile() - Sequential file processing

// 6. Worker Management (lines 223-228)
- getUploadWorker() - Lazy worker initialization
- Worker reused for all uploads (performance)
- Recreated on error (safety)

// 7. Collection View (lines 549-629)
- Load collection via XHR
- Display files with metadata
- Handle expired collections (HTTP 410)

// 8. Initialization (lines 630-653)
- Drop zone setup
- File input handler
- Collection URL creation
- Quota info loading
```

### Upload Web Worker (`upload.webworker.js`)

**Worker Lifecycle:**

```javascript
// 1. Initialization (onmessage event)
self.onmessage = function(e) {
  self.blob = e.data.file;
  self.chunkCount = Math.ceil(self.blob.size / CHUNK_SIZE);
  
  // Calculate SHA-256 checksum of entire file
  self.blob.arrayBuffer()
    .then(buffer => crypto.subtle.digest('SHA-256', buffer))
    .then(hash => {
      self.fileChecksum = convertToHex(hash);
      uploadNextChunk(); // Start upload
    });
};

// 2. Sequential Upload
uploadNextChunk() {
  // Find next chunk with status 0 (not started)
  // Upload one chunk at a time
  // Mark as status 3 (complete)
  // Save progress to localStorage
  // Continue to next chunk
}

// 3. Retry Logic
handleFailure(reason) {
  self.chunkRetries[index]++;
  if (retries >= MAX_RETRIES) {
    // Abort upload
  } else {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
    setTimeout(() => uploadNextChunk(), retryDelay);
  }
}

// 4. Merge Request
if (allChunksComplete) {
  POST /merge?checksum=<sha256>&chunkCount=N&uuid=<uuid>
  // Server verifies checksum matches
}
```

**Worker State:**

```javascript
self.blob           // File being uploaded
self.fileName       // Original filename
self.uuid           // Upload session ID
self.chunkCount     // Total chunks
self.chunkList      // Status array [0=pending, 2=uploading, 3=complete]
self.chunkRetries   // Retry counter per chunk
self.activeXHRs     // Active XHR objects per chunk
self.chunksSent     // Count of completed chunks
self.fileChecksum   // SHA-256 of entire file
```

---

**Copyright © 2025 the_louie**
