import {
  SESSION_COOKIE,
  accessConfigured,
  authError,
  isAuthorized,
} from './_auth.js';

export const config = { runtime: 'edge' };

function sessionCookie(value, maxAge) {
  return [
    SESSION_COOKIE + '=' + encodeURIComponent(value),
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Max-Age=' + maxAge,
  ].join('; ');
}

export default async function handler(req) {
  if (req.method === 'GET') {
    if (!accessConfigured() || !isAuthorized(req)) return authError();
    return Response.json({ authenticated: true }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (req.method === 'DELETE') {
    return Response.json({ authenticated: false }, {
      headers: {
        'Cache-Control': 'no-store',
        'Set-Cookie': sessionCookie('', 0),
      },
    });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  var body;
  try {
    body = await req.json();
  } catch (_) {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  var token = String(body && (body.token || body.secret) || '');
  var synthetic = new Request(req.url, {
    headers: { authorization: 'Bearer ' + token },
  });
  if (!accessConfigured() || !isAuthorized(synthetic)) return authError();

  return Response.json({ authenticated: true }, {
    headers: {
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(token, 60 * 60 * 24 * 30),
    },
  });
}

