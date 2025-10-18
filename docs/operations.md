# Operations Guide

This document covers performance optimizations, error handling, configuration, API endpoints, monitoring, deployment, and troubleshooting.

## Performance Optimizations

### 1. Reusable Web Worker

**Before:** New Worker per file
- Worker creation: ~50ms per file
- Memory allocation: ~2MB per worker
- 10 files = 500ms overhead + 20MB RAM

**After:** Single persistent worker
- Created once, reused for all files
- Recreated only on error (safety)
- Minimal overhead: ~50ms total for all files

### 2. Async File Operations

**Before:** Synchronous blocking
```javascript
var data = fs.readFileSync(path);  // Blocks entire event loop
```

**After:** Non-blocking async
```javascript
var data = await fsPromises.readFile(path);  // Other requests can process
```

**Impact:** Server remains responsive during large file merges

### 3. Conditional Debug Logging

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

### Key Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| `max_storage_bytes` | Global storage limit | 100GB |
| `per_ip_daily_bytes` | Daily upload limit per IP | 1GB |
| `per_ip_daily_files` | Daily file count per IP | 100 |
| `max_file_size_bytes` | Maximum single file size | 10GB |
| `file_retention_days` | Auto-delete files older than N days | 30 |
| `audit_log_retention_days` | Auto-delete audit logs older than N days | 90 |
| `collection_expiration_days` | Collections expire after N days | 7 |
| `session_timeout_hours` | Session validity period | 24 |
| `blocked_mime_types` | Blacklist for file types | Executables |

Set any quota to `0` to disable.

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

## Deployment

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

### Docker Deployment

```bash
# Generate secret
SESSION_SECRET=$(openssl rand -hex 32)

# Copy and configure
cp config_example.json config.json
# Edit config.json: set ip="0.0.0.0", db_name="/data/memory.db"

# Start container
SESSION_SECRET=$SESSION_SECRET NODE_ENV=production docker-compose up -d
```

**Docker Commands:**
```bash
docker-compose logs -f          # View logs
docker-compose restart          # Restart after config changes
docker-compose down -v          # Remove everything (including data!)
```

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

**Out of disk space**
- Check quotas in config.json
- Review file retention policy
- Clean up old files manually if needed

**Database locked errors**
- SQLite single-writer limitation
- Reduce concurrent uploads
- Consider migrating to PostgreSQL for high-load environments

### Debug Mode

Enable verbose logging:
```
http://your-server/?debug=1
```

Or permanently:
```javascript
localStorage.setItem('debug', 'true');
```

### Database Queries for Debugging

**Check storage usage:**
```sql
SELECT SUM(fileSize) / 1024.0 / 1024.0 / 1024.0 as GB
FROM uploaded_files;
```

**Recent uploads:**
```sql
SELECT fileName, fileSize, datetime(timestamp, 'unixepoch') as uploaded
FROM uploaded_files
ORDER BY timestamp DESC
LIMIT 20;
```

**Failed login attempts:**
```sql
SELECT event_type, username, datetime(timestamp, 'unixepoch') as when, status
FROM audit_log
WHERE event_type LIKE 'LOGIN%'
ORDER BY timestamp DESC
LIMIT 50;
```

**Orphaned chunks (pending cleanup):**
```sql
SELECT uuid, COUNT(*) as chunks, datetime(MIN(timestamp)) as oldest
FROM uploaded_chunks
GROUP BY uuid
HAVING oldest < datetime('now', '-1 hour');
```

---

## Maintenance

### Regular Tasks

**Daily:**
- Monitor disk space usage
- Review failed login attempts
- Check for unusual upload patterns

**Weekly:**
- Review audit logs
- Verify automatic cleanup jobs are running
- Check database size growth

**Monthly:**
- Database backup (copy memory.db)
- Review and update blocked_mime_types
- Review quota settings based on usage patterns
- Update dependencies (npm outdated)

### Backup Strategy

**Database:**
```bash
# Backup database
cp memory.db memory.db.backup-$(date +%Y%m%d)

# Restore database
cp memory.db.backup-YYYYMMDD memory.db
```

**Uploaded files:**
```bash
# Backup uploads
tar czf uploads-backup-$(date +%Y%m%d).tar.gz uploads/

# Restore uploads
tar xzf uploads-backup-YYYYMMDD.tar.gz
```

**Configuration:**
```bash
# Always keep config.json backed up separately
cp config.json config.json.backup-$(date +%Y%m%d)
```

---

## Contributing

See the project's version control history and issue tracker for planned improvements and architecture changes.

For detailed technical information, review:
- [overview.md](overview.md) - System overview and technology stack
- [architecture.md](architecture.md) - Backend and frontend details
- [database.md](database.md) - Database schema and data management
- [security.md](security.md) - Security architecture
- [workflows.md](workflows.md) - Upload, download, and authentication flows
- [operations.md](operations.md) - This document
- `../code-review-2025-2.md` - Completed improvements
- `../version-2-plan.md` - Future enhancements

---

**Copyright © 2025 the_louie**

