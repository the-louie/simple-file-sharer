# Architecture Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Backend Architecture](#backend-architecture)
3. [Frontend Architecture](#frontend-architecture)
4. [Database Schema](#database-schema)
5. [Security Architecture](#security-architecture)
6. [Upload Flow](#upload-flow)
7. [Download Flow](#download-flow)
8. [Authentication Flow](#authentication-flow)
9. [Data Management](#data-management)
10. [Performance Optimizations](#performance-optimizations)

---

## System Overview

Simple File Sharer is a Node.js-based file sharing application that supports secure, chunked file uploads with enterprise-grade security features.

### High-Level Architecture

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Browser    │ HTTPS   │  Express.js  │  SQL    │   SQLite3    │
│  (Frontend)  │◄───────►│   (Backend)  │◄───────►│  (Database)  │
│              │         │              │         │              │
│ - global.js  │         │  - index.js  │         │ - users      │
│ - worker.js  │         │  - Routes    │         │ - files      │
│ - Crypto API │         │  - Auth      │         │ - chunks     │
└──────────────┘         └──────────────┘         │ - audit_log  │
                                │                  └──────────────┘
                                │
                                ▼
                         ┌──────────────┐
                         │  Filesystem  │
                         │              │
                         │ - /uploads/  │
                         │ - /pending/  │
                         └──────────────┘
```

### Technology Stack

**Backend:**
- Node.js 18+ with ES Modules
- Express.js 4.21+ for HTTP server
- SQLite3 5.1+ for data persistence
- Passport.js for authentication
- bcrypt for password hashing
- helmet.js for security headers
- express-rate-limit for DDoS protection
- express-validator for input sanitization

**Frontend:**
- Vanilla JavaScript (no jQuery dependency)
- Web Workers for chunked uploads
- Web Crypto API for SHA-256 checksums
- localStorage for upload progress persistence
- Modern Clipboard API with fallback

**Security:**
- AES-256-GCM encryption for chunks at rest
- SHA-256 for checksums and IP hashing
- PBKDF2 for key derivation (100k iterations)
- Content Security Policy (CSP)
- XSS protection headers
- CSRF protection via sameSite cookies

---

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

## Database Schema

### Tables

**1. uploaded_files** - Stores completed file metadata

```sql
CREATE TABLE uploaded_files (
  fid INTEGER PRIMARY KEY AUTOINCREMENT,
  fileName TEXT,                      -- Original filename
  sha TEXT UNIQUE,                    -- Short hash for URL
  timestamp INTEGER DEFAULT (strftime('%s', 'now')),
  collectionID TEXT,                  -- UUID for grouping
  fileSize INTEGER,                   -- Bytes
  remote_ip TEXT                      -- Hashed IP (SHA-256)
);

CREATE INDEX idx_uploaded_files_collectionID ON uploaded_files(collectionID);
CREATE INDEX idx_uploaded_files_remote_ip_timestamp ON uploaded_files(remote_ip, timestamp);
```

**2. uploaded_chunks** - Temporary chunk tracking

```sql
CREATE TABLE uploaded_chunks (
  cid INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT,                          -- Upload session ID
  filename TEXT,                      -- Encrypted chunk filename
  chunk_id INT,                       -- Chunk index
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_uploaded_chunks_uuid ON uploaded_chunks(uuid);
```

**3. audit_log** - Security event logging

```sql
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER DEFAULT (strftime('%s', 'now')),
  event_type TEXT,                    -- LOGIN_SUCCESS, UPLOAD_BLOCKED, etc.
  remote_ip TEXT,                     -- Hashed IP
  username TEXT,
  details TEXT,                       -- JSON blob
  status TEXT                         -- SUCCESS, FAILURE, BLOCKED
);
```

**4. users** - Multi-user authentication

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,        -- bcrypt hash
  is_admin INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  last_login INTEGER
);

CREATE INDEX idx_users_username ON users(username);
```

---

## Security Architecture

### Defense in Depth

**Layer 1: Network**
- Rate limiting (express-rate-limit)
  - Login: 5 attempts per 15min per IP
  - Upload: 100 requests per 15min per IP
  - Download: 200 requests per 15min per IP (bypassed for authenticated users)

**Layer 2: Application**
- Helmet.js security headers
  - Content Security Policy (CSP)
  - X-Frame-Options: DENY
  - X-Content-Type-Options: nosniff
  - X-Download-Options: noopen
- Input validation (express-validator)
  - UUID format validation
  - Filename sanitization
  - Integer bounds checking

**Layer 3: Authentication**
- Passport.js LocalStrategy
- Bcrypt password hashing (cost factor: 10)
- Session regeneration on login (prevents fixation)
- Account lockout: 5 failed attempts = 15min lockout
- Concurrent session limits: 3 sessions per user max
- Secure cookies: httpOnly, sameSite:'lax', secure in production

**Layer 4: Data Protection**
- IP address hashing (SHA-256 with secret salt)
- Chunk encryption at rest (AES-256-GCM)
- File integrity verification (SHA-256 checksums)
- Filename sanitization (path traversal prevention)

**Layer 5: Privacy & Compliance**
- GDPR-compliant IP hashing
- Configurable data retention policies
- Audit log expiration
- Collection expiration
- Sanitized console logs

### Encryption Details

**Chunk Encryption (AES-256-GCM):**

```javascript
// Key Derivation
key = PBKDF2(SESSION_SECRET, 'simple-file-sharer-salt', 100000, 32, 'sha256')

// Encryption Process
iv = randomBytes(16)              // Random IV per chunk
cipher = createCipheriv('aes-256-gcm', key, iv)
encrypted = cipher.update(data) + cipher.final()
authTag = cipher.getAuthTag()

// Storage Format: [IV (16) | AuthTag (16) | Encrypted Data (...)]
encryptedChunk = concat(iv, authTag, encrypted)

// Decryption Process
iv = encryptedChunk[0:16]
authTag = encryptedChunk[16:32]
encrypted = encryptedChunk[32:]
decipher = createDecipheriv('aes-256-gcm', key, iv)
decipher.setAuthTag(authTag)
plaintext = decipher.update(encrypted) + decipher.final()
```

**Benefits:**
- Authenticated encryption (prevents tampering)
- Random IV per chunk (semantic security)
- Key derived from SESSION_SECRET (no key management needed)

### Security Audit Events

Tracked in `audit_log` table:
- `LOGIN_SUCCESS` / `LOGIN_FAILURE` / `LOGIN_LOCKED` / `LOGIN_ERROR`
- `UPLOAD_SUCCESS` / `UPLOAD_QUOTA_EXCEEDED` / `UPLOAD_BLOCKED`
- `DOWNLOAD` (view/download type)

---

## Upload Flow

### Step-by-Step Process

**Client Side:**

```
1. User drops files
   ↓
2. handleNewFiles() creates UI elements
   ↓
3. handleNextFile() processes queue sequentially
   ↓
4. Web Worker spawned/reused
   ↓
5. Worker calculates SHA-256 checksum (Web Crypto API)
   ↓
6. Worker chunks file (2MB per chunk)
   ↓
7. Worker uploads chunks sequentially with retry
   - POST /upload?chunkIndex=N&uuid=<uuid>
   - Body: binary chunk data (encrypted on server)
   - Retry up to 10 times with exponential backoff
   - Progress saved to localStorage
   ↓
8. All chunks complete → Worker sends merge request
   - POST /merge?name=<name>&chunkCount=N&uuid=<uuid>&checksum=<sha256>
   ↓
9. Server responds with file hash
   ↓
10. UI displays download URL with copy button
```

**Server Side:**

```
1. Receive POST /upload
   ↓
2. Validate quota (on first chunk only)
   - Check global storage limit
   - Check per-IP daily bytes
   - Check per-IP daily file count
   (All queries run in parallel via Promise.all)
   ↓
3. Generate secure chunk filename
   - SHA-256(chunkIndex + secret + IP + uuid) + "_" + chunkIndex
   ↓
4. Encrypt chunk with AES-256-GCM
   ↓
5. Save to /uploads/pending/<filename>
   ↓
6. Record in uploaded_chunks table
   ↓
7. Return JSON: {fileName, chunk}

---

1. Receive POST /merge
   ↓
2. Generate final filename (safeRandomId or hashId)
   ↓
3. Query all chunks for this UUID
   ↓
4. Validate chunk count matches expected
   ↓
5. Read and decrypt chunks sequentially (async)
   ↓
6. Merge into final file
   ↓
7. Verify file size within limits
   ↓
8. Verify SHA-256 checksum matches client's
   ↓
9. Detect file type via magic bytes
   ↓
10. Check against blocked MIME types
   ↓
11. Start database transaction
    - INSERT into uploaded_files (with hashed IP)
    - DELETE from uploaded_chunks
    - COMMIT
   ↓
12. Delete chunk files from disk
   ↓
13. Audit log upload success
   ↓
14. Return JSON: {fileName}
```

### Chunk Upload Retry Logic

```javascript
Attempt 1: Immediate
Attempt 2: Wait 1s
Attempt 3: Wait 2s
Attempt 4: Wait 4s
Attempt 5: Wait 8s
Attempt 6: Wait 16s
Attempt 7-10: Wait 30s (capped)

If all 10 attempts fail → Abort upload
```

### Upload Progress Persistence

```javascript
// Saved to localStorage after each successful chunk
{
  uuid: "...",
  fileName: "...",
  fileSize: 1234567,
  chunkCount: 100,
  completedChunks: [0, 1, 2, 5, 7, ...], // Indices
  timestamp: 1234567890
}

// Cleanup: Deleted on SUCCESS or after 24h
```

---

## Download Flow

### Public Download Process

```
1. User visits /d/<sha>
   ↓
2. Rate limiter check (200 req/15min per IP)
   ↓
3. Validate sha format (express-validator)
   ↓
4. Query database for fileName
   ↓
5. Verify file exists on disk
   ↓
6. Determine MIME type
   ↓
7. Set secure headers:
   - X-Content-Type-Options: nosniff
   - X-Download-Options: noopen
   - Cache-Control: public, max-age=31536000, immutable
   - Content-Disposition with RFC 5987 UTF-8 encoding
   ↓
8. Send file (Express streams internally)
   - Images: inline display
   - Others: force download
   ↓
9. Audit log download event (with hashed IP)
```

### Collection View

```
1. User visits /c/<uuid>
   ↓
2. Validate UUID format
   ↓
3. Query all files with matching collectionID
   ↓
4. Check collection expiration
   - Find oldest file timestamp
   - If now - oldest > collection_expiration_days → HTTP 410 Gone
   ↓
5. Return JSON array of files:
   [
     {fileName, sha, fileSize, timestamp},
     ...
   ]
   ↓
6. Frontend renders file list with:
   - Download links
   - File sizes (human readable)
   - Relative upload times
   - Copy buttons
```

---

## Authentication Flow

### Login Process

```
1. User submits username + password
   ↓
2. Rate limiter check (5 req/15min per IP)
   ↓
3. Input validation (express-validator)
   ↓
4. Check account lockout
   - If 5+ failed attempts in last 15min → HTTP 429
   ↓
5. Passport LocalStrategy authentication:
   a) Check users table (database users)
      - Query: SELECT ... WHERE username = ?
      - bcrypt.compare(password, password_hash)
      - Update last_login timestamp
   
   b) Fallback to config-based auth (backward compatibility)
      - timingSafeEqual(username, config.username)
      - bcrypt.compare(password, config.password)
   ↓
6. If authentication fails:
   - Record failed attempt
   - If 5th failure → Lock account
   - Audit log LOGIN_FAILURE
   - Redirect to /login
   ↓
7. If authentication succeeds:
   - Reset failed login counter
   - Regenerate session (prevent fixation)
   - Login user (Passport.js)
   - Track active session
   - Audit log LOGIN_SUCCESS
   - Redirect to /
```

### Session Management

```javascript
// Session Configuration
session({
  secret: process.env.SESSION_SECRET,  // 32+ chars required
  resave: false,
  saveUninitialized: false,
  name: 'sid',                         // Custom name (fingerprint prevention)
  cookie: {
    httpOnly: true,                    // No JS access
    secure: NODE_ENV === 'production', // HTTPS only in prod
    sameSite: 'lax',                   // CSRF protection
    maxAge: config.session_timeout_hours * 3600000  // Configurable
  }
})

// Concurrent Session Tracking
activeSessions = {
  "user1": ["sessionID1", "sessionID2", "sessionID3"],
  "user2": ["sessionID4"]
}

// On login: addActiveSession(username, sessionID)
// If > MAX_CONCURRENT_SESSIONS: remove oldest session
// On logout/destroy: removeActiveSession(username, sessionID)
```

---

## Data Management

### Cleanup Jobs (Hourly)

**1. Orphaned Chunks (`cleanupOrphanedChunks`)**
```sql
DELETE FROM uploaded_chunks
WHERE timestamp < datetime('now', '-24 hours');
```
- Chunks older than 24 hours (failed/incomplete uploads)
- Deletes both DB records and encrypted files
- Runs on startup + hourly

**2. File Retention (`cleanupOldFiles`)**
```sql
DELETE FROM uploaded_files
WHERE timestamp < strftime('%s', 'now', '-<retention_days> days');
```
- Configurable via `file_retention_days` (default: 30)
- Set to 0 to keep files forever
- Deletes both DB records and files from disk
- Runs on startup + hourly

**3. Audit Log Retention (`cleanupOldAuditLogs`)**
```sql
DELETE FROM audit_log
WHERE timestamp < strftime('%s', 'now', '-<retention_days> days');
```
- Configurable via `audit_log_retention_days` (default: 90)
- Set to 0 to keep logs forever
- Privacy/GDPR compliance
- Runs on startup + hourly

### Quota Enforcement

**Parallel Query Execution:**

```javascript
const queries = [
  dbGet("SELECT SUM(fileSize) FROM uploaded_files"),
  dbGet("SELECT SUM(fileSize) FROM uploaded_files WHERE remote_ip = ? AND timestamp > ?"),
  dbGet("SELECT COUNT(*) FROM uploaded_files WHERE remote_ip = ? AND timestamp > ?")
];

const [globalRow, ipStorageRow, ipFilesRow] = await Promise.all(queries);

// Check quotas in order:
// 1. Global storage (max_storage_bytes)
// 2. Per-IP daily storage (per_ip_daily_bytes)
// 3. Per-IP daily file count (per_ip_daily_files)
```

**Quota Rejection:**
- HTTP 507 (Insufficient Storage) - Global quota
- HTTP 429 (Too Many Requests) - Per-IP quota
- Retry-After header indicates when to retry
- Client displays user-friendly error message

---

## Performance Optimizations

### 1. Database Indices

**Impact:** Transforms O(n) full table scans into O(log n) index lookups

```sql
-- Quota queries (used every upload)
idx_uploaded_files_remote_ip_timestamp (remote_ip, timestamp)

-- Collection views
idx_uploaded_files_collectionID (collectionID)

-- Chunk merges
idx_uploaded_chunks_uuid (uuid)

-- User lookups
idx_users_username (username)
```

### 2. Parallel Quota Queries

**Before:** Sequential nested callbacks (4 levels deep, ~300ms)
```javascript
db.get(query1, (err, row1) => {
  db.get(query2, (err, row2) => {
    db.get(query3, (err, row3) => {
      // Finally check quotas
    });
  });
});
```

**After:** Parallel execution (~100ms, 3x faster)
```javascript
const [row1, row2, row3] = await Promise.all([
  dbGet(query1),
  dbGet(query2),
  dbGet(query3)
]);
// Check quotas
```

### 3. Reusable Web Worker

**Before:** New Worker per file
- Worker creation: ~50ms per file
- Memory allocation: ~2MB per worker
- 10 files = 500ms overhead + 20MB RAM

**After:** Single persistent worker
- Created once, reused for all files
- Recreated only on error (safety)
- Minimal overhead: ~50ms total for all files

### 4. Async File Operations

**Before:** Synchronous blocking
```javascript
var data = fs.readFileSync(path);  // Blocks entire event loop
```

**After:** Non-blocking async
```javascript
var data = await fsPromises.readFile(path);  // Other requests can process
```

**Impact:** Server remains responsive during large file merges

### 5. Conditional Debug Logging

**Before:** Always logging (production overhead)
```javascript
console.log('Detailed debug info...');  // Always executes
```

**After:** Conditional logging
```javascript
debugLog('Detailed debug info...');  // No-op unless debug=true
```

**Enable debug:** Add `?debug=1` to URL or `localStorage.setItem('debug', 'true')`

---

## Error Handling

### Standardized Error Responses

All API endpoints return JSON:

```javascript
// Success
{ fileName: "abc123" }

// Client errors (400-499)
{ error: "Invalid input", details: [...] }          // 400
{ error: "File not found" }                         // 404
{ error: "File type not allowed", type: "..." }     // 403
{ error: "File size exceeds limit", maxSize: N }    // 413
{ error: "File integrity check failed" }            // 422
{ error: "Daily upload quota exceeded" }            // 429

// Server errors (500-599)
{ error: "Internal server error" }                  // 500
{ error: "Server storage quota exceeded" }          // 507
```

### Client Error Handling

```javascript
// Web Worker maps HTTP status codes to user-friendly messages
if (status === 422) {
  errorMsg = "File corrupted during upload. Please try again.";
} else if (status === 429) {
  errorMsg = "Upload limit reached. Try again later.";
} else if (status === 507) {
  errorMsg = "Server storage is full.";
}

// Display in UI
$(".resulttextbox").value = errorMsg;
```

---

## File Naming & ID Generation

### Two Strategies

**1. Random IDs (default):**
```javascript
const safeRandomId = async (length = 4, retryCount = 0) => {
  // Generate random ID from validChars (64 chars)
  const id = crypto.randomBytes(length)
    .map(c => validChars[c % 64])
    .join('');
  
  // Check uniqueness in database
  const exists = await dbGet("SELECT count(*) FROM uploaded_files WHERE sha=?", [id]);
  
  if (exists) {
    // Collision! Retry with longer ID
    return safeRandomId(length + 1, retryCount + 1);
  }
  
  return id; // 4 chars = 64^4 = 16M combinations
};
```

**2. Hash IDs (config.short_hash = true):**
```javascript
const hashId = (fileName, remoteIP) => {
  const hash = SHA256(fileName + timestamp + secret + remoteIP);
  // Returns 64-char hash, optionally shortened
  return hash.substr(0, shortestUniqueLength);
};
```

### Collision Handling

- UNIQUE constraint on `uploaded_files.sha` column
- Database rejects duplicates with SQLITE_CONSTRAINT error
- Application retries with longer ID (up to 64 chars)
- Max 10 retries before failure
- Collision detection logged for security monitoring

---

## Configuration System

### Hierarchy

```
1. Environment Variables (highest priority)
   - SESSION_SECRET (required)
   - NODE_ENV (optional)

2. config.json
   - All application settings
   - Loaded via createRequire (ES module compatibility)

3. Default Fallback (lowest priority)
   - Built-in defaults if config.json missing
   - Warning logged to console
```

### Config Validation

```javascript
// SESSION_SECRET validation
if (!process.env.SESSION_SECRET) {
  logError("CRITICAL: SESSION_SECRET NOT SET");
  process.exit(1);
}

if (process.env.SESSION_SECRET.length < 32) {
  logError("SESSION_SECRET must be at least 32 characters");
  process.exit(1);
}

// Password hash validation
if (!config.authdetails.password.startsWith('$2b$')) {
  logError("CRITICAL: Password not hashed! Authentication disabled.");
  return done(null, false);
}
```

---

## API Endpoints

### Public Endpoints (No Auth Required)

| Method | Path | Description | Rate Limit |
|--------|------|-------------|------------|
| GET | `/d/:fileName` | Download file | 200/15min |
| GET | `/c/:collectionID` | View collection | None |

### Authenticated Endpoints

| Method | Path | Description | Rate Limit |
|--------|------|-------------|------------|
| POST | `/login` | User authentication | 5/15min |
| POST | `/upload` | Upload chunk | 100/15min |
| POST | `/merge` | Merge chunks | 100/15min |
| GET | `/api/quota` | Quota usage | None |
| GET | `/` | Main upload page | None |

### Response Codes

- **200 OK** - Success
- **400 Bad Request** - Invalid input
- **403 Forbidden** - Blocked file type
- **404 Not Found** - File/collection not found
- **410 Gone** - Collection expired
- **413 Payload Too Large** - File exceeds size limit
- **422 Unprocessable Entity** - Checksum mismatch
- **429 Too Many Requests** - Rate limit or quota exceeded
- **500 Internal Server Error** - Server error
- **507 Insufficient Storage** - Global storage quota exceeded

---

## Monitoring & Observability

### Logging

**Console Output (ISO 8601 timestamps):**
```
2025-10-18T12:34:56.789Z simple-file-sharer started on http://0.0.0.0:9898
2025-10-18T12:35:01.123Z a1b2c3d4e5f6g7h8... uploaded abc123_0 0
2025-10-18T12:35:02.456Z Merge request: {uuid: ..., chunkCount: 5, ...}
2025-10-18T12:35:03.789Z Generated filename: xYz9
2025-10-18T12:35:04.012Z AUDIT: UPLOAD_SUCCESS a1b2c3d4e5f6g7h8... null {...} SUCCESS
```

**Audit Log (Database):**
```sql
SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100;

-- Example records:
id | timestamp | event_type      | remote_ip (hashed) | username | details | status
---+-----------+-----------------+--------------------+----------+---------+--------
1  | 1729260001| LOGIN_SUCCESS   | a1b2c3d4e5f6...    | admin    | {}      | SUCCESS
2  | 1729260045| UPLOAD_SUCCESS  | a1b2c3d4e5f6...    | NULL     | {...}   | SUCCESS
3  | 1729260100| LOGIN_FAILURE   | 9f8e7d6c5b4a...    | hacker   | {...}   | FAILURE
4  | 1729260101| LOGIN_LOCKED    | 9f8e7d6c5b4a...    | hacker   | {...}   | FAILURE
```

### Health Monitoring

**Key Metrics to Monitor:**
- Upload success rate
- Chunk retry rate
- Average file size
- Quota utilization
- Failed login attempts
- Database size growth
- Disk space usage

---

## Deployment Considerations

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Generate strong SESSION_SECRET (32+ chars)
- [ ] Hash all passwords with bcrypt
- [ ] Configure HTTPS reverse proxy (nginx/caddy)
- [ ] Set appropriate quotas for your use case
- [ ] Configure file retention policy
- [ ] Enable audit log retention
- [ ] Monitor disk space
- [ ] Regular database backups
- [ ] Review blocked_mime_types list

### Scaling Considerations

**Current Limitations:**
- SQLite: Single-writer limitation
- In-memory: Session storage, failed login tracking
- Local disk: File storage

**Scaling Options (Future):**
- Replace SQLite with PostgreSQL for multi-writer support
- Use Redis for session storage and distributed locking
- Use S3/MinIO for file storage
- Add load balancer for horizontal scaling
- Implement database read replicas

### Security Hardening

1. **Run behind reverse proxy (nginx/caddy)** for:
   - HTTPS termination
   - HSTS headers
   - Additional rate limiting
   - DDoS protection

2. **OS-level security:**
   - Run as non-root user
   - chroot jail or container
   - File system permissions

3. **Network security:**
   - Firewall rules (allow only 80/443)
   - VPN for admin access
   - IP whitelisting for admin functions

---

## Troubleshooting

### Common Issues

**"Authentication misconfigured"**
- Password in config.json not bcrypt hashed
- Solution: Hash password with bcrypt

**"CRITICAL: SESSION_SECRET NOT SET"**
- Environment variable missing
- Solution: `export SESSION_SECRET=$(openssl rand -hex 32)`

**Upload fails with checksum error**
- Network corruption during transfer
- Solution: Automatic retry will handle it

**Collection shows "Collection has expired"**
- Collection older than `collection_expiration_days`
- Solution: Increase retention or re-upload files

**"Account temporarily locked"**
- 5 failed login attempts
- Solution: Wait 15 minutes or restart server (clears in-memory locks)

### Debug Mode

Enable verbose logging:
```
http://your-server/?debug=1
```

Or permanently:
```javascript
localStorage.setItem('debug', 'true');
```

---

## Contributing

See the project's version control history and issue tracker for planned improvements and architecture changes.

For detailed technical information, review:
- `docs/architecture.md` - This document
- `code-review-2025-2.md` - Completed improvements
- `version-2-plan.md` - Future enhancements

---

**Copyright © 2025 the_louie**
