# System Overview

Simple File Sharer is a Node.js-based file sharing application that supports secure, chunked file uploads with enterprise-grade security features.

## High-Level Architecture

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

## Technology Stack

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

## Documentation Index

For detailed technical information, see:
- [architecture.md](architecture.md) - Backend and Frontend architecture details
- [database.md](database.md) - Database schema and data management
- [security.md](security.md) - Security architecture and encryption
- [workflows.md](workflows.md) - Upload, download, and authentication flows
- [operations.md](operations.md) - Performance, configuration, deployment, and troubleshooting

---

**Copyright © 2025 the_louie**

