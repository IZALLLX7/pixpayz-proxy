import { authorize } from './_auth.js';

// Best-effort: memori fungsi serverless gak dibagi antar instance, jadi ini
// cuma ngerem spam yang kena instance yang sama.
const lastSent = new Map();
const COOLDOWN_MS = 30_000;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

const clean = (value, max) =>
  String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
    .slice(0, max);

function looksLikeImage(buf) {
  const jpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
  const png = buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  return jpeg || png;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const payload = await authorize(req, res, ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']);
  if (!payload) return;

  const now = Date.now();
  if (now - (lastSent.get(payload.sub) ?? 0) < COOLDOWN_MS) {
    res.status(429).json({ error: 'Tunggu sebentar sebelum kirim laporan lagi' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const description = clean(body.description, 2000);
  if (description.length < 10) {
    res.status(400).json({ error: 'Deskripsi minimal 10 karakter' });
    return;
  }

  let photo = null;
  if (body.photoBase64) {
    photo = Buffer.from(String(body.photoBase64), 'base64');
    if (photo.length === 0 || !looksLikeImage(photo)) {
      res.status(400).json({ error: 'Format foto tidak valid' });
      return;
    }
    if (photo.length > MAX_PHOTO_BYTES) {
      res.status(413).json({ error: 'Ukuran foto terlalu besar' });
      return;
    }
  }

  const text = [
    '🐞 Laporan bug',
    `Dari: @${clean(body.username, 40) || '-'} (belum diverifikasi)`,
    `UID: ${payload.sub}`,
    `Versi app: ${clean(body.appVersion, 20) || '-'}`,
    `Platform: ${clean(body.platform, 20) || '-'}`,
    '',
    description,
  ].join('\n');

  const chatId = process.env.TELEGRAM_CHAT_ID;
  const api = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

  try {
    const msgRes = await fetch(`${api}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15000),
    });
    const msg = await msgRes.json().catch(() => ({}));
    if (!msgRes.ok || !msg.ok) {
      res.status(502).json({ error: 'Gagal kirim laporan ke Telegram' });
      return;
    }

    let photoSent = true;
    if (photo) {
      try {
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('reply_to_message_id', String(msg.result.message_id));
        form.append('photo', new Blob([photo], { type: 'image/jpeg' }), 'lampiran.jpg');
        const photoRes = await fetch(`${api}/sendPhoto`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(25000),
        });
        photoSent = photoRes.ok;
      } catch {
        photoSent = false;
      }
    }

    if (lastSent.size > 1000) lastSent.clear();
    lastSent.set(payload.sub, now);
    res.status(200).json({ ok: true, photoSent });
  } catch {
    res.status(502).json({ error: 'Gagal kirim laporan, coba lagi ya' });
  }
}
