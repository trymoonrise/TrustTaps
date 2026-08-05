const qtyInput = document.getElementById('qty');
const form = document.getElementById('buy-form');
const checkoutBtn = document.getElementById('checkout-btn');
const errorEl = document.getElementById('form-error');
const yearEl = document.getElementById('year');

const priceEls = {
  unit: document.getElementById('unit-price'),
  total: document.getElementById('total'),
};

/** GitHub Pages is static — checkout runs on Render. */
const API_BASE = window.location.hostname.endsWith('github.io')
  ? 'https://trusttaps.onrender.com'
  : '';

let pricing = { unitAmount: 2499, shippingAmount: 0, currency: 'usd' };

if (yearEl) yearEl.textContent = String(new Date().getFullYear());

function siteOrigin() {
  const dir = window.location.pathname.replace(/\/[^/]*$/, '');
  return `${window.location.origin}${dir}`;
}

function formatMoney(amountInCents) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: pricing.currency.toUpperCase(),
  }).format(amountInCents / 100);
}

function clampQty(value) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return 1;
  return Math.min(50, Math.max(1, n));
}

function renderPrices() {
  const quantity = qtyInput ? clampQty(qtyInput.value) : 1;
  const total = pricing.unitAmount * quantity + pricing.shippingAmount;

  if (priceEls.unit) priceEls.unit.textContent = formatMoney(pricing.unitAmount);
  if (priceEls.total) priceEls.total.textContent = formatMoney(total);
}

function showError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    if (response.status >= 500 || response.status === 503) {
      throw new Error('The site is waking up — wait a few seconds and try again.');
    }
    throw new Error('Unexpected server response. Please refresh and try again.');
  }
}

async function startCheckout(attempt = 1) {
  const payload = {
    quantity: clampQty(qtyInput?.value ?? 1),
    reviewLink: '',
  };
  if (API_BASE) payload.returnOrigin = siteOrigin();

  const response = await fetch(`${API_BASE}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await readJson(response);

  if (!response.ok || !data.url) {
    const retryable = response.status >= 500 || response.status === 503;
    if (retryable && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      return startCheckout(attempt + 1);
    }
    throw new Error(data.error || 'Could not start checkout.');
  }

  window.location.href = data.url;
}

if (qtyInput) {
  document.querySelectorAll('.qty-btn').forEach((button) => {
    button.addEventListener('click', () => {
      qtyInput.value = String(clampQty(Number(qtyInput.value) + Number(button.dataset.step)));
      renderPrices();
    });
  });

  qtyInput.addEventListener('input', renderPrices);
  qtyInput.addEventListener('blur', () => {
    qtyInput.value = String(clampQty(qtyInput.value));
    renderPrices();
  });
}

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');

    const originalLabel = checkoutBtn.innerHTML;
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Redirecting…';

    try {
      await startCheckout();
    } catch (error) {
      showError(`${error.message} Or email support@trusttaps.com.`);
      checkoutBtn.disabled = false;
      checkoutBtn.innerHTML = originalLabel;
    }
  });
}

fetch(`${API_BASE}/api/config`)
  .then((response) => (response.ok ? response.json() : null))
  .then((config) => {
    if (!config) return;
    pricing = {
      unitAmount: config.unitAmount,
      shippingAmount: config.shippingAmount ?? 0,
      currency: config.currency,
    };
    renderPrices();
  })
  .catch(() => {});

renderPrices();
