const express  = require('express');
const { queries } = require('../db/database');

const router = express.Router();

// POST /api/users
// Body: { firstName, lastName, email }
// Inserts a row into the `users` table (Fname, Lname, email).
router.post('/', (req, res) => {
    const { firstName, lastName, email } = req.body;

    if (!firstName || !lastName || !email) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email address.' });
    }

    // Duplicate check
    const existing = queries.userEmailExists.get(email);
    if (existing) {
        return res.status(409).json({ error: 'Email already exists in users table.' });
    }

    try {
        const result = queries.insertUser.run(firstName, lastName, email);
        return res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        console.error('[DB] insertUser failed:', err.message);
        return res.status(500).json({ error: 'Database error.' });
    }
});

module.exports = router;
