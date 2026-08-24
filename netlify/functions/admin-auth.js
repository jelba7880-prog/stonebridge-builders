// netlify/functions/admin-auth.js
// Checks the shared admin password (ADMIN_PASSWORD env var) and, on success,
// issues a signed HttpOnly session cookie that admin-save.js verifies.

const crypto = require('crypto');

const COOKIE_NAME = 'sb_admin_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function constantTimeEqual(a, b) {
  return crypto.timingSafeEqual(digest(a), digest(b));
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  return out;
}

function hasValidSession(event, adminPassword) {
  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [version, expiresAt, sig] = parts;
  const payload = `${version}.${expiresAt}`;

  if (!constantTimeEqual(sig, sign(payload, adminPassword))) return false;
  if (Date.now() > Number(expiresAt)) return false;
  return true;
}

exports.handler = async (event) => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Admin auth is not configured' }) };
  }

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authenticated: hasValidSession(event, adminPassword) }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let password;
  try {
    ({ password } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (typeof password !== 'string' || !constantTimeEqual(password, adminPassword)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Incorrect password' }) };
  }

  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `v1.${expiresAt}`;
  const token = `${payload}.${sign(payload, adminPassword)}`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    },
    body: JSON.stringify({ ok: true }),
  };
};
