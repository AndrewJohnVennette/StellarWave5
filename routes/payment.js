// routes/payment.js
// ─────────────────────────────────────────────────────────────────────────────
// Two endpoints that power the PaymentMethod card form:
//
//   POST /api/payment/create-intent
//     Body : { email, amount, description }
//     Returns: { clientSecret }   ← the PaymentIntent client secret
//     The front-end passes this to stripe.confirmCardPayment().
//
//   POST /api/payment/confirm
//     Body : { paymentIntentId }
//     Retrieves the PaymentIntent from Stripe to verify its final status,
//     updates the orders row in the DB, and returns { success, status }.
//
// Why PaymentIntents instead of Checkout Sessions?
//   The UI has its own card fields, so we charge the card directly instead of
//   redirecting the user to Stripe's hosted Checkout page.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const express        = require('express');
const Stripe         = require('stripe');
const { db, queries } = require('../db/database');

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);   // sk_test_…

// ── POST /api/payment/create-intent ──────────────────────────────────────────
// Creates a PaymentIntent and returns its client secret to the browser.
// The browser then calls stripe.confirmCardPayment(clientSecret, cardElement).
router.post('/create-intent', async (req, res) => {
    const { email = '', amount = 5000, description = 'Stellarwave Mission' } = req.body;

    // amount must be a positive integer (cents)
    const cents = Math.round(Number(amount));
    if (!Number.isFinite(cents) || cents < 50) {
        return res.status(400).json({ error: 'Invalid amount. Must be at least 50 cents.' });
    }

    try {
        const intent = await stripe.paymentIntents.create({
            amount,
            currency: 'usd',
            description,
            receipt_email: email || undefined,
            // automatic_payment_methods covers cards + future methods
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
            metadata: { email },
        });

        // Record the order as "pending" in the DB
        try {
            queries.insertOrder.run(email, description, cents, intent.id);
        } catch (dbErr) {
            // Non-fatal — log but don't block the payment
            console.error('[DB] insertOrder failed:', dbErr.message);
        }

        return res.json({ clientSecret: intent.client_secret });

    } catch (err) {
        console.error('[Stripe] create-intent error:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ── POST /api/payment/confirm ─────────────────────────────────────────────────
// Called after stripe.confirmCardPayment() resolves on the client.
// Re-retrieves the PaymentIntent from Stripe so we never trust the browser.
router.post('/confirm', async (req, res) => {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
        return res.status(400).json({ error: 'paymentIntentId is required.' });
    }

    try {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const succeeded = intent.status === 'succeeded';

        // Update DB status
        try {
            db.prepare(
                "UPDATE orders SET status = ? WHERE stripe_session_id = ?"
            ).run(succeeded ? 'paid' : intent.status, paymentIntentId);
        } catch (dbErr) {
            console.error('[DB] update order status failed:', dbErr.message);
        }

        return res.json({ success: succeeded, status: intent.status });

    } catch (err) {
        console.error('[Stripe] confirm error:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;