# Security Architecture

This document details the security features and encryption mechanisms.

## Defense in Depth

### Layer 1: Network

**Rate Limiting (express-rate-limit):**
- Login: 5 attempts per 15min per IP
- Upload: 100 requests per 15min per IP
- Download: 200 requests per 15min per IP (bypassed for authenticated users)

### Layer 2: Application

**Helmet.js Security Headers:**
- Content Security Policy (CSP)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-Download-Options: noopen

**Input Validation (express-validator):**
- UUID format validation
- Filename sanitization
- Integer bounds checking

### Layer 3: Authentication

**Passport.js LocalStrategy:**
- Bcrypt password hashing (cost factor: 10)
- Session regeneration on login (prevents fixation)
- Account lockout: 5 failed attempts = 15min lockout
- Concurrent session limits: 3 sessions per user max
- Secure cookies: httpOnly, sameSite:'lax', secure in production

### Layer 4: Data Protection

**Data Security:**
- IP address hashing (SHA-256 with secret salt)
- Chunk encryption at rest (AES-256-GCM)
- File integrity verification (SHA-256 checksums)
- Filename sanitization (path traversal prevention)

### Layer 5: Privacy & Compliance

**GDPR Compliance:**
- GDPR-compliant IP hashing
- Configurable data retention policies
- Audit log expiration
- Collection expiration
- Sanitized console logs

---

## Encryption Details

### Chunk Encryption (AES-256-GCM)

**Key Derivation:**
```javascript
key = PBKDF2(SESSION_SECRET, 'simple-file-sharer-salt', 100000, 32, 'sha256')
```

**Encryption Process:**
```javascript
iv = randomBytes(16)              // Random IV per chunk
cipher = createCipheriv('aes-256-gcm', key, iv)
encrypted = cipher.update(data) + cipher.final()
authTag = cipher.getAuthTag()

// Storage Format: [IV (16) | AuthTag (16) | Encrypted Data (...)]
encryptedChunk = concat(iv, authTag, encrypted)
```

**Decryption Process:**
```javascript
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

---

## Security Audit Events

Tracked in `audit_log` table:
- `LOGIN_SUCCESS` / `LOGIN_FAILURE` / `LOGIN_LOCKED` / `LOGIN_ERROR`
- `UPLOAD_SUCCESS` / `UPLOAD_QUOTA_EXCEEDED` / `UPLOAD_BLOCKED`
- `DOWNLOAD` (view/download type)

---

## Session Management

**Configuration:**
```javascript
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
```

**Concurrent Session Tracking:**
```javascript
activeSessions = {
  "user1": ["sessionID1", "sessionID2", "sessionID3"],
  "user2": ["sessionID4"]
}

// On login: addActiveSession(username, sessionID)
// If > MAX_CONCURRENT_SESSIONS: remove oldest session
// On logout/destroy: removeActiveSession(username, sessionID)
```

---

## Security Best Practices

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Generate strong SESSION_SECRET (32+ chars)
- [ ] Hash all passwords with bcrypt
- [ ] Configure HTTPS reverse proxy (nginx/caddy)
- [ ] Review blocked_mime_types list
- [ ] Monitor failed login attempts
- [ ] Regular audit log reviews

### Hardening Recommendations

**1. Reverse Proxy (nginx/caddy):**
- HTTPS termination
- HSTS headers
- Additional rate limiting
- DDoS protection

**2. OS-level Security:**
- Run as non-root user
- chroot jail or container
- File system permissions

**3. Network Security:**
- Firewall rules (allow only 80/443)
- VPN for admin access
- IP whitelisting for admin functions

---

**Copyright © 2025 the_louie**

