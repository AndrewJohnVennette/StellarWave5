const express  = require('express');
const { queries } = require('../db/database');

const router = express.Router();

// GET /api/news
// Returns all rows from the `news` table, most recent first.
// NOTE: this route did not exist before — without it there was no way
// for the frontend (cosmosnews.astro) to ever receive news data.
router.get('/', (req, res) => {
    try {
        const news = queries.getAllNews.all();
        return res.status(200).json({ success: true, news });
    } catch (err) {
        console.error('[DB] getAllNews failed:', err.message);
        return res.status(500).json({ error: 'Database error.' });
    }
});

module.exports = router;