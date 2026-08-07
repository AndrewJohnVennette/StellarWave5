# Astro + Node.js Full-Stack Website Guide
### DB · Stripe · File Uploads — Complete Setup

---

## Overview

This guide covers a 3-page website:
- **Page 1 — Home** (`/`): Landing page with navigation
- **Page 2 — Services** (`/services`): Lists services with a Stripe payment button
- **Page 3 — Upload** (`/upload`): File upload form

**Stack:** Astro (frontend SSR) + Node.js/Express (backend API) + SQLite (DB) + Stripe + Multer (uploads)

---

## Part 1: CLI Commands Reference

### 1.1 — Project Initialization

```bash
# Create the Node.js backend
mkdir my-site && cd my-site
npm init -y

# Create the Astro frontend
npm create astro@latest frontend
# When prompted:
#  - Template: Empty
#  - TypeScript: No (or Yes if preferred)
#  - Install dependencies: Yes
```

### 1.2 — Backend Dependencies

```bash
# Core backend
npm install express

# Database
npm install better-sqlite3

# Stripe
npm install stripe

# File uploads
npm install multer

# Sessions & security
npm install express-session
npm install cors
npm install dotenv

# Dev tools
npm install --save-dev nodemon
```

### 1.3 — Frontend (Astro) Dependencies

```bash
cd frontend

# Astro Node.js adapter (for SSR)
npx astro add node

# Optional: Tailwind CSS for styling
npx astro add tailwind
```

### 1.4 — All CLI Commands at a Glance

```bash
# Root directory
npm init -y
npm install express better-sqlite3 stripe multer express-session cors dotenv
npm install --save-dev nodemon

# Frontend directory
cd frontend
npm create astro@latest .
npx astro add node
npx astro add tailwind   # optional

# Run backend (from root)
npx nodemon server.js

# Run Astro frontend (from /frontend)
npm run dev
```

---

## Part 2: Project Structure

```
my-site/
├── server.js               ← Express server (entry point)
├── .env                    ← Environment variables (never commit!)
├── package.json
├── db/
│   └── database.js         ← SQLite setup & queries
├── routes/
│   ├── upload.js           ← File upload route
│   └── stripe.js           ← Stripe checkout route
├── uploads/                ← Uploaded files land here
└── frontend/               ← Astro project
    ├── astro.config.mjs
    ├── src/
    │   ├── pages/
    │   │   ├── index.astro         ← Page 1: Home
    │   │   ├── services.astro      ← Page 2: Services + Stripe
    │   │   └── upload.astro        ← Page 3: File Upload
    │   └── layouts/
    │       └── Layout.astro        ← Shared layout
    └── public/
```

---

## Part 3: Step-by-Step Implementation

### Step 1 — Environment Variables

Create a `.env` file in the root. **Never commit this file.**

```env
PORT=3000
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
SESSION_SECRET=a-long-random-string-change-this
```

Get your Stripe keys from: https://dashboard.stripe.com/test/apikeys

---

### Step 2 — Database Setup (`db/database.js`)

```javascript
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'site.db'));

// Create tables on first run
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
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
`);

// Reusable query helpers
const queries = {
  insertUser: db.prepare('INSERT INTO users (name, email) VALUES (?, ?)'),
  getUser: db.prepare('SELECT * FROM users WHERE email = ?'),
  insertOrder: db.prepare(
    'INSERT INTO orders (user_email, service, amount, stripe_session_id) VALUES (?, ?, ?, ?)'
  ),
  insertUpload: db.prepare(
    'INSERT INTO uploads (original_name, stored_name, size) VALUES (?, ?, ?)'
  ),
  getAllUploads: db.prepare('SELECT * FROM uploads ORDER BY uploaded_at DESC'),
};

module.exports = { db, queries };
```

**What this does:** Creates 3 tables (users, orders, uploads) automatically on first run. `better-sqlite3` is synchronous — no async/await needed for DB queries.

---

### Step 3 — File Upload Route (`routes/upload.js`)

```javascript
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { queries } = require('../db/database');

const router = express.Router();

// Configure where and how files are stored
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    // Create the uploads folder if it doesn't exist
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Unique filename: timestamp + original extension
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

// File filter: only allow images and PDFs
const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images (JPEG, PNG, GIF) and PDFs are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// POST /api/upload
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Save upload record to DB
  queries.insertUpload.run(
    req.file.originalname,
    req.file.filename,
    req.file.size
  );

  res.json({
    success: true,
    message: 'File uploaded successfully',
    file: {
      name: req.file.originalname,
      size: req.file.size,
      stored: req.file.filename,
    },
  });
});

// Error handler for Multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  res.status(400).json({ error: err.message });
});

module.exports = router;
```

---

### Step 4 — Stripe Route (`routes/stripe.js`)

```javascript
const express = require('express');
const Stripe = require('stripe');
const { queries } = require('../db/database');

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/checkout — create a Stripe Checkout session
router.post('/checkout', async (req, res) => {
  const { service, price, email } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: service },
            unit_amount: price, // in cents (e.g., 5000 = $50.00)
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `http://localhost:3000/services?success=true`,
      cancel_url: `http://localhost:3000/services?cancelled=true`,
    });

    // Save order to DB with status "pending"
    queries.insertOrder.run(email, service, price, session.id);

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/checkout/webhook — Stripe calls this after payment
// IMPORTANT: This route needs raw body (before express.json parses it)
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      // Update order status in DB to "paid"
      const { db } = require('../db/database');
      db.prepare(
        "UPDATE orders SET status = 'paid' WHERE stripe_session_id = ?"
      ).run(session.id);
    }

    res.json({ received: true });
  }
);

module.exports = router;
```

---

### Step 5 — Main Server (`server.js`)

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');

const uploadRoute = require('./routes/upload');
const stripeRoute = require('./routes/stripe');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:4321' })); // Astro dev port

// IMPORTANT: Webhook route must come BEFORE express.json()
// because Stripe webhooks need the raw body
app.use('/api/checkout/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // set to true in production with HTTPS
  })
);

// Serve uploaded files as static assets
app.use('/files', express.static(path.join(__dirname, 'uploads')));

// ── Routes ─────────────────────────────────────────────────
app.use('/api/upload', uploadRoute);
app.use('/api/checkout', stripeRoute);

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
```

Add this to `package.json`:

```json
"scripts": {
  "start": "node server.js",
  "dev": "nodemon server.js"
}
```

---

### Step 6 — Astro Configuration (`frontend/astro.config.mjs`)

```javascript
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',            // Enable SSR mode
  adapter: node({
    mode: 'standalone',
  }),
});
```

---

### Step 7 — Shared Layout (`frontend/src/layouts/Layout.astro`)

```astro
---
const { title } = Astro.props;
---
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title} — MySite</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: system-ui, sans-serif; background: #f9f9f9; color: #1a1a1a; }
      nav { background: #1a1a2e; padding: 1rem 2rem; display: flex; gap: 2rem; align-items: center; }
      nav a { color: #eee; text-decoration: none; font-weight: 500; }
      nav a:hover { color: #7b8cde; }
      main { max-width: 900px; margin: 2rem auto; padding: 0 1.5rem; }
      h1 { font-size: 2rem; margin-bottom: 1rem; }
    </style>
  </head>
  <body>
    <nav>
      <a href="/">Home</a>
      <a href="/services">Services</a>
      <a href="/upload">Upload</a>
    </nav>
    <main>
      <slot />
    </main>
  </body>
</html>
```

---

### Step 8 — Page 1: Home (`frontend/src/pages/index.astro`)

```astro
---
import Layout from '../layouts/Layout.astro';
---
<Layout title="Home">
  <h1>Welcome to MySite</h1>
  <p style="margin: 1rem 0; color: #555;">
    A full-stack site with database, payments, and file uploads.
  </p>
  <div style="display: flex; gap: 1rem; margin-top: 2rem;">
    <a href="/services" style="
      background: #7b8cde; color: white; padding: 0.75rem 1.5rem;
      border-radius: 8px; text-decoration: none; font-weight: 600;
    ">View Services</a>
    <a href="/upload" style="
      background: #2ecc71; color: white; padding: 0.75rem 1.5rem;
      border-radius: 8px; text-decoration: none; font-weight: 600;
    ">Upload a File</a>
  </div>
</Layout>
```

---

### Step 9 — Page 2: Services + Stripe (`frontend/src/pages/services.astro`)

```astro
---
import Layout from '../layouts/Layout.astro';

const services = [
  { name: 'Basic Plan',    price: 2900,  description: 'Perfect for individuals' },
  { name: 'Pro Plan',      price: 7900,  description: 'Great for small teams' },
  { name: 'Enterprise',    price: 19900, description: 'Unlimited everything' },
];

const success   = Astro.url.searchParams.get('success');
const cancelled = Astro.url.searchParams.get('cancelled');
---
<Layout title="Services">
  <h1>Our Services</h1>

  {success   && <p style="color:green; margin:1rem 0">✓ Payment successful! Thank you.</p>}
  {cancelled && <p style="color:red;   margin:1rem 0">✗ Payment cancelled.</p>}

  <div style="display: grid; gap: 1.5rem; margin-top: 1.5rem;">
    {services.map(svc => (
      <div style="
        background: white; border: 1px solid #ddd;
        border-radius: 12px; padding: 1.5rem;
        display: flex; justify-content: space-between; align-items: center;
      ">
        <div>
          <h2 style="font-size: 1.2rem;">{svc.name}</h2>
          <p style="color: #666; margin-top: 0.25rem;">{svc.description}</p>
          <p style="font-size: 1.4rem; font-weight: 700; margin-top: 0.5rem;">
            ${(svc.price / 100).toFixed(2)}
          </p>
        </div>
        <button
          class="pay-btn"
          data-service={svc.name}
          data-price={svc.price}
          style="
            background: #635bff; color: white;
            border: none; padding: 0.75rem 1.5rem;
            border-radius: 8px; cursor: pointer; font-weight: 600;
          "
        >
          Pay with Stripe
        </button>
      </div>
    ))}
  </div>

  <script>
    document.querySelectorAll('.pay-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const service = btn.dataset.service;
        const price   = btn.dataset.price;
        const email   = prompt('Enter your email to continue:');
        if (!email) return;

        btn.textContent = 'Redirecting...';
        btn.disabled = true;

        const res  = await fetch('http://localhost:3000/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service, price: Number(price), email }),
        });
        const data = await res.json();

        if (data.url) {
          window.location.href = data.url;
        } else {
          alert('Error: ' + data.error);
          btn.textContent = 'Pay with Stripe';
          btn.disabled = false;
        }
      });
    });
  </script>
</Layout>
```

---

### Step 10 — Page 3: Upload (`frontend/src/pages/upload.astro`)

```astro
---
import Layout from '../layouts/Layout.astro';
---
<Layout title="Upload">
  <h1>Upload a File</h1>
  <p style="color: #666; margin: 0.5rem 0 1.5rem;">
    Accepted: JPEG, PNG, GIF, PDF — max 10 MB
  </p>

  <div id="upload-box" style="
    border: 2px dashed #ccc; border-radius: 12px;
    padding: 3rem; text-align: center; background: white;
  ">
    <input type="file" id="file-input" accept=".jpg,.jpeg,.png,.gif,.pdf"
      style="display: none;" />
    <label for="file-input" style="cursor: pointer; color: #7b8cde; font-weight: 600;">
      Click to choose a file
    </label>
    <p id="file-name" style="margin-top: 0.75rem; color: #888; font-size: 0.9rem;"></p>
  </div>

  <button id="upload-btn" style="
    margin-top: 1.5rem; background: #2ecc71; color: white;
    border: none; padding: 0.75rem 2rem;
    border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 1rem;
    display: none;
  ">
    Upload
  </button>

  <div id="progress" style="display:none; margin-top:1rem;">
    <progress id="progress-bar" value="0" max="100" style="width:100%;"></progress>
  </div>

  <div id="result" style="margin-top: 1.5rem;"></div>

  <script>
    const input   = document.getElementById('file-input');
    const nameEl  = document.getElementById('file-name');
    const btn     = document.getElementById('upload-btn');
    const result  = document.getElementById('result');
    const progress = document.getElementById('progress');
    const bar     = document.getElementById('progress-bar');

    input.addEventListener('change', () => {
      const file = input.files[0];
      if (file) {
        nameEl.textContent = `Selected: ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
        btn.style.display = 'block';
      }
    });

    btn.addEventListener('click', async () => {
      const file = input.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);

      btn.disabled    = true;
      btn.textContent = 'Uploading...';
      progress.style.display = 'block';

      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'http://localhost:3000/api/upload');

      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) bar.value = (e.loaded / e.total) * 100;
      });

      xhr.addEventListener('load', () => {
        const data = JSON.parse(xhr.responseText);
        if (data.success) {
          result.innerHTML = `
            <div style="
              background:#e8f5e9; border:1px solid #81c784;
              border-radius:8px; padding:1rem; color:#2e7d32;
            ">
              ✓ <strong>${data.file.name}</strong> uploaded successfully!
            </div>`;
        } else {
          result.innerHTML = `
            <div style="
              background:#ffebee; border:1px solid #e57373;
              border-radius:8px; padding:1rem; color:#c62828;
            ">
              ✗ Error: ${data.error}
            </div>`;
        }
        btn.disabled    = false;
        btn.textContent = 'Upload';
        btn.style.display = 'none';
        nameEl.textContent = '';
        input.value = '';
        progress.style.display = 'none';
        bar.value = 0;
      });

      xhr.send(formData);
    });
  </script>
</Layout>
```

---

## Part 4: Running the Project

### Terminal 1 — Backend

```bash
# From the root directory
npm run dev
# Server starts at http://localhost:3000
```

### Terminal 2 — Frontend

```bash
# From the /frontend directory
npm run dev
# Astro starts at http://localhost:4321
```

Visit http://localhost:4321 to see the site.

---

## Part 5: Testing Stripe Payments

Use Stripe's test card numbers — no real money charged:

| Card number         | Result           |
|---------------------|------------------|
| `4242 4242 4242 4242` | Payment succeeds |
| `4000 0000 0000 9995` | Payment declined |

Use any future expiry date, any 3-digit CVC, and any ZIP code.

---

## Part 6: Production Checklist

Before deploying to production, make these changes:

1. **HTTPS** — get an SSL certificate (Let's Encrypt is free). Set `cookie.secure: true` in session config.
2. **Stripe keys** — switch from `sk_test_...` to `sk_live_...` in your `.env`.
3. **Webhook** — register your production URL in the Stripe dashboard under Webhooks.
4. **CORS** — change the `origin` in `server.js` to your actual domain.
5. **File storage** — for scalable uploads, replace local disk with AWS S3 or Cloudflare R2 (use the `multer-s3` npm package).
6. **Database** — for high traffic, migrate from SQLite to PostgreSQL using the `pg` npm package.
7. **Environment** — never commit `.env`. Use environment variable injection from your hosting provider (Railway, Render, Vercel, etc.).

---

## Part 7: Quick Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| CORS error in browser | Origin mismatch | Check CORS origin in `server.js` matches Astro port |
| Stripe webhook 400 | Body already parsed | Ensure webhook route is BEFORE `express.json()` middleware |
| Upload fails silently | `/uploads` folder missing | The route auto-creates it, but check file permissions |
| SQLite permission error | File locked | Only one process should access the `.db` file at a time |
| Astro build error | SSR not configured | Ensure `output: 'server'` and `@astrojs/node` adapter are in `astro.config.mjs` |
