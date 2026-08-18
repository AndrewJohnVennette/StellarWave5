const express  = require('express');
const { queries } = require('../db/database');

const router = express.Router();

// POST /api/users
// Body: { firstName, lastName, email }
// Inserts a row into the `users` table (Fname, Lname, email).
//TODO: delete this line router.post('/', (req, res) => {
router.post('/', async (req, res) => {
    const { firstName, lastName, email } = req.body;

    if (!firstName || !lastName || !email) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email address.' });
    }

    // Duplicate check
    //TODO: delete this line const existing = queries.userEmailExists.get(email);
    //TODO: delete this line if (existing) {
    const { rows: existing } = await queries.userEmailExists(email);
    if (existing.length) {
        return res.status(409).json({ error: 'Email already exists in users table.' });
    }

    try {
        //TODO: delete this line const result = queries.insertUser.run(firstName, lastName, email);
        //TODO: delete this line return res.status(201).json({ success: true, id: result.lastInsertRowid });
        const { rows } = await queries.insertUser(firstName, lastName, email);
        return res.status(201).json({ success: true, id: rows[0].id });
    } catch (err) {
        console.error('[DB] insertUser failed:', err.message);
        return res.status(500).json({ error: 'Database error.' });
    }
});

module.exports = router;
