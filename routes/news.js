const express  = require('express');
const multer   = require('multer');
const fs       = require('fs');
const path     = require('path');
const { queries } = require('../db/database');

const router = express.Router();

// Uploaded news images/videos live here and are served by server.js at
// /files/newsImages/...  On entry deletion (or image replacement) the
// file is removed too — see removeNewsImage() below.
// Lives at <repo-root>/images/newsImages — a plain folder on the backend's
// own filesystem, next to server.js/routes/db. This only works because
// it's on the backend side; it would NOT work if it pointed into the
// frontend project (see server.js for why).
const NEWS_IMG_DIR = path.join(__dirname, '..', 'images', 'newsImages');

function isValidKey(req) {
    const expectedKey = process.env.CMS_KEY || 'changeme-some-random-shared-secret';
    return req.get('CMS_KEY') === expectedKey;
}

function parseId(raw) {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m4v'];
function isVideoFilename(name) {
    return VIDEO_EXTENSIONS.includes(path.extname(String(name || '')).toLowerCase());
}

// Remove a news image file from uploads/newsImages. Names stored in the
// `news` table that were never uploaded here (seed defaults like
// "Sagittarius.webp") simply don't exist in this folder, so ENOENT is fine.
function removeNewsImage(filename) {
    if (!filename) return;
    const filePath = path.join(NEWS_IMG_DIR, path.basename(String(filename)));
    fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
            console.error('[news] Failed to delete image file:', err.message);
        }
    });
}

// Multer storage for the newsImages folder (drag & drop replacement).
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(NEWS_IMG_DIR)) fs.mkdirSync(NEWS_IMG_DIR, { recursive: true });
        cb(null, NEWS_IMG_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        // Keep a sanitized trace of the original name so files aren't fully
        // opaque on disk (e.g. "1755123456789-my-photo.jpg" instead of a
        // bare timestamp+random) — the timestamp+random prefix still keeps
        // every stored file unique even if two people drop "photo.jpg".
        const base = path.basename(file.originalname || 'upload', ext)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'upload';
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${base}${ext}`);
    },
});

// Images AND videos are accepted — the drag & drop zone on pepenews.astro
// (both the "Add a News Entry" form and the "Manage Existing Entries"
// replace-image panels) supports dropping either.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
const ALLOWED_MEDIA_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.ogg', '.ogv', '.mov'];

// Browsers (Windows drag & drop especially) frequently hand multer an empty
// or generic file.mimetype ('', 'application/octet-stream') for perfectly
// valid images/videos — the OS just didn't have a MIME association handy.
// Trusting mimetype alone silently rejected legitimate drops, which is why
// files sometimes appeared to "not upload" at all. Fall back to the file
// extension when the mimetype looks untrustworthy.
const fileFilter = (req, file, cb) => {
    if (ALLOWED_MEDIA_TYPES.includes(file.mimetype)) {
        return cb(null, true);
    }
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
        return cb(null, true);
    }
    cb(new Error('Only images (JPEG, PNG, GIF, WebP) or videos (MP4, WebM, OGG, MOV) are allowed'), false);
};

const newsUpload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max — videos need more headroom than images
});

// GET /api/news
// Returns all rows from the `news` table, most recent first.
// NOTE: this route did not exist before — without it there was no way
// for the frontend (cosmosnews.astro) to ever receive news data.
//TODO: delete this line router.get('/', (req, res) => {
router.get('/', async (req, res) => {
    try {
        //TODO: delete this line const news = queries.getAllNews.all();
        const { rows: news } = await queries.getAllNews();
        return res.status(200).json({ success: true, news });
    } catch (err) {
        console.error('[DB] getAllNews failed:', err);
        return res.status(500).json({ error: 'Database error.' });
    }
});

// POST /api/news
// Insert a new news entry. Requires the shared CMS_KEY header so the
// editor (pepenews.astro) can publish.
router.post('/', async (req, res) => {
    if (!isValidKey(req)) {
        return res.status(401).json({ error: 'Invalid or missing CMS key.' });
    }

    const { title, image, article } = req.body || {};
    if (!title || !String(title).trim()) {
        return res.status(400).json({ error: 'Title is required.' });
    }
    if (!article || !String(article).trim()) {
        return res.status(400).json({ error: 'Article is required.' });
    }

    try {
        const { rows } = await queries.insertNews(
            String(title).trim(),
            // NEVER pass null here — the `image` column is NOT NULL, and a
            // null insert throws, which used to get swallowed below as a
            // generic "Database error" while the entry silently failed to
            // save. Falling back to the seed default keeps the insert
            // valid and matches the "leave blank to use the default image"
            // behavior the editor UI advertises.
            image && String(image).trim() ? String(image).trim() : 'Sagittarius.webp',
            String(article).trim()
        );
        return res.status(201).json({ success: true, id: rows[0]?.id });
    } catch (err) {
        console.error('[DB] insertNews failed:', err);
        return res.status(500).json({ error: 'Database error.' });
    }
});

// POST /api/news/upload
// Upload an image or video BEFORE a news entry exists. The "Add a News
// Entry" form on pepenews.astro calls this the moment a file is dropped
// (or picked) on the #news-image field, then puts the returned filename
// into the field's value. That filename travels up with the rest of the
// form in POST /api/news below, so by the time the entry is inserted the
// file is already sitting in uploads/newsImages, served at
// /files/newsImages/<filename>.
router.post('/upload', newsUpload.single('image'), async (req, res) => {
    if (!isValidKey(req)) {
        return res.status(401).json({ error: 'Invalid or missing CMS key.' });
    }
    if (!req.file) {
        return res.status(400).json({ error: 'No file received.' });
    }

    const type = isVideoFilename(req.file.filename) || req.file.mimetype.startsWith('video/')
        ? 'video'
        : 'image';
    return res.json({ success: true, filename: req.file.filename, type });
});

// DELETE /api/news/upload/:filename
// Best-effort cleanup for a file uploaded via POST /api/news/upload that
// never ended up attached to a published entry (e.g. the editor dropped a
// file, then cleared it or navigated away before hitting "Publish Entry").
router.delete('/upload/:filename', (req, res) => {
    if (!isValidKey(req)) {
        return res.status(401).json({ error: 'Invalid or missing CMS key.' });
    }
    removeNewsImage(req.params.filename);
    return res.json({ success: true });
});

// DELETE /api/news/:id
// Delete a news entry and remove its image file from uploads/newsImages.
router.delete('/:id', async (req, res) => {
    if (!isValidKey(req)) {
        return res.status(401).json({ error: 'Invalid or missing CMS key.' });
    }

    const id = parseId(req.params.id);
    if (!id) {
        return res.status(400).json({ error: 'Invalid news id.' });
    }

    try {
        const { rows: [row] } = await queries.getNewsById(id);
        if (!row) {
            return res.status(404).json({ error: 'News entry not found.' });
        }
        await queries.deleteNews(id);
        removeNewsImage(row.image);
        return res.json({ success: true });
    } catch (err) {
        console.error('[DB] deleteNews failed:', err);
        return res.status(500).json({ error: 'Database error.' });
    }
});

// POST /api/news/:id/image
// Replace an entry's image via drag & drop upload. The file is saved to
// uploads/newsImages and served at /files/newsImages/<name>. The previous
// uploaded image is removed.
router.post('/:id/image', newsUpload.single('image'), async (req, res) => {
    if (!isValidKey(req)) {
        return res.status(401).json({ error: 'Invalid or missing CMS key.' });
    }
    if (!req.file) {
        return res.status(400).json({ error: 'No image file received.' });
    }

    const id = parseId(req.params.id);
    if (!id) {
        return res.status(400).json({ error: 'Invalid news id.' });
    }

    try {
        const { rows: [row] } = await queries.getNewsById(id);
        if (!row) {
            return res.status(404).json({ error: 'News entry not found.' });
        }
        await queries.updateNewsImage(id, req.file.filename);
        removeNewsImage(row.image);
        return res.json({ success: true, image: req.file.filename });
    } catch (err) {
        console.error('[DB] updateNewsImage failed:', err);
        return res.status(500).json({ error: 'Database error.' });
    }
});

// Error handler for Multer
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    res.status(400).json({ error: err.message });
});

module.exports = router;