import { authorize, callPixpayz } from './_auth.js';

const MIN_AMOUNT = 1000;
const MAX_AMOUNT = 10000000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!(await authorize(req, res))) return;

  const amount = Number.parseInt(String(req.query.amount ?? ''), 10);
  if (!Number.isInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    res.status(400).json({
      error: `Nominal harus antara ${MIN_AMOUNT} dan ${MAX_AMOUNT}`,
    });
    return;
  }

  await callPixpayz(res, '/api/createinvoice', { amount: String(amount) });
}
