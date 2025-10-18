# Application Workflows

This document details the upload, download, and authentication workflows.

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

### Session Lifecycle

**On Login:**
1. Validate credentials
2. Regenerate session ID (prevents fixation)
3. Add session to active sessions tracker
4. Remove oldest session if > 3 concurrent
5. Set secure cookie

**During Session:**
- Cookie validated on each request
- httpOnly prevents XSS cookie theft
- sameSite prevents CSRF
- Session expires after configured timeout

**On Logout:**
- Destroy session
- Remove from active sessions tracker
- Clear cookie

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

**Copyright © 2025 the_louie**

