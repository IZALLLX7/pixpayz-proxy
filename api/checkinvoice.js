import { authorize, callPixpayz } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!(await authorize(req, res))) return;

  const id = String(req.query.id ?? '');
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) {
    res.status(400).json({ error: 'ID invoice tidak valid' });
    return;
  }

  await callPixpayz(res, '/api/checkinvoice', { id });
}
