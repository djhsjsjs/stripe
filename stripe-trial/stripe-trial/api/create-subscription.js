// Этот файл — "кассир". Он работает на сервере, видит секретный ключ Stripe
// и никогда не показывает его пользователю. Frontend (checkout.html) просто
// присылает сюда email/имя и получает обратно client_secret для оплаты.

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  // Разрешаем запросы с любого домена (если фронт и бэк на разных доменах)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, name } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: 'Email обязателен' });
    }

    // 1. Создаём (или находим) клиента
    const customer = await stripe.customers.create({
      email,
      name: name || undefined,
    });

    // 2. Создаём подписку:
    //    - items: еженедельная цена $30 (WEEKLY_PRICE_ID)
    //    - trial_period_days: 7 — 7 дней подписка не списывает $30
    //    - add_invoice_items: разовая цена $3 (TRIAL_PRICE_ID),
    //      которая выставляется и оплачивается СРАЗУ, несмотря на триал
    //    - payment_settings.save_default_payment_method: карта, которой
    //      оплатили $3, автоматически сохраняется для будущих списаний $30
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.WEEKLY_PRICE_ID }],
      trial_period_days: 7,
      add_invoice_items: [{ price: process.env.TRIAL_PRICE_ID }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
    });

    const paymentIntent = subscription.latest_invoice.payment_intent;

    return res.status(200).json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
};
