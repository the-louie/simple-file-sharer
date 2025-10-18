# Simple File Sharer

A secure, modern file sharing application with chunked uploads, user authentication, and enterprise-grade features. Built with Node.js and vanilla JavaScript.

## Features

- **Secure Authentication**: Multi-user support with bcrypt password hashing
- **Chunked Uploads**: Large file support with retry logic and progress tracking
- **File Integrity**: SHA-256 checksum verification for all uploads
- **Privacy First**: IP address hashing (GDPR compliant), encrypted chunks at rest (AES-256-GCM)
- **Smart Quotas**: Configurable storage limits per IP and globally
- **Data Retention**: Automatic cleanup of old files, audit logs, and collections
- **Modern Security**: Session fixation prevention, account lockout, rate limiting
- **Performance Optimized**: Database indices, parallel queries, reusable web workers

## Quick Start

### Prerequisites
- Node.js 18+ or Docker
- OpenSSL (for generating secrets)

### Installation

1. **Clone and install:**
   ```bash
   git clone <repository-url>
   cd simple-file-sharer
   npm install
   ```

2. **Generate session secret:**
   ```bash
   export SESSION_SECRET=$(openssl rand -hex 32)
   export NODE_ENV=production  # For HTTPS deployments
   ```

3. **Configure application:**
   ```bash
   cp config_example.json config.json
   # Edit config.json as needed
   ```

4. **Create admin password:**
   ```bash
   node -e "require('bcrypt').hash('your_password', 10).then(console.log)"
   # Copy output to config.json password field
   ```

5. **Start server:**
   ```bash
   npm start
   # Access at http://localhost:9898
   ```

## User Management

### Add Users to Database

```bash
# Create user with hashed password
node -e "
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./memory.db');

const username = 'newuser';
const password = 'secure_password';

bcrypt.hash(password, 10).then(hash => {
  db.run('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)',
    [username, hash, 0],
    (err) => {
      if (err) console.error(err);
      else console.log('User created:', username);
      db.close();
    }
  );
});
"
```

### Remove Users

```bash
# Delete user from database
node -e "
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./memory.db');
db.run('DELETE FROM users WHERE username = ?', ['username'], (err) => {
  if (err) console.error(err);
  else console.log('User deleted');
  db.close();
});
"
```

## Using the Application

### Uploading Files

1. Navigate to the application URL
2. Log in with your credentials (if authentication is enabled)
3. **Drag and drop** files into the drop zone, or click the button to select files
4. Files are chunked, encrypted, and uploaded with retry logic
5. Each file gets a unique shareable URL automatically copied to clipboard
6. **Collections**: Multiple files uploaded together get a collection URL

### Downloading Files

Files can be downloaded using the generated URLs:
- **Single file**: `http://your-server/d/<file-hash>`
- **Collection**: `http://your-server/c/<collection-uuid>`

Download URLs are **public** (no authentication required) and include:
- Automatic MIME type detection
- Inline viewing for images
- Secure download headers
- Optional expiration (configurable)

### Advanced Features

- **Upload Progress Persistence**: Uploads saved to localStorage, resumable after browser refresh
- **File Integrity**: SHA-256 checksums verify uploads aren't corrupted
- **Smart Retry**: Failed chunks automatically retry with exponential backoff (up to 10 retries)
- **Quota Management**: View your storage usage and limits in real-time
- **Security**: All chunks encrypted at rest, IPs hashed for privacy
- **Debug Mode**: Add `?debug=1` to URL to enable verbose logging

## Configuration Options

Key settings in `config.json`:

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

## Docker Deployment

### Quick Start

```bash
# Generate secret
SESSION_SECRET=$(openssl rand -hex 32)

# Copy and configure
cp config_example.json config.json
# Edit config.json: set ip="0.0.0.0", db_name="/data/memory.db"

# Start container
SESSION_SECRET=$SESSION_SECRET NODE_ENV=production docker-compose up -d
```

### Docker Commands

```bash
docker-compose logs -f          # View logs
docker-compose restart          # Restart after config changes
docker-compose down -v          # Remove everything (including data!)
```

## Technical Details

For detailed architecture documentation, see [docs/architecture.md](docs/architecture.md)

**Key Technologies:**
- Backend: Node.js, Express, SQLite3, Passport.js
- Frontend: Vanilla JavaScript, Web Workers, Web Crypto API
- Security: bcrypt, helmet.js, express-validator, express-rate-limit
- Encryption: AES-256-GCM for chunks at rest

## Security Notes

- Passwords must be bcrypt hashed (plaintext not supported)
- Session secret must be 32+ characters
- IP addresses are hashed in database (GDPR compliant)
- Chunks encrypted at rest with AES-256-GCM
- Account lockout after 5 failed login attempts
- Maximum 3 concurrent sessions per user
- Rate limiting on all endpoints

## License

Copyright © 2025 the_louie

This application is released under the MIT License. See the `LICENSE` file for details.