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

    CREATE TABLE IF NOT EXISTS items (
        itemID INTEGER PRIMARY KEY,
        itemName TEXT NOT NULL,
        itemWeight INTEGER,
        itemPrice INTEGER
    );

    CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        image TEXT NOT NULL,
        article TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// Seed items table with default rows (only if empty)
const itemsCount = db.prepare('SELECT COUNT(*) AS count FROM items').get().count;
if (itemsCount === 0) {
    // NOTE: the `items` table (see CREATE TABLE above) only has 4 columns
    // (itemID, itemName, itemWeight, itemPrice). The insert below used to
    // reference itemInStock/itemImage, which don't exist on this table and
    // threw "table items has no column named itemInStock". Trimmed to match
    // the actual schema.
    const insertItem = db.prepare(
        'INSERT INTO items (itemID, itemName, itemWeight, itemPrice) VALUES (?, ?, ?, ?)'
    );
    const defaultItems = [
        [8539734, 'Text', 256, 300],
        [2226735, 'Photo', 5, 500],
        [6684982, 'Audio', 7, 700],
        [3626937, 'Video', 10, 900]
    ];
    const insertMany = db.transaction((items) => {
        for (const item of items) insertItem.run(...item);
    });
    insertMany(defaultItems);
}

// Seed news table with default rows (only if empty)
// NOTE: this used to redeclare `const itemsCount`, which is a SyntaxError
// ("Identifier 'itemsCount' has already been declared") since a name can't
// be declared twice with `const` in the same scope. That crashed the entire
// module on load. Renamed to `newsCount`.
const newsCount = db.prepare('SELECT COUNT(*) AS count FROM news').get().count;
if (newsCount === 0) {
    // NOTE: dropped `created_at` from the insert. The table already defines
    // `created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, so forcing in a plain
    // string like '10/11/2026' both overrides that default and stores a
    // non-ISO format that won't sort/compare correctly against real
    // timestamps. Letting the column default apply is consistent with how
    // the `items` seed above does it.
    const insertItem = db.prepare(
        'INSERT INTO news (title, image, article) VALUES (?, ?, ?)'
    );
    const defaultItems = [
        // NOTE: filenames corrected to match what's actually on disk in
        // frontend/public/images/destinationBlock/ — both of these were
        // mismatched and would have produced broken <img> tags:
        //   '06Luyten-b.jpg'        -> actual file is '06Luyten-b.jpeg'
        //   '04TeegardensStar.jepg' -> typo, actual file is '...jpeg'
        ["News1", '05Kepler-186f.jpg', "Lorem ipsum dolor sit amet consectetur adipisicing elit. Quas consectetur sunt fugiat suscipit modi nemo! Maxime nostrum dicta placeat dolore!"],
        ["News2", '06Luyten-b.jpeg', "Lorem ipsum dolor sit amet consectetur adipisicing elit. Quas consectetur sunt fugiat suscipit modi nemo! Maxime nostrum dicta placeat dolore!"],
        ["News3", '04TeegardensStar.jpeg', "Lorem ipsum dolor sit amet consectetur adipisicing elit. Quas consectetur sunt fugiat suscipit modi nemo! Maxime nostrum dicta placeat dolore!"],
        ["News4", 'Sagittarius.webp', "Lorem ipsum dolor sit amet consectetur adipisicing elit. Quas consectetur sunt fugiat suscipit modi nemo! Maxime nostrum dicta placeat dolore!"]
    ];
    const insertMany = db.transaction((news) => {
        for (const item of news) insertItem.run(...item);
    });
    insertMany(defaultItems);
}

// Reusable query helpers
const queries = {
    insertUser: db.prepare(
        'INSERT INTO users (Fname, Lname, email) VALUES (?, ?, ?)'
    ),
    userEmailExists: db.prepare(
        'SELECT id FROM users WHERE email = ?'
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
    getAllItems: db.prepare(
        'SELECT * FROM items'
    ),
    getItem: db.prepare(
        'SELECT * FROM items WHERE itemID = ?'
    ),
    // Added: was missing entirely, so there was no way for a route to read
    // the news table back out. Needed for GET /api/news.
    getAllNews: db.prepare(
        'SELECT * FROM news ORDER BY created_at DESC'
    ),
};

module.exports = { db, queries };