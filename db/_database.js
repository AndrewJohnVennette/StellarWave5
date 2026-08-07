const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'site.db'));

// Create tables on first run
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        Fname TEXT NOT NULL,
        Lname TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT,
        service TEXT,
        amount INTEGER,
        stripe_session_id TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_name TEXT,
        stored_name TEXT,
        size INTEGER,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

        CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name  TEXT NOT NULL,
        email      TEXT NOT NULL,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// Reusable query helpers
const queries = {
    insertUser: db.prepare(
        'INSERT INTO users (name, email) VALUES (?, ?)'
    ),
    getUser: db.prepare(
        'SELECT * FROM users WHERE email = ?'
    ),
    insertOrder: db.prepare(
        'INSERT INTO orders (user_email, service, amount, stripe_session_id) VALUES (?, ?, ?, ?)'
    ),
    insertUpload: db.prepare(
        'INSERT INTO uploads (original_name, stored_name, size) VALUES (?, ?, ?)'
    ),
    getAllUploads: db.prepare(
        'SELECT * FROM uploads ORDER BY uploaded_at DESC'
    ),
    insertRegistration: db.prepare(
        'INSERT INTO registrations (first_name, last_name, email) VALUES (?, ?, ?)'
    ),
    emailExists: db.prepare(
        'SELECT id FROM registrations WHERE email = ?'
    ),
};

module.exports = { db, queries };