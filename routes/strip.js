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