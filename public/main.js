const qtyInput = document.getElementById('qty');
const form = document.getElementById('buy-form');
const checkoutBtn = document.getElementById('checkout-btn');
const errorEl = document.getElementById('form-error');
const yearEl = document.getElementById('year');

const priceEls = {
  unit: document.getElementById('unit-price'),
  total: document.getElementById('total'),
};

let pricing = { unitAmount: 2499, shippingAmount: 0, currency: 'usd' };

if (yearEl) yearEl.textContent = String(new Date().getFullYear());

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

    const reviewLink = document.getElementById('review-link');
    if (reviewLink && reviewLink.value && !/^https?:\/\/\S+$/i.test(reviewLink.value.trim())) {
      showError('That review link does not look like a URL. Leave it blank if you are not sure.');
      return;
    }

    const originalLabel = checkoutBtn.innerHTML;
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Redirecting…';

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: clampQty(qtyInput.value),
          reviewLink: reviewLink ? reviewLink.value.trim() : '',
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || 'Could not start checkout.');
      window.location.href = data.url;
    } catch (error) {
      showError(`${error.message} Please try again or email support@trusttaps.com.`);
      checkoutBtn.disabled = false;
      checkoutBtn.innerHTML = originalLabel;
    }
  });
}

fetch('/api/config')
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
