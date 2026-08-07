require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const uploadRoute   = require('./routes/upload');
const registerRoute = require('./routes/register');
const usersRoute    = require('./routes/users');
const paymentRoute  = require('./routes/payment');   // ← NEW
const newsRoute     = require('./routes/news');       // ← NEW: GET /api/news

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
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});