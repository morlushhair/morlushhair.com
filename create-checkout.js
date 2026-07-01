// MorLush Hair — itemized Stripe Checkout
// Holds the authoritative price list server-side so totals can't be tampered with.
// Requires a Netlify environment variable: STRIPE_SECRET_KEY

// Prices in CAD dollars, keyed by product name then length (18 or 22).
// These MUST match the prices shown on the website.
const PRICES = {
  'Invisible Clip-In Extensions':     { 18: 540, 22: 670 },
  'Genius Weft':                      { 18: 570, 22: 690 },
  'Invisible Weft Tape-Ins':          { 18: 350, 22: 430 },
  'Invisible Individual Tape-Ins':    { 18: 350, 22: 430 },
  'Mini K-Tip Extensions':            { 18: 480, 22: 600 },
  'K-Tip Extensions':                 { 18: 470, 22: 590 },
  'Genius Butterfly Weft':            { 18: 650, 22: 720 }
};

const SITE = 'https://morlush-hair.netlify.app';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Stripe key not configured.' }) };
  }

  let cart;
  try {
    cart = JSON.parse(event.body).items || [];
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid cart.' }) };
  }
  if (!Array.isArray(cart) || cart.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Cart is empty.' }) };
  }

  // Build Stripe line items from the authoritative price list (never trust client prices)
  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('success_url', SITE + '/success.html?session_id={CHECKOUT_SESSION_ID}');
  params.append('cancel_url', SITE + '/');
  // collect shipping address since these are physical goods
  params.append('shipping_address_collection[allowed_countries][0]', 'CA');
  params.append('shipping_address_collection[allowed_countries][1]', 'US');
  // collect a phone number
  params.append('phone_number_collection[enabled]', 'true');
  // shipping options: Standard shipping ($15) + free Calgary pickup
  // NOTE: $15 is a temporary flat rate — change SHIP_CENTS below to update.
  const SHIP_CENTS = 1500;
  params.append('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  params.append('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(SHIP_CENTS));
  params.append('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'cad');
  params.append('shipping_options[0][shipping_rate_data][display_name]', 'Standard shipping');
  params.append('shipping_options[1][shipping_rate_data][type]', 'fixed_amount');
  params.append('shipping_options[1][shipping_rate_data][fixed_amount][amount]', '0');
  params.append('shipping_options[1][shipping_rate_data][fixed_amount][currency]', 'cad');
  params.append('shipping_options[1][shipping_rate_data][display_name]', 'Local pickup \u2014 Calgary, AB');

  let i = 0;
  for (const item of cart) {
    const name = (item.name || '').trim();
    const len = parseInt(item.length, 10);            // "22"" -> 22
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    const priceTable = PRICES[name];
    if (!priceTable || !priceTable[len]) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Unknown item: ' + name + ' ' + item.length }) };
    }
    const amountCents = priceTable[len] * 100;
    const label = name + ' — ' + len + '"' + (item.color ? ' (' + item.color + ')' : '');

    params.append(`line_items[${i}][price_data][currency]`, 'cad');
    params.append(`line_items[${i}][price_data][product_data][name]`, label);
    params.append(`line_items[${i}][price_data][unit_amount]`, String(amountCents));
    params.append(`line_items[${i}][quantity]`, String(qty));
    i++;
  }

  try {
    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    const session = await resp.json();
    if (session.error) {
      return { statusCode: 400, body: JSON.stringify({ error: session.error.message }) };
    }
    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not reach Stripe.' }) };
  }
};
