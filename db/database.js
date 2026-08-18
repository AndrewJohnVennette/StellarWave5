const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Most hosted Postgres providers (Render, Supabase, Neon, etc.) require SSL.
    // Local Postgres usually does not. Toggle via env instead of hardcoding.
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Postgres connections are async, so table creation + seeding can no longer
// happen at module-load time like better-sqlite3 did. This is called once
// from server.js before the app starts listening.
async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            "Fname" TEXT NOT NULL,
            "Lname" TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            user_email TEXT,
            service TEXT,
            amount INTEGER,
            stripe_session_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS uploads (
            id SERIAL PRIMARY KEY,
            original_name TEXT,
            stored_name TEXT,
            size INTEGER,
            uploaded_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS registrations (
            id SERIAL PRIMARY KEY,
            first_name TEXT NOT NULL,
            last_name  TEXT NOT NULL,
            email      TEXT NOT NULL,
            registered_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS items (
            "itemID" INTEGER PRIMARY KEY,
            "itemName" TEXT NOT NULL,
            "itemWeight" INTEGER,
            "itemPrice" INTEGER
        );

        CREATE TABLE IF NOT EXISTS news (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            image TEXT NOT NULL DEFAULT 'Sagittarius.webp',
            article TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);

    // Defensive migration for databases created before the DEFAULT above
    // existed. A DEFAULT only kicks in when a column is omitted from an
    // INSERT — it does NOT rescue code that explicitly passes NULL — so
    // this is a safety net, not the fix. The real fix is in routes/news.js,
    // which no longer ever passes null for `image`.
    await pool.query(`
        ALTER TABLE news ALTER COLUMN image SET DEFAULT 'Sagittarius.webp';
    `);

    // Seed items (only if empty)
    const { rows: [{ count: itemsCount }] } = await pool.query('SELECT COUNT(*) AS count FROM items');
    if (Number(itemsCount) === 0) {
        const defaultItems = [
            [8539734, 'Text', 256, 300],
            [2226735, 'Photo', 5, 500],
            [6684982, 'Audio', 7, 700],
            [3626937, 'Video', 10, 900],
        ];
        for (const item of defaultItems) {
            await pool.query(
                'INSERT INTO items ("itemID", "itemName", "itemWeight", "itemPrice") VALUES ($1, $2, $3, $4)',
                item
            );
        }
    }

    // Seed news (only if empty)
    const { rows: [{ count: newsCount }] } = await pool.query('SELECT COUNT(*) AS count FROM news');
    if (Number(newsCount) === 0) {
        const defaultNews = [
            ["News1", '05Kepler-186f.jpg', "Lorem ipsum dolor sit amet consectetur adipisicing elit. Quas consectetur sunt fugiat suscipit modi nemo! Maxime nostrum dicta placeat dolore!"],
            ["News2", '06Luyten-b.jpeg', "Lorem ipsum dolor sit amet consectetur adipisicing elit. Quas consectetur sunt fugiat suscipit modi nemo! Maxime nostrum dicta placeat dolore!"],
            ["News3", '04TeegardensStar.jpeg', "Lorem ipsum dolor sit amet consectetur adipisicing elit. Quas consectetur sunt fugiat suscipit modi nemo! Maxime nostrum dicta placeat dolore!"],
            ["News4", 'Sagittarius.webp', "Lorem ipsum dolor sit amet consectetur adipisicing elit. Quas consectetur sunt fugiat suscipit modi nemo! Maxime nostrum dicta placeat dolore!"],
        ];
        for (const item of defaultNews) {
            await pool.query(
                'INSERT INTO news (title, image, article) VALUES ($1, $2, $3)',
                item
            );
        }
    }
}

// Reusable query helpers — each returns a Promise resolving to a pg
// QueryResult ({ rows, rowCount, ... }), so every call site needs `await`
// and to read `.rows` (or `.rows[0]`) instead of calling `.get()/.run()/.all()`.
const queries = {
    insertUser: (firstName, lastName, email) =>
        pool.query(
            'INSERT INTO users ("Fname", "Lname", email) VALUES ($1, $2, $3) RETURNING id',
            [firstName, lastName, email]
        ),
    userEmailExists: (email) =>
        pool.query('SELECT id FROM users WHERE email = $1', [email]),
    getUser: (email) =>
        pool.query('SELECT * FROM users WHERE email = $1', [email]),
    insertOrder: (email, service, amount, stripeSessionId) =>
        pool.query(
            'INSERT INTO orders (user_email, service, amount, stripe_session_id) VALUES ($1, $2, $3, $4)',
            [email, service, amount, stripeSessionId]
        ),
    updateOrderStatus: (status, stripeSessionId) =>
        pool.query(
            'UPDATE orders SET status = $1 WHERE stripe_session_id = $2',
            [status, stripeSessionId]
        ),
    insertUpload: (originalName, storedName, size) =>
        pool.query(
            'INSERT INTO uploads (original_name, stored_name, size) VALUES ($1, $2, $3)',
            [originalName, storedName, size]
        ),
    getAllUploads: () =>
        pool.query('SELECT * FROM uploads ORDER BY uploaded_at DESC'),
    insertRegistration: (firstName, lastName, email) =>
        pool.query(
            'INSERT INTO registrations (first_name, last_name, email) VALUES ($1, $2, $3)',
            [firstName, lastName, email]
        ),
    emailExists: (email) =>
        pool.query('SELECT id FROM registrations WHERE email = $1', [email]),
    getAllItems: () =>
        pool.query('SELECT * FROM items'),
    getItem: (itemId) =>
        pool.query('SELECT * FROM items WHERE "itemID" = $1', [itemId]),
    getAllNews: () =>
        pool.query('SELECT * FROM news ORDER BY created_at DESC'),
    getNewsById: (id) =>
        pool.query('SELECT * FROM news WHERE id = $1', [id]),
    deleteNews: (id) =>
        pool.query('DELETE FROM news WHERE id = $1', [id]),
    updateNewsImage: (id, image) =>
        pool.query('UPDATE news SET image = $1 WHERE id = $2', [image, id]),
    insertNews: (title, image, article) =>
        pool.query(
            'INSERT INTO news (title, image, article) VALUES ($1, $2, $3) RETURNING id',
            [title, image, article]
        ),
};

module.exports = { pool, queries, initDb };