require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const uploadRoute   = require('./routes/upload');
const registerRoute = require('./routes/register');
const usersRoute    = require('./routes/users');
const paymentRoute  = require('./routes/payment');   // ← NEW
const newsRoute     = require('./routes/news');       // ← NEW: GET /api/news

const { initDb } = require('./db/database');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware — ORDER MATTERS ──────────────────────────────────────────────

// const allowedOrigins = [
//     'https://stellarwave-frontend.onrender.com',
//     'http://localhost:4321'
// ];

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') ?? [];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. curl, Postman) and allowed origins
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS blocked: ${origin}`));
        }
    }
}));

/*
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:4321',
}));
*/

// Stripe webhook raw body MUST come before express.json()
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// News images/videos now live in images/newsImages (see routes/news.js).
// Mounted BEFORE the general /files → uploads/ static route below so it
// takes priority for this specific sub-path. The broader /files mount
// still runs after as a fallback, so any files already sitting in the old
// uploads/newsImages location (from before this change) keep working too.
app.use('/files/newsImages', express.static(path.join(__dirname, 'images', 'newsImages')));

app.use('/files', express.static(path.join(__dirname, 'uploads')));

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/upload',   uploadRoute);
app.use('/api/register', registerRoute);
app.use('/api/users',    usersRoute);
app.use('/api/payment',  paymentRoute);   // ← /api/payment/create-intent  &  /api/payment/confirm
app.use('/api/news',     newsRoute);       // ← GET /api/news

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── Start ───────────────────────────────────────────────────────────────────
//TODO: delete this line app.listen(PORT, () => {
//TODO: delete this line     console.log(`Server running at http://localhost:${PORT}`);
//TODO: delete this line });
initDb()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('[DB] Failed to initialize database:', err.message);
        process.exit(1);
});