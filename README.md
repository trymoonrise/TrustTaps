# TrustTaps

Single-page site for selling a Google Review NFC card. Vanilla HTML, CSS, and JavaScript on the front end, with a small Express server that creates Stripe Checkout Sessions.

## Run it locally

```bash
npm install
cp .env.example .env   # then paste your Stripe secret key
npm run dev
```

Open http://localhost:3000.

## Configuration

All settings live in `.env`:

| Variable | Meaning |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe secret key. Use a `sk_test_…` key while developing. |
| `UNIT_AMOUNT` | Card price in cents (`2499` = $24.99). |
| `SHIPPING_AMOUNT` | Shipping cost in cents (`0` = free). |
| `CURRENCY` | Three-letter currency code, lowercase. |
| `PRODUCT_NAME` | Name shown on the Stripe checkout page and the receipt. |
| `BASE_URL` | Public origin used for Stripe's success and cancel redirects. |
| `PORT` | Port to listen on. Defaults to 3000. |

The price is defined once on the server and read by the browser from `GET /api/config`, so changing `UNIT_AMOUNT` updates the page and the charge together.

## Pages

| Route | What it is |
| --- | --- |
| `/` | Landing page. Scroll-snapping sections, plus a QR code that opens `/buy`. |
| `/buy` | Product page: style, quantity, review link, order summary, Stripe checkout. |
| `/success.html` | Where Stripe returns the customer after payment. |
| `/qr.svg` | QR code image, generated on the fly (see below). |

## The QR code

`GET /qr.svg` renders a QR pointing at `/buy` on **the origin the request came
in on** — so the same code works on `localhost`, on a LAN address while you test
from a phone, and on the live domain, with nothing to regenerate or configure.
It is cached per origin in memory and served with a one-hour cache header.

## Files

```
server.js                 Express server, Stripe Checkout endpoint, QR endpoint
scripts/build-images.mjs  Turns /assets photos into cutouts in /public/assets
assets/                   Original supplier product photos
public/index.html         Landing page
public/buy.html           Product / checkout page
public/success.html       Post-payment confirmation page
public/styles.css         All styling
public/main.js            Reveal animations, gallery, quantity, checkout request
public/assets/            Generated product images used by the site
```

Both pages share `styles.css` and `main.js`; the script guards on element
presence, so each page only runs the behaviour it actually has.

## Product photos

`public/assets/*.webp` is generated from the raw photos in `assets/`. The
originals are shot on a white sweep; the script removes that background with a
border flood fill and crops each product tight, so the photos sit on the white
tiles in the page with no visible seam.

Regenerate them after adding or replacing a photo:

```bash
npm install sharp --no-save
node scripts/build-images.mjs
```

`sharp` is deliberately not a project dependency — it is only needed when the
images change, and the site itself ships the generated files.

## Notes on the Stripe key

A restricted key (`rk_live_…`) only works if it has write access to Checkout Sessions. If checkout fails with a permissions error, either grant that permission to the restricted key or use a standard secret key.

Never commit real keys. `.env` and `accesstokens.env` are both listed in `.gitignore`.

## Deploying

Any Node host works. The server binds to `0.0.0.0:$PORT`, so on Render or similar platforms you only need:

- Build command: `npm install`
- Start command: `npm start`
- Environment variables: everything from the table above, with `BASE_URL` set to the live domain
