
import fs from "fs";
import fsPromises from "fs/promises";
import mime from "mime";
import crypto from "crypto";
import _ from "lodash";
import express from "express";
import session from "express-session";
import passport from "passport";
import passportLocal from "passport-local";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { body, query, param, validationResult } from "express-validator";
import { fileTypeFromFile } from "file-type";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const LocalStrategy = passportLocal.Strategy;

var currentPath = process.cwd();
var app 	   = express();

// Apply security headers with helmet.js
app.use(helmet({
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			scriptSrc: ["'self'", "'unsafe-inline'", "https://code.jquery.com"],
			styleSrc: ["'self'", "'unsafe-inline'"],
			imgSrc: ["'self'", "data:", "blob:"],
			connectSrc: ["'self'"],
			fontSrc: ["'self'"],
			objectSrc: ["'none'"],
			mediaSrc: ["'self'"],
			frameSrc: ["'none'"],
		},
	},
	crossOriginEmbedderPolicy: false, // Allow file downloads
}));

var validChars = [ 'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z', 'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','0','1','2','3','4','5','6','7','8','9','-','_','.','~' ];

// Helper function to add ISO timestamp to console output
function log(...args) {
	console.log(new Date().toISOString(), ...args);
}

function logError(...args) {
	console.error(new Date().toISOString(), ...args);
}

// Validation error handler middleware
function handleValidationErrors(request, response, next) {
	const errors = validationResult(request);
	if (!errors.isEmpty()) {
		logError('Validation failed:', errors.array());
		return response.status(400).json({
			error: 'Invalid input',
			details: errors.array()
		});
	}
	next();
}

// Helper function to promisify db.get
function dbGet(query, params) {
	return new Promise((resolve, reject) => {
		db.get(query, params, (err, row) => {
			if (err) return reject(err);
			resolve(row);
		});
	});
}

// Upload quota check function (refactored for parallel queries)
async function checkUploadQuotas(remoteIP) {
	const now = Math.floor(Date.now() / 1000);
	const dayAgo = now - 86400; // 24 hours ago
	const hashedIP = hashIP(remoteIP); // Hash IP for privacy

	try {
		// Build array of queries to run in parallel
		var queries = [];

		// Global storage quota query
		if (config.max_storage_bytes && config.max_storage_bytes > 0) {
			queries.push(dbGet("SELECT SUM(fileSize) as total FROM uploaded_files", []));
		} else {
			queries.push(Promise.resolve(null));
		}

		// Per-IP daily storage quota query
		if (config.per_ip_daily_bytes && config.per_ip_daily_bytes > 0) {
			queries.push(dbGet(
				"SELECT SUM(fileSize) as total FROM uploaded_files WHERE remote_ip = ? AND timestamp > ?",
				[hashedIP, dayAgo]
			));
		} else {
			queries.push(Promise.resolve(null));
		}

		// Per-IP daily file count quota query
		if (config.per_ip_daily_files && config.per_ip_daily_files > 0) {
			queries.push(dbGet(
				"SELECT COUNT(*) as count FROM uploaded_files WHERE remote_ip = ? AND timestamp > ?",
				[hashedIP, dayAgo]
			));
		} else {
			queries.push(Promise.resolve(null));
		}

		// Execute all queries in parallel
		const [globalRow, ipStorageRow, ipFilesRow] = await Promise.all(queries);

		// Check global storage quota
		if (config.max_storage_bytes && config.max_storage_bytes > 0) {
			const totalStorage = globalRow?.total || 0;
			if (totalStorage >= config.max_storage_bytes) {
				log("Global storage quota exceeded:", totalStorage, ">=", config.max_storage_bytes);
				throw {
					error: "Server storage quota exceeded",
					code: 507,
					retryAfter: 86400
				};
			}
		}

		// Check per-IP daily storage quota
		if (config.per_ip_daily_bytes && config.per_ip_daily_bytes > 0) {
			const ipDailyStorage = ipStorageRow?.total || 0;
			if (ipDailyStorage >= config.per_ip_daily_bytes) {
				log("Per-IP daily storage quota exceeded for", hashedIP.substring(0, 16) + '...', ":", ipDailyStorage, ">=", config.per_ip_daily_bytes);
				throw {
					error: "Daily upload quota exceeded",
					code: 429,
					retryAfter: 86400
				};
			}
		}

		// Check per-IP daily file count quota
		if (config.per_ip_daily_files && config.per_ip_daily_files > 0) {
			const ipDailyFiles = ipFilesRow?.count || 0;
			if (ipDailyFiles >= config.per_ip_daily_files) {
				log("Per-IP daily file count quota exceeded for", hashedIP.substring(0, 16) + '...', ":", ipDailyFiles, ">=", config.per_ip_daily_files);
				throw {
					error: "Daily file upload limit exceeded",
					code: 429,
					retryAfter: 86400
				};
			}
		}

		return true;

	} catch (error) {
		// Re-throw quota errors as-is
		if (error.code === 507 || error.code === 429) {
			throw error;
		}
		// Database errors
		logError("Database error in quota check:", error);
		throw { error: "Database error", code: 500 };
	}
}

// Audit logging function
function audit(eventType, remoteIP, username, details, status) {
	const hashedIP = hashIP(remoteIP); // Hash IP for privacy/GDPR compliance
	const stmt = db.prepare('INSERT INTO audit_log (event_type, remote_ip, username, details, status) VALUES (?, ?, ?, ?, ?)');
	stmt.run(eventType, hashedIP, username || null, JSON.stringify(details), status, function(err) {
		if (err) {
			logError("Failed to write audit log:", err);
		}
		stmt.finalize();
	});
	// Log with hashed IP only
	log("AUDIT:", eventType, hashedIP.substring(0, 16) + '...', username, details, status);
}

// Sanitize filename for safe downloads
function sanitizeFilename(filename) {
	if (!filename || typeof filename !== 'string') {
		return 'download';
	}

	// Remove null bytes and control characters
	var sanitized = filename.replace(/[\x00-\x1f\x7f-\x9f]/g, '');

	// Remove path separators and traversal attempts
	sanitized = sanitized.replace(/[\/\\]/g, '_');
	sanitized = sanitized.replace(/\.\./g, '_');

	// Remove leading dots (hidden files)
	sanitized = sanitized.replace(/^\.+/, '');

	// Limit length to prevent issues
	if (sanitized.length > 255) {
		var ext = sanitized.match(/\.[^.]+$/)?.[0] || '';
		sanitized = sanitized.substring(0, 255 - ext.length) + ext;
	}

	// Fallback if everything was stripped
	return sanitized || 'download';
}

// Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string') {
		return false;
	}

	// Pad to same length to prevent length-based timing attacks
	var maxLen = Math.max(a.length, b.length);
	var aBuf = Buffer.from(a.padEnd(maxLen, '\0'), 'utf8');
	var bBuf = Buffer.from(b.padEnd(maxLen, '\0'), 'utf8');

	try {
		return crypto.timingSafeEqual(aBuf, bBuf);
	} catch (e) {
		// If comparison fails (shouldn't happen with padding), return false
		return false;
	}
}

// Hash IP addresses for privacy/GDPR compliance while preserving quota functionality
function hashIP(ip) {
	if (!ip || typeof ip !== 'string') {
		return 'unknown';
	}

	// Use SHA-256 with server secret as salt for one-way hashing
	// Same IP always produces same hash (for quota tracking)
	// Cannot reverse-engineer original IP from hash
	return crypto
		.createHash('sha256')
		.update(ip)
		.update(config.secret || process.env.SESSION_SECRET)
		.digest('hex');
}

// Derive encryption key from SESSION_SECRET for chunk encryption
function getEncryptionKey() {
	// Use PBKDF2 to derive a proper 256-bit key from the secret
	return crypto.pbkdf2Sync(
		config.secret || process.env.SESSION_SECRET,
		'simple-file-sharer-salt', // Fixed salt for key derivation
		100000, // Iterations
		32, // 256 bits
		'sha256'
	);
}

// Encrypt chunk data before writing to disk (AES-256-GCM)
function encryptChunk(data) {
	const key = getEncryptionKey();
	const iv = crypto.randomBytes(16); // 128-bit IV for GCM
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

	const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
	const authTag = cipher.getAuthTag();

	// Return: IV (16 bytes) + authTag (16 bytes) + encrypted data
	return Buffer.concat([iv, authTag, encrypted]);
}

// Decrypt chunk data when reading from disk (AES-256-GCM)
function decryptChunk(encryptedData) {
	const key = getEncryptionKey();

	// Extract: IV (16 bytes) + authTag (16 bytes) + encrypted data
	const iv = encryptedData.slice(0, 16);
	const authTag = encryptedData.slice(16, 32);
	const encrypted = encryptedData.slice(32);

	const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(authTag);

	return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

var config;

// Validate required environment variables
if (!process.env.SESSION_SECRET) {
	logError("\n!                                                  !");
	logError("!      CRITICAL: SESSION_SECRET NOT SET            !");
	logError("!                                                  !");
	logError("!  Set SESSION_SECRET environment variable with    !");
	logError("!  a strong random value (min 32 characters)       !");
	logError("!                                                  !");
	logError("!  Example: SESSION_SECRET=$(openssl rand -hex 32) !");
	logError("!                                                  !\n");
	process.exit(1);
}

// Validate secret strength
if (process.env.SESSION_SECRET.length < 32) {
	logError("SESSION_SECRET must be at least 32 characters long");
	process.exit(1);
}

try {
	config 	 = require('./config.json');
} catch (e) {
	log("\n!                                                  !");
	log("!      WARNING! USING DEFAULT CONFIGURATION        !");
	log("!                                                  !");
	log("!  Please copy config_example.json to config.json  !");
	log("!  and modify it according to your needs.          !\n\n");
	config = {
		"ip": "localhost",
		"port": 9898,
		"upload_dir": "./uploads",
		"static_dir": "./static",
		"db_name": "./memory.db",
		"randomId": true,
		// "hashId": false,
		// "short_hash": true,
		"blocked_mime_types": [
			"application/x-msdownload",
			"application/x-msdos-program",
			"application/x-executable",
			"application/x-dosexec",
			"application/x-msi",
			"application/x-sh",
			"application/x-bat",
			"application/x-ms-dos-executable",
			"application/vnd.microsoft.portable-executable"
		],
		"max_storage_bytes": 107374182400,
		"per_ip_daily_bytes": 1073741824,
		"per_ip_daily_files": 100,
		"max_file_size_bytes": 10737418240,
		"file_retention_days": 30,
		"audit_log_retention_days": 90,
		"collection_expiration_days": 7,
		"session_timeout_hours": 24
	};
}

// Use environment variable for secret (never hard-code)
config.secret = process.env.SESSION_SECRET;

//var Bluebird = require('bluebird');
import sqlite from "sqlite3";
var db 	   = new sqlite.Database(config.db_name);

// Create table if it doesn't already exist.
db.run("CREATE TABLE IF NOT EXISTS uploaded_files (fid INTEGER PRIMARY KEY AUTOINCREMENT, fileName TEXT, sha TEXT UNIQUE, timestamp INTEGER DEFAULT (strftime('%s', 'now')), collectionID TEXT, fileSize INTEGER, remote_ip TEXT)", function(err) {
	if (err) {
		logError("Failed to create uploaded_files table:", err);
		process.exit(1);
	}

	// Create indices for frequently queried columns
	db.run("CREATE INDEX IF NOT EXISTS idx_uploaded_files_collectionID ON uploaded_files(collectionID)", function(idxErr) {
		if (idxErr) {
			logError("Failed to create collectionID index:", idxErr);
		}
	});

	db.run("CREATE INDEX IF NOT EXISTS idx_uploaded_files_remote_ip_timestamp ON uploaded_files(remote_ip, timestamp)", function(idxErr2) {
		if (idxErr2) {
			logError("Failed to create remote_ip+timestamp index:", idxErr2);
		}
	});
});
db.run("CREATE TABLE IF NOT EXISTS uploaded_chunks (cid INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT, filename TEXT, chunk_id INT, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)", function(err) {
	if (err) {
		logError("Failed to create uploaded_chunks table:", err);
		process.exit(1);
	}

	// Create index on uuid for faster chunk lookups during merge
	db.run("CREATE INDEX IF NOT EXISTS idx_uploaded_chunks_uuid ON uploaded_chunks(uuid)", function(idxErr) {
		if (idxErr) {
			logError("Failed to create uuid index:", idxErr);
		}
	});

	// Run cleanup on startup
	cleanupOrphanedChunks();
});
db.run("CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER DEFAULT (strftime('%s', 'now')), event_type TEXT, remote_ip TEXT, username TEXT, details TEXT, status TEXT)", function(err) {
	if (err) {
		logError("Failed to create audit_log table:", err);
		process.exit(1);
	}
});

// Create users table for multi-user support
db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, is_admin INTEGER DEFAULT 0, created_at INTEGER DEFAULT (strftime('%s', 'now')), last_login INTEGER)", function(err) {
	if (err) {
		logError("Failed to create users table:", err);
		process.exit(1);
	}

	// Create index on username for faster lookups
	db.run("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)", function(idxErr) {
		if (idxErr) {
			logError("Failed to create username index:", idxErr);
		}
	});
});

// Cleanup function for orphaned chunk files
function cleanupOrphanedChunks() {
	const maxAgeHours = 24; // Configurable: delete chunks older than 24 hours
	const maxAgeSeconds = maxAgeHours * 60 * 60;

	log("Running cleanup for orphaned chunks older than", maxAgeHours, "hours");

	// Query chunks older than maxAge
	const query = "SELECT filename FROM uploaded_chunks WHERE timestamp < datetime('now', '-" + maxAgeHours + " hours')";

	db.all(query, [], function(err, rows) {
		if (err) {
			logError("Error querying old chunks:", err);
			return;
		}

		if (!rows || rows.length === 0) {
			log("No orphaned chunks to clean up");
			return;
		}

		log("Found", rows.length, "orphaned chunks to delete");

		var deletedFiles = 0;
		var deletedRecords = 0;

		rows.forEach(function(row) {
			const chunkPath = config.upload_dir + '/pending/' + row.filename;

			// Delete file from disk
			fs.unlink(chunkPath, function(err) {
				if (err && err.code !== 'ENOENT') {
					// Log error unless file already doesn't exist
					logError("Error deleting orphaned chunk file:", chunkPath, err);
				} else if (!err) {
					deletedFiles++;
				}
			});
		});

		// Delete records from database
		const deleteQuery = "DELETE FROM uploaded_chunks WHERE timestamp < datetime('now', '-" + maxAgeHours + " hours')";
		db.run(deleteQuery, function(err) {
			if (err) {
				logError("Error deleting orphaned chunk records:", err);
			} else {
				deletedRecords = this.changes;
				log("Cleanup complete:", deletedFiles, "files and", deletedRecords, "DB records deleted");
			}
		});
	});
}

// Cleanup function for old uploaded files (data retention policy)
function cleanupOldFiles() {
	// Check if file retention is configured
	if (!config.file_retention_days || config.file_retention_days <= 0) {
		return; // Retention disabled, keep files forever
	}

	const retentionDays = config.file_retention_days;
	log("Running cleanup for files older than", retentionDays, "days");

	// Query files older than retention period
	const query = "SELECT sha, fileName FROM uploaded_files WHERE timestamp < strftime('%s', 'now', '-" + retentionDays + " days')";

	db.all(query, [], function(err, rows) {
		if (err) {
			logError("Error querying old files:", err);
			return;
		}

		if (!rows || rows.length === 0) {
			log("No old files to clean up");
			return;
		}

		log("Found", rows.length, "old files to delete");

		var deletedFiles = 0;
		var deletedRecords = 0;

		rows.forEach(function(row) {
			const filePath = config.upload_dir + '/' + row.sha;

			// Delete file from disk
			fsPromises.unlink(filePath).then(function() {
				deletedFiles++;
				log("Deleted old file:", row.fileName, "(sha:", row.sha + ")");
			}).catch(function(unlinkErr) {
				if (unlinkErr.code !== 'ENOENT') {
					logError("Error deleting old file:", filePath, unlinkErr);
				}
			});
		});

		// Delete records from database
		const deleteQuery = "DELETE FROM uploaded_files WHERE timestamp < strftime('%s', 'now', '-" + retentionDays + " days')";
		db.run(deleteQuery, function(dbErr) {
			if (dbErr) {
				logError("Error deleting old file records:", dbErr);
			} else {
				deletedRecords = this.changes;
				log("File retention cleanup complete:", deletedRecords, "DB records deleted");
			}
		});
	});
}

// Schedule periodic cleanup every hour
setInterval(cleanupOrphanedChunks, 60 * 60 * 1000);
setInterval(cleanupOldFiles, 60 * 60 * 1000);

// Cleanup function for old audit logs (privacy/GDPR compliance)
function cleanupOldAuditLogs() {
	// Check if audit log retention is configured
	if (!config.audit_log_retention_days || config.audit_log_retention_days <= 0) {
		return; // Retention disabled, keep logs forever
	}

	const retentionDays = config.audit_log_retention_days;
	log("Running cleanup for audit logs older than", retentionDays, "days");

	// Delete logs older than retention period
	const deleteQuery = "DELETE FROM audit_log WHERE timestamp < strftime('%s', 'now', '-" + retentionDays + " days')";
	db.run(deleteQuery, function(err) {
		if (err) {
			logError("Error deleting old audit logs:", err);
		} else {
			const deletedRecords = this.changes;
			if (deletedRecords > 0) {
				log("Audit log cleanup complete:", deletedRecords, "records deleted");
			}
		}
	});
}

// Run file retention cleanup on startup
if (config.file_retention_days && config.file_retention_days > 0) {
	cleanupOldFiles();
}

// Run audit log cleanup on startup
if (config.audit_log_retention_days && config.audit_log_retention_days > 0) {
	cleanupOldAuditLogs();
}

// Schedule periodic audit log cleanup every hour
setInterval(cleanupOldAuditLogs, 60 * 60 * 1000);

// Track failed login attempts per username for account lockout
const failedLogins = {}; // { username: { count: N, lockUntil: timestamp } }
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Track active sessions per user for concurrent session limits
const activeSessions = {}; // { username: [sessionID1, sessionID2, ...] }
const MAX_CONCURRENT_SESSIONS = 3;

function isAccountLocked(username) {
	if (!failedLogins[username]) return false;

	const now = Date.now();
	if (failedLogins[username].lockUntil && now < failedLogins[username].lockUntil) {
		return true; // Still locked
	}

	// Lock expired, reset counter
	if (failedLogins[username].lockUntil && now >= failedLogins[username].lockUntil) {
		delete failedLogins[username];
	}

	return false;
}

function recordFailedLogin(username) {
	if (!failedLogins[username]) {
		failedLogins[username] = { count: 0, lockUntil: null };
	}

	failedLogins[username].count++;

	if (failedLogins[username].count >= MAX_LOGIN_ATTEMPTS) {
		failedLogins[username].lockUntil = Date.now() + LOCKOUT_DURATION_MS;
		log("Account locked due to failed login attempts:", username);
		return true; // Now locked
	}

	return false; // Not locked yet
}

function resetFailedLogins(username) {
	delete failedLogins[username];
}

function addActiveSession(username, sessionID) {
	if (!activeSessions[username]) {
		activeSessions[username] = [];
	}

	// Add new session
	activeSessions[username].push(sessionID);

	// If exceeded max concurrent sessions, remove oldest session
	if (activeSessions[username].length > MAX_CONCURRENT_SESSIONS) {
		const oldestSessionID = activeSessions[username].shift();
		log("Removing oldest session for", username, "- max concurrent sessions reached");
	}
}

function removeActiveSession(username, sessionID) {
	if (activeSessions[username]) {
		activeSessions[username] = activeSessions[username].filter(function(sid) {
			return sid !== sessionID;
		});
		if (activeSessions[username].length === 0) {
			delete activeSessions[username];
		}
	}
}

// Rate limiting configuration
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 5, // Limit each IP to 5 login requests per window
	message: 'Too many login attempts, please try again after 15 minutes',
	standardHeaders: true,
	legacyHeaders: false,
});

const uploadLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // Limit each IP to 100 upload requests per window
	message: 'Too many upload requests, please try again after 15 minutes',
	standardHeaders: true,
	legacyHeaders: false,
});

const downloadLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 200, // Limit each IP to 200 downloads per window
	message: 'Too many download requests, please try again after 15 minutes',
	standardHeaders: true,
	legacyHeaders: false,
	skip: (request) => !!request.user, // Authenticated users bypass rate limit
});

// auth stuff
if (config.authdetails && config.authdetails.username && config.authdetails.password) {
	app.use(session({
		secret: config.secret,
		resave: false,
		saveUninitialized: false,
		name: 'sid', // Non-default name to prevent fingerprinting
		cookie: {
			httpOnly: true, // Prevent XSS access to cookies
			secure: process.env.NODE_ENV === 'production', // HTTPS only in production
			sameSite: 'lax', // CSRF protection while allowing navigation
			maxAge: (config.session_timeout_hours || 24) * 60 * 60 * 1000 // Configurable timeout
		}
	}));
	app.use(passport.initialize());
	app.use(passport.session());

	// Setup body parser only for login route (after session/passport setup) with size limits
	app.use('/login', express.urlencoded({ extended: false, limit: '1kb' }));
	app.use('/login', express.json({ limit: '1kb' }));

	app.get('/login', function(request, response) {
	  response.sendFile(currentPath + '/static/login.html');
	});
	app.post('/login',
	  loginLimiter, // Apply rate limiting to login attempts
	  body('username').trim().notEmpty().withMessage('Username is required'),
	  body('password').notEmpty().withMessage('Password is required'),
	  handleValidationErrors,
	  function(req, res, next) {
		const username = req.body.username;

		// Check if account is locked
		if (isAccountLocked(username)) {
			audit('LOGIN_LOCKED', req.ip, username, { reason: 'Account temporarily locked' }, 'FAILURE');
			return res.status(429).send('Account temporarily locked due to too many failed attempts. Please try again later.');
		}

		passport.authenticate('local', function(err, user, info) {
			if (err) {
				logError("Login error:", err);
				audit('LOGIN_ERROR', req.ip, username, { error: err.message }, 'FAILURE');
				return next(err);
			}
			if (!user) {
				// Record failed login and check if should lock account
				const nowLocked = recordFailedLogin(username);
				audit('LOGIN_FAILURE', req.ip, username, {
					reason: info?.message || 'Invalid credentials',
					locked: nowLocked
				}, 'FAILURE');
				return res.redirect('/login');
			}

			// Successful login - reset failed login counter
			resetFailedLogins(username);

			// Regenerate session to prevent session fixation attacks
			req.session.regenerate(function(regenerateErr) {
				if (regenerateErr) {
					logError("Session regeneration error:", regenerateErr);
					audit('LOGIN_ERROR', req.ip, user, { error: 'Session regeneration failed' }, 'FAILURE');
					return next(regenerateErr);
				}

				req.logIn(user, function(err) {
					if (err) {
						logError("Login session error:", err);
						audit('LOGIN_ERROR', req.ip, user, { error: err.message }, 'FAILURE');
						return next(err);
					}

					// Track session for concurrent session limits
					addActiveSession(user, req.sessionID);

					audit('LOGIN_SUCCESS', req.ip, user, {}, 'SUCCESS');
					return res.redirect('/');
				});
			});
		})(req, res, next);
	  }
	);

	passport.serializeUser(function(user, done) { done(null, user); });
	passport.deserializeUser(function(user, done) { done(null, user); });

	// Handle session destruction for concurrent session tracking
	app.use(function(req, res, next) {
		if (req.session) {
			var originalDestroy = req.session.destroy.bind(req.session);
			req.session.destroy = function(callback) {
				if (req.user) {
					removeActiveSession(req.user, req.sessionID);
				}
				originalDestroy(callback);
			};
		}
		next();
	});
	passport.use(new LocalStrategy(function(username, password, done) {
		// Check database users first (multi-user support)
		db.get("SELECT username, password_hash, is_admin FROM users WHERE username = ?", [username], function(err, dbUser) {
			if (err) {
				logError("Database error during authentication:", err);
				return done(err);
			}

			if (dbUser) {
				// User found in database - verify password
				bcrypt.compare(password, dbUser.password_hash, function(bcryptErr, result) {
					if (bcryptErr) {
						logError("Error comparing password:", bcryptErr);
						return done(bcryptErr);
					}
					if (result) {
						// Update last_login timestamp
						db.run("UPDATE users SET last_login = strftime('%s', 'now') WHERE username = ?", [username]);
						return done(null, username);
					} else {
						return done(null, false, { message: 'Invalid credentials' });
					}
				});
			} else {
				// No database user found, fall back to config-based auth (backward compatibility)
				if (!config.authdetails || !config.authdetails.username) {
					return done(null, false, { message: 'Invalid credentials' });
				}

				// Verify username using constant-time comparison to prevent timing attacks
				if (!timingSafeEqual(username, config.authdetails.username)) {
					return done(null, false, { message: 'Invalid credentials' });
				}

				// Only accept bcrypt hashed passwords (starts with $2b$ or $2a$)
				const isPasswordHashed = config.authdetails.password &&
				                          (config.authdetails.password.startsWith('$2b$') ||
				                           config.authdetails.password.startsWith('$2a$'));

				if (!isPasswordHashed) {
					// SECURITY ERROR: Plaintext password not allowed
					logError("CRITICAL: Password in config.json is not hashed! Authentication disabled.");
					logError("Hash your password with: node -e \"require('bcrypt').hash('your_password', 10).then(console.log)\"");
					return done(null, false, { message: 'Authentication misconfigured - contact administrator' });
				}

				// Compare with hashed password
				bcrypt.compare(password, config.authdetails.password, function(err, result) {
					if (err) {
						logError("Error comparing password:", err);
						return done(err);
					}
					if (result) {
				return done(null, config.authdetails.username);
					} else {
						return done(null, false, { message: 'Invalid credentials' });
					}
				});
			}
		});
	}));
	app.use(function(request, response, next) {
		// Allow access to login page, download URLs, and collection URLs without authentication
		if (!request.user &&
			!request.path.startsWith('/login') &&
			!request.path.startsWith('/d/') &&
			!request.path.startsWith('/c/')) {
			return response.redirect('/login');
		}
		next();
	});
}
// end auth stuff

app.use(function(request, response, next) {
	if (config.surl && request.headers.host != (config.surl + ':' + config.port)) {
		var rdr = 'http://'+config.surl + ':' + (request.app.settings.port || config.port || '80') + (request.path || '/');
		response.redirect(rdr);
	} else {
		next();
	}
});


app.use(express.static(currentPath + '/static/'));

const safeRandomId = async (length, retryCount) => new Promise((resolve, _reject) => {
	if (length === undefined)
		length = 4; // Start with 4 chars for better distribution (64^4 = 16M combinations)
	else if (length > 64)
		return resolve(false); // Max length exceeded

	if (retryCount === undefined)
		retryCount = 0;
	else if (retryCount > 10) {
		logError("Too many ID generation retries - possible collision attack or database issue");
		return resolve(false); // Max retries exceeded
	}

	var id = crypto
		.randomBytes(length)
		.map(function(c) {
			return validChars[c % validChars.length];
		})
		.join('');

	db.get("SELECT count(*) c FROM uploaded_files WHERE sha=?", [id], (err, dbres) => {
		if (err) {
			logError("Database error checking ID collision:", err);
			return resolve(false);
		}
		if (dbres.c === 0) {
			if (retryCount > 0) {
				log("ID collision resolved after", retryCount, "retries, length:", length);
			}
			return resolve(id);
		} else {
			// Collision detected - retry with longer ID
			log("ID collision detected for", id, "- retrying with longer length");
			safeRandomId(length + 1, retryCount + 1).then(resolve);
		}
	});
})

async function hashId(originalFileName, remoteAddress) {
	var result = crypto
		.createHash('sha256')
		.update(originalFileName)
		.update(new Date().getTime().toString())
		.update(config.secret)
		.update(remoteAddress)
		.digest("hex");

	if (config.short_hash)
		result = await shortenHash(result);

	return result;
}

function shortenHash(hash) {
	return new Promise(function (resolve, reject) {
		function checkLength(i) {
			if (i >= hash.length) {
				return resolve(false);
			}

			db.get("SELECT count(*) c FROM uploaded_files WHERE sha=?", [hash.substr(0,i)], (err, dbres) => {
				if (err) {
					return resolve(false);
				}
				if (dbres.c === 0) {
					return resolve(hash.substr(0,i));
				}
				checkLength(i + 1);
			});
		}
		checkLength(4);
	});
}


app.post('/upload/',
	uploadLimiter,
	query('chunkIndex').isInt({ min: 0 }).withMessage('chunkIndex must be a non-negative integer'),
	query('uuid').isUUID(4).withMessage('uuid must be a valid UUID v4'),
	handleValidationErrors,
	function(request, response) {
	var fileBuffer = Buffer.from("", 'binary');
	request.on('data', function (postDataChunk) {
		var inBuffer = Buffer.from(postDataChunk, 'binary');
		fileBuffer = Buffer.concat([fileBuffer, inBuffer]);
	});

	request.on('end', async function () {
		if (fileBuffer.length <= 0) {
			logError("serveUploadChunks: fileBuffer empty");
			response.status(400).json({ error: "Empty file buffer" });
			return false;
		}

		var uuid              = request.query.uuid;
		var chunkID           = request.query.chunkIndex;
		var remoteAddress     = request.ip;

		// Check quotas for first chunk only
		if (parseInt(chunkID) === 0) {
			try {
				await checkUploadQuotas(remoteAddress);
			} catch (quotaError) {
				logError("Quota check failed:", quotaError);
				audit('UPLOAD_QUOTA_EXCEEDED', remoteAddress, null, { uuid, error: quotaError.error }, 'FAILURE');
				response.status(quotaError.code).set('Retry-After', quotaError.retryAfter || 3600).json({
					error: quotaError.error
				});
				return;
			}
		}

		var fileName          = crypto.createHash('sha256').update(
									chunkID +
									config.secret +
									remoteAddress + uuid
								).digest("hex") + "_" + chunkID;

		// save chunk to database
		var stmt = db.prepare('INSERT INTO uploaded_chunks (uuid, filename, chunk_id) VALUES (?,?,?)');
		stmt.run(uuid, fileName, chunkID, function(err) {
			if (err) {
				logError("Database error:", err);
				response.status(500).json({ error: "Database error" });
				return;
			}
		stmt.finalize();

		// Encrypt chunk before saving to disk (at-rest encryption)
			var encryptedChunk = encryptChunk(fileBuffer);

			// save encrypted chunk to file
			var chunkFile = fs.createWriteStream(config.upload_dir+'/pending/'+fileName);
			chunkFile.write(encryptedChunk);
			chunkFile.end(function(err) {
				if (err) {
					logError("File write error:", err);
					response.status(500).json({ error: "File write error" });
					return;
				}

				response.writeHead(200, {'Content-Type': 'application/json'});
		response.write(JSON.stringify({'fileName':fileName, 'chunk':chunkID}));
		response.end();
			});
		});

		log(hashIP(remoteAddress).substring(0, 16) + '...','uploaded',fileName,chunkID);
	});

});

app.get('/d/:fileName/',
	downloadLimiter,
	param('fileName').matches(/^[A-Za-z0-9\-_\.~]+$/).withMessage('Invalid file name format'),
	handleValidationErrors,
	function (request, response) {
	var sha = request.params.fileName.replace(/\.[A-Za-z0-9]{3}$/,"");

	var query = "SELECT fileName FROM uploaded_files WHERE sha = ?";
	db.get(query, [sha], function(err, row) {
		if (err) {
			logError("Database error during download:", err);
			response.status(500).json({ error: "Internal server error" });
			return;
		}

		if (row === undefined || row.fileName === undefined) {
			logError('ERROR: Unknown hash, "' + sha + '"');
			response.status(404).json({ error: "File not found" });
			return false;
		}

		var fileName = currentPath + config.upload_dir.replace(/^\./,'')+'/'+sha;
		if (!fs.existsSync(fileName)) {
			logError('ERROR: No such file "' + fileName + '"');
			response.status(404).json({ error: "File not found" });
			return false;
		}

		var header = {};
		var realFileName = row.fileName;
		var safeFileName = sanitizeFilename(realFileName);

		// Encode filename for Content-Disposition (RFC 5987 for UTF-8 support)
		var encodedFileName = encodeURIComponent(safeFileName);

		var mimeType = mime.getType(realFileName) || 'application/octet-stream';
		if (mimeType && mimeType.split('/')[0] == 'image') {
			log('viewing sha:', sha, 'type:', mimeType); // Don't log actual filename for privacy
			audit('DOWNLOAD', request.ip, null, { sha, filename: realFileName, type: 'view' }, 'SUCCESS');
			response.sendFile(fileName, {
				'headers':{
					'Content-Type': mimeType,
					'Content-Disposition': 'inline; filename="' + safeFileName + '"; filename*=UTF-8\'\'' + encodedFileName,
					'X-Content-Type-Options': 'nosniff',
					'X-Download-Options': 'noopen',
					'Cache-Control': 'public, max-age=31536000, immutable'
				}
			}, function(err) {
			    if (err) {
			      logError(err);
			      response.status(err.status).end();
			    }
			});
		} else {
			log(hashIP(request.ip).substring(0, 16) + '...','downloading sha:', sha); // Don't log actual filename for privacy
			audit('DOWNLOAD', request.ip, null, { sha, filename: realFileName, type: 'download' }, 'SUCCESS');
			response.download(fileName, safeFileName, {
				headers: {
					'X-Content-Type-Options': 'nosniff',
					'X-Download-Options': 'noopen',
					'Cache-Control': 'public, max-age=31536000, immutable'
				}
			}, function(err) {
			    if (err) {
			      logError(err);
			      response.status(err.status).end();
			    }
			});
		}

	});
});

app.post('/merge/',
	uploadLimiter,
	query('name').trim().notEmpty().isLength({ max: 255 }).withMessage('File name must be 1-255 characters'),
	query('chunkCount').isInt({ min: 1 }).withMessage('chunkCount must be a positive integer'),
	query('uuid').isUUID(4).withMessage('uuid must be a valid UUID v4'),
	query('collectionID').optional().isUUID(4).withMessage('collectionID must be a valid UUID v4'),
	query('checksum').optional().matches(/^[a-f0-9]{64}$/).withMessage('checksum must be a valid SHA-256 hex string'),
	handleValidationErrors,
	async function (request, response) {
	var uuid              = request.query.uuid;
	var chunkID           = request.query.chunkIndex;
	var remoteAddress     = request.ip;
	var originalFileName  = request.query.name;
	var collectionID      = request.query.collectionID;
	var expectedChunkCount = parseInt(request.query.chunkCount) || 0;
	var clientChecksum    = request.query.checksum; // SHA-256 from client for integrity verification

	log("Merge request:", {uuid, expectedChunkCount, collectionID, hasChecksum: !!clientChecksum}); // Omit originalFileName for privacy

	var fileName;
	try {
	if (config.randomId)
		fileName 		  = await safeRandomId();
	else
			fileName  	      = await hashId(originalFileName, remoteAddress);
	} catch (err) {
		logError("Error generating filename:", err);
		response.status(500).json({ error: "Error generating filename" });
		return;
	}

	if (!fileName) {
		logError("Failed to create filename");
		response.status(500).json({ error: "Failed to create filename" });
		return;
	}

	log("Generated filename:", fileName);


	var query = "SELECT filename FROM uploaded_chunks WHERE uuid = ? ORDER BY chunk_id";
	var result_file = fs.createWriteStream(config.upload_dir+'/'+fileName);
	var fileList = [];
	var fileSize = 0;
	db.all(query, [uuid], async function(err, rows) {
		if (err) {
			logError("Database query error:", err);
			response.status(500).json({ error: "Database query error" });
			return;
		}

		if (!rows || rows.length === 0) {
			logError("No chunks found for uuid:", uuid);
			response.status(404).json({ error: "No chunks found" });
			return;
		}

		// Validate that we have all expected chunks
		if (expectedChunkCount > 0 && rows.length !== expectedChunkCount) {
			logError("Chunk count mismatch for uuid:", uuid, "- expected:", expectedChunkCount, "got:", rows.length);
			response.status(400).json({ error: "Incomplete upload - missing chunks" });
			return;
		}

		// Read and merge chunks asynchronously to avoid blocking event loop
		var hadError = false;
		for (var i = 0; i < rows.length; i++) {
			var row = rows[i];
			var chunkFileName = row.filename;
			var chunkPath = config.upload_dir+'/pending/'+chunkFileName;

			try {
				var encryptedChunkData = await fsPromises.readFile(chunkPath);
				// Decrypt chunk data before merging
				var chunkData = decryptChunk(encryptedChunkData);
				result_file.write(chunkData);
				fileSize += chunkData.length;
				fileList.push(chunkPath);
			} catch (fileErr) {
				logError("Error reading chunk file:", fileErr);
				result_file.end(); // Close the stream
				hadError = true;
				response.status(500).json({ error: "Error reading chunk file" });
				return;
			}
		}

		if (hadError) {
			return; // Don't proceed if there was an error
		}

		// Validate file size limit
		if (config.max_file_size_bytes && config.max_file_size_bytes > 0) {
			if (fileSize > config.max_file_size_bytes) {
				logError("File size exceeds limit:", fileSize, ">", config.max_file_size_bytes);
				result_file.end(); // Close the stream

				// Delete the incomplete merged file (async, non-blocking)
				fsPromises.unlink(config.upload_dir+'/'+fileName).catch(function(unlinkErr) {
					logError("Error deleting oversized file:", unlinkErr);
				});

				// Delete chunk files (async, non-blocking)
				fileList.forEach(function(chunkPath) {
					fsPromises.unlink(chunkPath).catch(function(chunkUnlinkErr) {
						logError("Error deleting chunk file:", chunkPath, chunkUnlinkErr);
					});
				});

				// Delete chunk records from database
				db.run('DELETE FROM uploaded_chunks WHERE uuid = ?', [uuid], function(dbErr) {
					if (dbErr) {
						logError("Error deleting chunk records for oversized file:", dbErr);
					}
				});

				response.status(413).json({
					error: "File size exceeds limit",
					maxSize: config.max_file_size_bytes,
					actualSize: fileSize
				});
				return;
			}
		}

		result_file.end(async function() {
			const finalFilePath = config.upload_dir+'/'+fileName;

			// Verify file integrity using checksum if provided
			if (clientChecksum) {
				try {
					console.log("Verifying file checksum...");
					const fileBuffer = await fsPromises.readFile(finalFilePath);
					const serverChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

					if (serverChecksum !== clientChecksum) {
						logError("Checksum mismatch! Client:", clientChecksum, "Server:", serverChecksum);

						// Delete corrupted file
						await fsPromises.unlink(finalFilePath).catch(function(unlinkErr) {
							logError("Error deleting corrupted file:", unlinkErr);
						});

						// Delete chunk files
						for (var i = 0; i < fileList.length; i++) {
							await fsPromises.unlink(fileList[i]).catch(function(err) {
								logError("Error deleting chunk:", err);
							});
						}

						// Delete chunk records
						db.run('DELETE FROM uploaded_chunks WHERE uuid = ?', [uuid]);

						response.status(422).json({
							error: "File integrity check failed - upload corrupted",
							details: "Checksum mismatch"
						});
						return;
					}
					console.log("Checksum verified successfully:", serverChecksum);
				} catch (checksumErr) {
					logError("Error verifying checksum:", checksumErr);
					response.status(500).json({ error: "Error verifying file integrity" });
					return;
				}
			}

			// Validate file type using magic numbers
			try {
				const detectedType = await fileTypeFromFile(finalFilePath);
				if (detectedType) {
					log("Detected file type:", detectedType.mime, "for file:", fileName);

					// Check if file type is blocked
					const blockedTypes = config.blocked_mime_types || [];
					if (blockedTypes.includes(detectedType.mime)) {
						logError("Blocked file type detected:", detectedType.mime, "for file:", fileName);
						audit('UPLOAD_BLOCKED', remoteAddress, null, {
							filename: originalFileName,
							mimeType: detectedType.mime,
							uuid
						}, 'BLOCKED');

						// Delete the merged file (async, non-blocking)
						fsPromises.unlink(finalFilePath).catch(function(unlinkErr) {
							logError("Error deleting blocked file:", unlinkErr);
						});

						// Delete chunk files (async, non-blocking)
						fileList.forEach(function(chunkPath) {
							fsPromises.unlink(chunkPath).catch(function(chunkUnlinkErr) {
								logError("Error deleting chunk file:", chunkPath, chunkUnlinkErr);
							});
						});

						// Delete chunk records from database
						db.run('DELETE FROM uploaded_chunks WHERE uuid = ?', [uuid], function(dbErr) {
							if (dbErr) {
								logError("Error deleting chunk records for blocked file:", dbErr);
							}
						});

						response.status(403).json({
							error: "File type not allowed",
							type: detectedType.mime
						});
						return;
					}
				} else {
					log("Could not detect file type for:", fileName, "- allowing upload");
				}
			} catch (typeErr) {
				logError("Error detecting file type:", typeErr);
				// Continue anyway - don't block if detection fails
			}

			// Start transaction for atomic DB operations
			db.run("BEGIN TRANSACTION", function(err) {
				if (err) {
					logError("Error starting transaction:", err);
					response.status(500).json({ error: "Database error" });
					return;
				}

				// First, insert the file record
				var insertStmt = db.prepare('INSERT INTO uploaded_files (fileName, sha, collectionID, fileSize, remote_ip) VALUES (?,?,?,?,?)');
				var hashedIP = hashIP(remoteAddress); // Hash IP for privacy/GDPR compliance
				insertStmt.run(originalFileName, fileName, collectionID, fileSize, hashedIP, function(insertErr) {
					if (insertErr) {
						insertStmt.finalize();
						// Rollback transaction on error
						db.run("ROLLBACK", function() {
							if (insertErr.code === 'SQLITE_CONSTRAINT') {
								logError("Duplicate file ID detected (race condition):", fileName);
								response.status(409).json({ error: "Duplicate file ID - please retry upload" });
							} else {
								logError("Error inserting file record:", insertErr);
								response.status(500).json({ error: "Error inserting file record" });
							}
						});
						return;
					}
					insertStmt.finalize();

					// Delete chunk records from database
					var deleteStmt = db.prepare('DELETE FROM uploaded_chunks WHERE uuid = ?');
					deleteStmt.run(uuid, function(deleteErr) {
						deleteStmt.finalize();

					if (deleteErr) {
						logError("Error deleting chunk records:", deleteErr);
						// Rollback transaction - keep chunks in DB
						db.run("ROLLBACK", function() {
							response.status(500).json({ error: "Database error" });
						});
						return;
					}

					// Commit transaction - both operations succeeded
					db.run("COMMIT", function(commitErr) {
						if (commitErr) {
							logError("Error committing transaction:", commitErr);
							response.status(500).json({ error: "Database error" });
							return;
						}

							// Only delete chunk files AFTER successful DB commit
			fileList.forEach(function(file) {
				fs.unlink(file, function (err) {
									if (err) logError("Error deleting chunk file:", err);
				});
			});

							// Audit successful upload
							audit('UPLOAD_SUCCESS', remoteAddress, null, {
								filename: originalFileName,
								sha: fileName,
								fileSize: fileSize,
								collectionID: collectionID || null
							}, 'SUCCESS');

							response.writeHead(200, {'Content-Type': 'application/json'});
		response.write(JSON.stringify({'fileName':fileName}));
		response.end();
						});
					});
				});
			});
		});
	});
});

app.get('/c/:collectionID',
	param('collectionID').isUUID(4).withMessage('collectionID must be a valid UUID v4'),
	handleValidationErrors,
	function (request, response) {
	var collectionID = request.params.collectionID;
	var query = "SELECT fileName, sha, fileSize, timestamp FROM uploaded_files WHERE collectionID = ? ORDER BY fid";
	db.all(query, [collectionID], function(err, rows) {
		if (err) {
			logError("Database error fetching collection:", err);
			response.status(500).json({ error: "Database error" });
			return;
		}

		if(rows && rows.length > 0) {
			// Check collection expiration if configured
			if (config.collection_expiration_days && config.collection_expiration_days > 0) {
				const now = Math.floor(Date.now() / 1000);
				const expirationSeconds = config.collection_expiration_days * 24 * 60 * 60;
				const oldestTimestamp = Math.min.apply(null, rows.map(function(r) { return r.timestamp; }));

				if (now - oldestTimestamp > expirationSeconds) {
					log("Collection expired:", collectionID, "oldest file:", oldestTimestamp);
					response.status(410).json({ error: "Collection has expired" }); // 410 Gone
					return;
				}
			}

			var files = rows.map(function(row) {
				return {fileName:row.fileName,sha:row.sha,fileSize:row.fileSize,timestamp:row.timestamp};
			});

			response.json(files);
		} else {
			response.status(404).json({ error: "Collection not found" });
			return false;
		}
	});
});

// API endpoint to get current quota usage
app.get('/api/quota', function (request, response) {
	const remoteIP = request.ip;
	const hashedIP = hashIP(remoteIP); // Hash IP for privacy
	const now = Math.floor(Date.now() / 1000);
	const dayAgo = now - 86400;

	const quotaInfo = {
		enabled: false,
		global: {},
		perIP: {}
	};

	// Check if any quotas are configured
	const hasQuotas = (config.max_storage_bytes && config.max_storage_bytes > 0) ||
	                  (config.per_ip_daily_bytes && config.per_ip_daily_bytes > 0) ||
	                  (config.per_ip_daily_files && config.per_ip_daily_files > 0);

	if (!hasQuotas) {
		return response.json(quotaInfo);
	}

	quotaInfo.enabled = true;

	// Get global storage if configured
	if (config.max_storage_bytes && config.max_storage_bytes > 0) {
		db.get("SELECT SUM(fileSize) as total FROM uploaded_files", [], (err, row) => {
			if (!err) {
				quotaInfo.global.used = row?.total || 0;
				quotaInfo.global.limit = config.max_storage_bytes;
			}

			// Get per-IP quotas if configured
			if (config.per_ip_daily_bytes && config.per_ip_daily_bytes > 0) {
				db.get(
					"SELECT SUM(fileSize) as total FROM uploaded_files WHERE remote_ip = ? AND timestamp > ?",
					[hashedIP, dayAgo],
					(err2, row2) => {
						if (!err2) {
							quotaInfo.perIP.bytesUsed = row2?.total || 0;
							quotaInfo.perIP.bytesLimit = config.per_ip_daily_bytes;
						}

						// Get per-IP file count
						if (config.per_ip_daily_files && config.per_ip_daily_files > 0) {
							db.get(
								"SELECT COUNT(*) as count FROM uploaded_files WHERE remote_ip = ? AND timestamp > ?",
								[hashedIP, dayAgo],
								(err3, row3) => {
									if (!err3) {
										quotaInfo.perIP.filesUsed = row3?.count || 0;
										quotaInfo.perIP.filesLimit = config.per_ip_daily_files;
									}
									response.json(quotaInfo);
								}
							);
						} else {
							response.json(quotaInfo);
						}
					}
				);
			} else if (config.per_ip_daily_files && config.per_ip_daily_files > 0) {
				db.get(
					"SELECT COUNT(*) as count FROM uploaded_files WHERE remote_ip = ? AND timestamp > ?",
					[hashedIP, dayAgo],
					(err3, row3) => {
						if (!err3) {
							quotaInfo.perIP.filesUsed = row3?.count || 0;
							quotaInfo.perIP.filesLimit = config.per_ip_daily_files;
						}
						response.json(quotaInfo);
					}
				);
			} else {
				response.json(quotaInfo);
			}
		});
	} else {
		// No global quota, check per-IP only
		if (config.per_ip_daily_bytes && config.per_ip_daily_bytes > 0) {
			db.get(
				"SELECT SUM(fileSize) as total FROM uploaded_files WHERE remote_ip = ? AND timestamp > ?",
				[hashedIP, dayAgo],
				(err, row) => {
					if (!err) {
						quotaInfo.perIP.bytesUsed = row?.total || 0;
						quotaInfo.perIP.bytesLimit = config.per_ip_daily_bytes;
					}

					if (config.per_ip_daily_files && config.per_ip_daily_files > 0) {
						db.get(
							"SELECT COUNT(*) as count FROM uploaded_files WHERE remote_ip = ? AND timestamp > ?",
							[hashedIP, dayAgo],
							(err2, row2) => {
								if (!err2) {
									quotaInfo.perIP.filesUsed = row2?.count || 0;
									quotaInfo.perIP.filesLimit = config.per_ip_daily_files;
								}
								response.json(quotaInfo);
							}
						);
					} else {
						response.json(quotaInfo);
					}
				}
			);
		} else if (config.per_ip_daily_files && config.per_ip_daily_files > 0) {
			db.get(
				"SELECT COUNT(*) as count FROM uploaded_files WHERE remote_ip = ? AND timestamp > ?",
				[hashedIP, dayAgo],
				(err, row) => {
					if (!err) {
						quotaInfo.perIP.filesUsed = row?.count || 0;
						quotaInfo.perIP.filesLimit = config.per_ip_daily_files;
					}
					response.json(quotaInfo);
				}
			);
		} else {
			response.json(quotaInfo);
		}
	}
});

var server = app.listen(config.port, config.ip, function () {
	var host = server.address().address;
	var port = server.address().port;
	log("simple-file-sharer started on http://"+host+":"+port);
});
