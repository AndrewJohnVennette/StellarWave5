const express = require('express');
const { Resend } = require('resend');
const { queries } = require('../db/database');

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

function buildWelcomeEmail(firstName, lastName) {
  return `
    <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>Welcome to STELLARWAVE 5</title>
          <style>
              /* CSS Variables */
              :root {
                  --bg-space: #0a0a1a;
                  --bg-card: #12122a;
                  --bg-header: #1a1a3e;
                  --primary-accent: #4a4af4;
                  --text-main: #ffffff;
                  --text-muted: #a0a0cc;
                  --text-footer: #4a4a6a;
                  --border-color: #1e1e40;
                  --max-width: 600px;
                  --radius: 12px;
                  --font-main: 'Segoe UI', Arial, sans-serif;
              }

              /* Base Styles */
              body {
                  margin: 0;
                  padding: 40px 20px;
                  background-color: var(--bg-space);
                  font-family: var(--font-main);
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  min-height: 100vh;
              }

              /* Container Replacement for Tables */
              .email-card {
                  background-color: var(--bg-card);
                  max-width: var(--max-width);
                  width: 100%;
                  border-radius: var(--radius);
                  overflow: hidden;
                  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
                  display: flex;
                  flex-direction: column;
              }

              /* Header Section */
              .header {
                  background-color: var(--bg-header);
                  padding: 40px;
                  text-align: center;
              }

              .header-emoji {
                  font-size: 40px;
                  margin-bottom: 12px;
              }

              .header h1 {
                  color: var(--text-main);
                  font-size: 28px;
                  margin: 0;
                  letter-spacing: 2px;
                  text-transform: uppercase;
              }

              /* Content Section */
              .content {
                  padding: 40px;
                  text-align: center;
              }

              .content p {
                  color: var(--text-muted);
                  font-size: 16px;
                  line-height: 1.7;
                  margin: 0 0 20px;
              }

              .content strong {
                  color: var(--text-main);
              }

              /* Button Wrapper */
              .action-area {
                  margin-top: 32px;
              }

              .btn {
                  display: inline-block;
                  background-color: var(--primary-accent);
                  color: var(--text-main);
                  text-decoration: none;
                  padding: 14px 36px;
                  border-radius: 8px;
                  font-size: 15px;
                  font-weight: bold;
                  letter-spacing: 1px;
                  transition: opacity 0.2s ease;
              }

              .btn:hover {
                  opacity: 0.9;
              }

              /* Footer Section */
              .footer {
                  padding: 24px 40px;
                  border-top: 1px solid var(--border-color);
                  text-align: center;
              }

              .footer p {
                  color: var(--text-footer);
                  font-size: 13px;
                  margin: 0;
              }

              /* Responsive adjustments */
              @media (max-width: 480px) {
                  .header, .content {
                      padding: 30px 20px;
                  }
                  .header h1 {
                      font-size: 22px;
                  }
                  .btn {
                      width: 100%;
                      box-sizing: border-box;
                  }
              }
          </style>
      </head>
      <body>

          <main class="email-card">
              <header class="header">
                  <div class="header-emoji">✨</div>
                  <h1>Welcome to Stellarwave 5</h1>
              </header>

              <section class="content">
                  <p>
                      Hello <strong>${firstName} ${lastName}</strong>,
                  </p>
                  <p>
                      You have successfully registered. The universe is big — glad you made it aboard.
                  </p>
                  <p>
                      Explore our services, upload your files, and enjoy the journey.
                  </p>
                  
                  <div class="action-area">
                      <a href="http://localhost:4321/services" class="btn">
                          Explore Services
                      </a>
                  </div>
              </section>

              <footer class="footer">
                  <p>You received this email because you registered at MySite.</p>
              </footer>
          </main>

      </body>
    </html>

  `;
}

router.post('/', async (req, res) => {
  const { firstName, lastName, email } = req.body;

  // if (!firstName || !lastName || !email) {
  //   return res.status(400).json({ error: 'All fields are required.' });
  // }

  // const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // if (!emailRegex.test(email)) {
  //   return res.status(400).json({ error: 'Invalid email address.' });
  // }

  const existing = queries.emailExists.get(email);
  if (existing) {
    return res.status(409).json({ error: 'This email is already registered.' });
  }

  try {
    queries.insertRegistration.run(firstName, lastName, email);
    // console.log("Im here!!")
  } catch (err) {
    console.log("DB bad")
    console.error('[DB] Insert failed:', err.message);
    return res.status(500).json({ error: 'Database error. Please try again.' });
  }

  res.json({
    success: true,
    message: `Welcome aboard, ${firstName}! Check your inbox for a confirmation email.`,
  });

  resend.emails.send({
    from: `${process.env.EMAIL_FROM}`,
    //to: email,
    to:`${process.env.EMAIL_TO}`,
    subject: 'Welcome to STELLARWAVE 5',
    // html: '<p>Congrats on sending your <strong>first email</strong>!</p>'
    html: buildWelcomeEmail(firstName, lastName)
    // text: `Hello ${firstName} ${lastName}, welcome to STELLARWAVE5!`,
  })
    .then(data => console.log('[Resend] Email sent:', data.id))
    .catch(err => console.error('[Resend] Send failed:', err.message));
});

module.exports = router;