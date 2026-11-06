import { createRemoteJWKSet, jwtVerify } from 'jose';

// Kunci publik Google buat verifikasi ID token Firebase.
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

/**
 * Cek header "Authorization: Bearer <ID token Firebase>".
 * Kalau berhasil return payload token (ada `sub` = uid), kalau gagal
 * langsung balas ke klien dan return null.
 * `requiredEnv` = daftar environment variable yang wajib ada buat endpoint ini.
 */
export async function authorize(req, res, requiredEnv = ['PIXPAYZ_API_KEY']) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId || requiredEnv.some((name) => !process.env[name])) {
    res.status(500).json({ error: 'Server belum dikonfigurasi' });
    return null;
  }

  const match = (req.headers.authorization || '').match(/^Bearer (.+)$/i);
  if (!match) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  try {
    const { payload } = await jwtVerify(match[1], JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    if (!payload.sub) throw new Error('token tanpa sub');
    return payload;
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
}

export async function callPixpayz(res, path, params) {
  const base = process.env.PIXPAYZ_BASE_URL || 'https://pixpayz.com';
  const url = new URL(path, base);
  url.searchParams.set('apikey', process.env.PIXPAYZ_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let upstream;
  try {
    upstream = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch {
    res.status(502).json({ error: 'Server Pixpayz tidak merespons, coba lagi ya' });
    return;
  }

  const text = await upstream.text();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(upstream.status).send(text);
}
