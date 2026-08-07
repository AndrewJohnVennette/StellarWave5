# Adding Nodemailer + Registration Page
### Astro + Node.js Project — Full Addition Guide

---

## What This Adds

- A new `register.astro` page with First Name, Last Name, and Email fields
- Auto-detect: the submit button activates only when all 3 fields are filled; the form auto-submits
- A new Express route `/api/register` that saves to DB and sends a welcome email
- A new `registrations` table in SQLite
- Nodemailer configured for Gmail (or any SMTP provider)
- A styled HTML welcome email titled "Welcome to Space"

---

## Part 1: CLI Commands

### 1.1 — Install Nodemailer (run from root, where server.js lives)

```bash
npm install nodemailer
```

That is the only new package needed. Nodemailer has no peer dependencies.

### 1.2 — All commands at a glance

```bash
# From the project root (my-site/)
npm install nodemailer

# No changes needed in the /frontend directory
```

---

## Part 2: Files to Create or Modify

```
my-site/
├── .env                          ← MODIFY: add email credentials
├── db/
│   └── database.js               ← MODIFY: add registrations table + query
├── routes/
│   ├── upload.js                 (unchanged)
│   ├── stripe.js                 (unchanged)
│   └── register.js               ← CREATE NEW
├── server.js                     ← MODIFY: mount new route
└── frontend/
    └── src/
        ├── pages/
        │   ├── index.astro       ← MODIFY: add nav link
        │   ├── services.astro    (unchanged)
        │   ├── upload.astro      (unchanged)
        │   └── register.astro    ← CREATE NEW
        └── layouts/
            └── Layout.astro      ← MODIFY: add nav link
```

---

## Part 3: Step-by-Step Implementation

### Step 1 — Add Email Credentials to `.env`

Open your existing `.env` file and add these four lines:

```env
EMAIL_USER=your-gmail-address@gmail.com
EMAIL_PASS=your-app-password-here
EMAIL_FROM=your-gmail-address@gmail.com
EMAIL_HOST=smtp.gmail.com
```

**Important — Gmail requires an App Password, not your regular password:**

1. Go to your Google Account → Security
2. Enable 2-Step Verification if not already on
3. Search for "App passwords" in the Google Account search bar
4. Create a new app password, name it anything (e.g. "MySite Mailer")
5. Copy the 16-character password into `EMAIL_PASS`

If you use a different provider, swap the values:
- Outlook/Hotmail: `EMAIL_HOST=smtp-mail.outlook.com`, port 587
- Yahoo: `EMAIL_HOST=smtp.mail.yahoo.com`, port 465
- SendGrid: `EMAIL_HOST=smtp.sendgrid.net`, user = `apikey`, pass = your API key

---

### Step 2 — Update `db/database.js`

Add the `registrations` table and its query helpers. Find the `db.exec(...)` block and add the new table, then add the new queries:

```javascript
// In db/database.js — add inside the db.exec(`...`) template literal:

  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name  TEXT NOT NULL,
    email      TEXT NOT NULL,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
```

Then add to the `queries` object:

```javascript
// Add these two lines to the queries object in db/database.js:
insertRegistration: db.prepare(
  'INSERT INTO registrations (first_name, last_name, email) VALUES (?, ?, ?)'
),
emailExists: db.prepare(
  'SELECT id FROM registrations WHERE email = ?'
),
```

The complete updated `db/database.js`:

```javascript
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'site.db'));

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

  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name  TEXT NOT NULL,
    email      TEXT NOT NULL,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

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
  insertRegistration: db.prepare(
    'INSERT INTO registrations (first_name, last_name, email) VALUES (?, ?, ?)'
  ),
  emailExists: db.prepare(
    'SELECT id FROM registrations WHERE email = ?'
  ),
};

module.exports = { db, queries };
```

---

### Step 3 — Create `routes/register.js`

Create this file from scratch:

```javascript
const express = require('express');
const nodemailer = require('nodemailer');
const { queries } = require('../db/database');

const router = express.Router();

// ── Nodemailer transporter ──────────────────────────────────
// Created once when the module loads (not on every request)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: 465,
  secure: true,              // true for port 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify the connection on startup — logs a clear error if credentials are wrong
transporter.verify((error) => {
  if (error) {
    console.error('[Nodemailer] Connection failed:', error.message);
  } else {
    console.log('[Nodemailer] SMTP connection ready');
  }
});

// ── Welcome email HTML ──────────────────────────────────────
function buildWelcomeEmail(firstName, lastName) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Welcome to Space</title>
</head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
          style="background:#12122a;border-radius:12px;overflow:hidden;max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:#1a1a3e;padding:40px;text-align:center;">
              <div style="font-size:40px;margin-bottom:12px;">&#10024;</div>
              <h1 style="color:#ffffff;font-size:28px;margin:0;letter-spacing:2px;">
                WELCOME TO SPACE
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#a0a0cc;font-size:16px;line-height:1.7;margin:0 0 20px;">
                Hello <strong style="color:#ffffff;">${firstName} ${lastName}</strong>,
              </p>
              <p style="color:#a0a0cc;font-size:16px;line-height:1.7;margin:0 0 20px;">
                You have successfully registered. The universe is big — glad you made it aboard.
              </p>
              <p style="color:#a0a0cc;font-size:16px;line-height:1.7;margin:0 0 32px;">
                Explore our services, upload your files, and enjoy the journey.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="http://localhost:4321/services"
                      style="display:inline-block;background:#4a4af4;color:#ffffff;
                             text-decoration:none;padding:14px 36px;border-radius:8px;
                             font-size:15px;font-weight:bold;letter-spacing:1px;">
                      Explore Services
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #1e1e40;text-align:center;">
              <p style="color:#4a4a6a;font-size:13px;margin:0;">
                You received this email because you registered at MySite.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// ── POST /api/register ──────────────────────────────────────
router.post('/', async (req, res) => {
  const { firstName, lastName, email } = req.body;

  // Basic validation
  if (!firstName || !lastName || !email) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  // Check for duplicate email
  const existing = queries.emailExists.get(email);
  if (existing) {
    return res.status(409).json({ error: 'This email is already registered.' });
  }

  // Save to DB
  try {
    queries.insertRegistration.run(firstName, lastName, email);
  } catch (err) {
    console.error('[DB] Insert failed:', err.message);
    return res.status(500).json({ error: 'Database error. Please try again.' });
  }

  // Send welcome email (non-blocking — we respond to the user first)
  const mailOptions = {
    from: `"MySite" <${process.env.EMAIL_FROM}>`,
    to: email,
    subject: 'Welcome to Space',
    html: buildWelcomeEmail(firstName, lastName),
    // Plain-text fallback for email clients that don't render HTML
    text: `Hello ${firstName} ${lastName}, welcome to Space! You have successfully registered.`,
  };

  // Fire-and-forget: respond 200 immediately, email sends in background
  res.json({
    success: true,
    message: `Welcome aboard, ${firstName}! Check your inbox for a confirmation email.`,
  });

  // Send email after responding
  transporter.sendMail(mailOptions)
    .then(info => console.log('[Nodemailer] Email sent:', info.messageId))
    .catch(err => console.error('[Nodemailer] Send failed:', err.message));
});

module.exports = router;
```

**Why fire-and-forget?** Sending email can take 1–3 seconds. Responding to the user first (`res.json(...)` before `sendMail`) means the page updates instantly. The email still goes out — it just doesn't block the HTTP response.

---

### Step 4 — Update `server.js`

Add two lines: require the new route, and mount it.

```javascript
// Add this near the top with the other requires:
const registerRoute = require('./routes/register');

// Add this with the other app.use() route mounts:
app.use('/api/register', registerRoute);
```

The complete updated routes section of `server.js`:

```javascript
// ── Routes ─────────────────────────────────────────────────
app.use('/api/upload',   uploadRoute);
app.use('/api/checkout', stripeRoute);
app.use('/api/register', registerRoute);   // ← new line

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});
```

---

### Step 5 — Update `frontend/src/layouts/Layout.astro`

Add the Register link to the nav:

```astro
<!-- Find the nav block and add the new link: -->
<nav>
  <a href="/">Home</a>
  <a href="/services">Services</a>
  <a href="/upload">Upload</a>
  <a href="/register">Register</a>   <!-- ← add this line -->
</nav>
```

---

### Step 6 — Create `frontend/src/pages/register.astro`

Create this file from scratch:

```astro
---
import Layout from '../layouts/Layout.astro';
---
<Layout title="Register">
  <h1>Create Your Account</h1>
  <p style="color: #666; margin: 0.5rem 0 2rem;">
    Fill in all three fields and we'll do the rest.
  </p>

  <!-- Registration form -->
  <div id="form-container" style="
    background: white; border: 1px solid #e0e0e0;
    border-radius: 16px; padding: 2rem; max-width: 480px;
  ">
    <div style="display: flex; flex-direction: column; gap: 1.25rem;">

      <!-- First Name -->
      <div>
        <label for="firstName" style="
          display: block; font-weight: 600;
          font-size: 0.85rem; margin-bottom: 0.4rem; color: #444;
        ">First name</label>
        <input
          id="firstName"
          type="text"
          placeholder="e.g. Neil"
          autocomplete="given-name"
          style="
            width: 100%; padding: 0.75rem 1rem;
            border: 1.5px solid #ddd; border-radius: 8px;
            font-size: 1rem; outline: none; transition: border-color 0.2s;
          "
        />
      </div>

      <!-- Last Name -->
      <div>
        <label for="lastName" style="
          display: block; font-weight: 600;
          font-size: 0.85rem; margin-bottom: 0.4rem; color: #444;
        ">Last name</label>
        <input
          id="lastName"
          type="text"
          placeholder="e.g. Armstrong"
          autocomplete="family-name"
          style="
            width: 100%; padding: 0.75rem 1rem;
            border: 1.5px solid #ddd; border-radius: 8px;
            font-size: 1rem; outline: none; transition: border-color 0.2s;
          "
        />
      </div>

      <!-- Email -->
      <div>
        <label for="email" style="
          display: block; font-weight: 600;
          font-size: 0.85rem; margin-bottom: 0.4rem; color: #444;
        ">Email address</label>
        <input
          id="email"
          type="email"
          placeholder="e.g. neil@nasa.gov"
          autocomplete="email"
          style="
            width: 100%; padding: 0.75rem 1rem;
            border: 1.5px solid #ddd; border-radius: 8px;
            font-size: 1rem; outline: none; transition: border-color 0.2s;
          "
        />
      </div>

      <!-- Status indicator: shown when fields are partially filled -->
      <div id="status-row" style="
        display: flex; gap: 0.5rem; align-items: center;
        font-size: 0.85rem; color: #888; min-height: 1.2rem;
      ">
        <span id="status-dot" style="
          width: 8px; height: 8px; border-radius: 50%;
          background: #ddd; flex-shrink: 0; transition: background 0.2s;
        "></span>
        <span id="status-text">Enter your details above</span>
      </div>

      <!-- Submit button — disabled until all fields filled -->
      <button
        id="submit-btn"
        disabled
        style="
          width: 100%; padding: 0.85rem;
          background: #ccc; color: white;
          border: none; border-radius: 10px;
          font-size: 1rem; font-weight: 600; cursor: not-allowed;
          transition: background 0.25s, transform 0.1s;
        "
      >
        Complete registration
      </button>
    </div>
  </div>

  <!-- Success state (hidden until registration completes) -->
  <div id="success-container" style="display: none; max-width: 480px;">
    <div style="
      background: #f0fdf4; border: 1.5px solid #86efac;
      border-radius: 16px; padding: 2.5rem; text-align: center;
    ">
      <div style="font-size: 3rem; margin-bottom: 1rem;">&#10024;</div>
      <h2 style="color: #166534; margin-bottom: 0.75rem;">You're registered!</h2>
      <p id="success-message" style="color: #15803d; margin-bottom: 1.5rem;"></p>
      <p style="color: #4a7c59; font-size: 0.9rem;">
        A welcome email has been sent to <strong id="success-email"></strong>.
        Check your inbox (and spam folder, just in case).
      </p>
    </div>
  </div>

  <script>
    const firstNameEl = document.getElementById('firstName');
    const lastNameEl  = document.getElementById('lastName');
    const emailEl     = document.getElementById('email');
    const submitBtn   = document.getElementById('submit-btn');
    const statusDot   = document.getElementById('status-dot');
    const statusText  = document.getElementById('status-text');

    // ── Auto-detect: watch all three fields ──────────────────
    function getFilledCount() {
      return [firstNameEl, lastNameEl, emailEl]
        .filter(el => el.value.trim().length > 0).length;
    }

    function isEmailValid(v) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }

    function updateState() {
      const filled = getFilledCount();
      const allFilled = filled === 3;
      const emailOk = isEmailValid(emailEl.value.trim());
      const ready = allFilled && emailOk;

      // Update status indicator
      if (filled === 0) {
        statusDot.style.background = '#ddd';
        statusText.textContent = 'Enter your details above';
      } else if (filled < 3) {
        statusDot.style.background = '#f59e0b';
        statusText.textContent = `${3 - filled} field${3 - filled > 1 ? 's' : ''} remaining`;
      } else if (!emailOk) {
        statusDot.style.background = '#f59e0b';
        statusText.textContent = 'Enter a valid email address';
      } else {
        statusDot.style.background = '#22c55e';
        statusText.textContent = 'Ready to register!';
      }

      // Enable/disable button
      submitBtn.disabled = !ready;
      submitBtn.style.background = ready ? '#1a1a2e' : '#ccc';
      submitBtn.style.cursor = ready ? 'pointer' : 'not-allowed';
    }

    // Attach listeners to all three fields
    [firstNameEl, lastNameEl, emailEl].forEach(el => {
      el.addEventListener('input', updateState);
      // Highlight field border on focus
      el.addEventListener('focus', () => { el.style.borderColor = '#7b8cde'; });
      el.addEventListener('blur',  () => { el.style.borderColor = '#ddd'; });
    });

    // ── Submit handler ────────────────────────────────────────
    submitBtn.addEventListener('click', async () => {
      const firstName = firstNameEl.value.trim();
      const lastName  = lastNameEl.value.trim();
      const email     = emailEl.value.trim();

      submitBtn.textContent = 'Registering...';
      submitBtn.disabled = true;

      try {
        const res = await fetch('http://localhost:3000/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName, lastName, email }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          // Show success state, hide form
          document.getElementById('form-container').style.display = 'none';
          document.getElementById('success-container').style.display = 'block';
          document.getElementById('success-message').textContent = data.message;
          document.getElementById('success-email').textContent = email;
        } else {
          // Show inline error
          statusDot.style.background = '#ef4444';
          statusText.textContent = data.error || 'Something went wrong. Try again.';
          submitBtn.textContent = 'Complete registration';
          submitBtn.disabled = false;
          submitBtn.style.background = '#1a1a2e';
        }
      } catch (err) {
        statusDot.style.background = '#ef4444';
        statusText.textContent = 'Network error — is the server running?';
        submitBtn.textContent = 'Complete registration';
        submitBtn.disabled = false;
        submitBtn.style.background = '#1a1a2e';
      }
    });
  </script>
</Layout>
```

---

## Part 4: How the Auto-Detect Works

The `updateState()` function runs on every `input` event across all three fields. It:

1. Counts how many fields have content (`getFilledCount()`)
2. Validates the email format with a regex
3. Updates the status dot color: gray → amber → green
4. Enables the submit button only when all 3 are filled AND the email is valid

There is no timeout or debounce needed — `input` fires on every keystroke, so the state is always in sync. The submit button stays disabled (and visually grayed out) until the green state is reached.

---

## Part 5: Testing

### Verify the SMTP connection
Start your server and look for this in the console:
```
[Nodemailer] SMTP connection ready
```
If you see a connection error instead, double-check your `EMAIL_PASS` (App Password, not your Gmail login password) and that 2-Step Verification is enabled on your Google account.

### Test the registration flow
1. Start the Node backend: `npm run dev` (from root)
2. Start Astro: `npm run dev` (from `/frontend`)
3. Go to `http://localhost:4321/register`
4. Type in the three fields — watch the status dot change
5. Click the button — form should swap to the success state
6. Check the email inbox of the address you entered

### Test duplicate prevention
Try registering the same email twice — you should get the "already registered" error message inline without leaving the page.

---

## Part 6: Using a Different Email Provider

If you don't want to use Gmail, here are the `createTransport` configs for common providers:

**Outlook / Hotmail:**
```javascript
nodemailer.createTransport({
  host: 'smtp-mail.outlook.com',
  port: 587,
  secure: false,        // STARTTLS
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});
```

**SendGrid (recommended for production):**
```javascript
nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  secure: false,
  auth: {
    user: 'apikey',     // literally the string "apikey"
    pass: process.env.EMAIL_PASS,  // your SendGrid API key
  },
});
```

**Ethereal (fake inbox for local testing — no real emails sent):**
```javascript
// Generate a test account automatically — great for development
const testAccount = await nodemailer.createTestAccount();
const transporter = nodemailer.createTransport({
  host: 'smtp.ethereal.email',
  port: 587,
  auth: { user: testAccount.user, pass: testAccount.pass },
});
// After sendMail, use: nodemailer.getTestMessageUrl(info)
// to get a preview URL — view the email in the browser without a real inbox
```

Ethereal is especially useful during development: no real email is ever sent, and you get a preview URL in the console to inspect the rendered HTML.

---

## Part 7: Production Notes

- Replace `http://localhost:4321` inside the email HTML with your real domain before deploying.
- For high-volume sending (thousands of emails), switch from Gmail SMTP to a transactional email service like SendGrid, Postmark, or Resend — they provide delivery tracking, bounce handling, and much higher rate limits.
- Add rate limiting to the `/api/register` route with `express-rate-limit` (`npm install express-rate-limit`) to prevent spam registrations.
- Consider adding an email verification step (send a token, user clicks a link) before fully activating the account.
