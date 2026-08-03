import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import QRCode from 'qrcode';
import Stripe from 'stripe';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();
// Fallback for the local key file that predates .env; values in .env win.
dotenv.config({ path: path.join(__dirname, 'accesstokens.env') });

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = process.env.BASE_URL || '';
const CURRENCY = (process.env.CURRENCY || 'usd').toLowerCase();
const PRODUCT_NAME = process.env.PRODUCT_NAME || 'TrustTaps Google Review Card';
const UNIT_AMOUNT = Number(process.env.UNIT_AMOUNT) || 2499;
const SHIPPING_AMOUNT = Number(process.env.SHIPPING_AMOUNT) || 0;
const MAX_QUANTITY = 50;

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

/**
 * The origin the visitor actually reached us on, so QR codes and Stripe
 * redirects work over localhost, a LAN address, or the live domain alike.
 */
function originFrom(req) {
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return BASE_URL || `http://localhost:${PORT}`;
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${proto}://${host}`;
}

app.get('/api/config', (req, res) => {
  res.json({
    unitAmount: UNIT_AMOUNT,
    shippingAmount: SHIPPING_AMOUNT,
    currency: CURRENCY,
    productName: PRODUCT_NAME,
  });
});

const qrCache = new Map();

app.get('/qr.svg', async (req, res) => {
  const target = `${originFrom(req)}/buy`;

  try {
    if (!qrCache.has(target)) {
      qrCache.set(
        target,
        await QRCode.toString(target, {
          type: 'svg',
          margin: 0,
          errorCorrectionLevel: 'M',
          color: { dark: '#0d0d0dff', light: '#00000000' },
        }),
      );
    }

    res.type('image/svg+xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(qrCache.get(target));
  } catch (error) {
    console.error('QR generation failed:', error.message);
    res.status(500).end();
  }
});

app.post('/api/checkout', async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: 'Payments are not configured yet.' });
  }

  const quantity = Math.min(MAX_QUANTITY, Math.max(1, Number.parseInt(req.body?.quantity, 10) || 1));
  const reviewLink = typeof req.body?.reviewLink === 'string' ? req.body.reviewLink.slice(0, 400) : '';
  const base = BASE_URL || originFrom(req);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity,
          price_data: {
            currency: CURRENCY,
            unit_amount: UNIT_AMOUNT,
            product_data: {
              name: PRODUCT_NAME,
              description: 'NFC chip with printed QR backup and 3M adhesive back. Unlimited taps, no monthly fee.',
            },
          },
        },
      ],
      shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'AU', 'IE', 'NZ'] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            display_name: SHIPPING_AMOUNT === 0 ? 'Free shipping' : 'Standard shipping',
            fixed_amount: { amount: SHIPPING_AMOUNT, currency: CURRENCY },
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 7 },
            },
          },
        },
      ],
      custom_fields: reviewLink
        ? undefined
        : [
            {
              key: 'google_review_link',
              label: { type: 'custom', custom: 'Google review link (optional)' },
              type: 'text',
              optional: true,
            },
          ],
      metadata: { reviewLink },
      success_url: `${base}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/buy`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout failed:', error.message);
    res.status(502).json({ error: 'Checkout is temporarily unavailable.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TrustTaps running on ${BASE_URL || `http://localhost:${PORT}`}`);
  if (!stripe) console.warn('STRIPE_SECRET_KEY is missing — the checkout button will return an error.');
});
