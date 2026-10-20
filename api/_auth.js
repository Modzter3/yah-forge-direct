export const SESSION_COOKIE = 'yahforge_session';

function configuredSecret() {
  return String(
    process.env.YAHFORGE_ACCESS_TOKEN ||
    process.env.YAHFORGE_AUTOMATION_SECRET ||
    '',
  );
}

function constantTimeEqual(left, right) {
  left = String(left || '');
  right = String(right || '');
  var mismatch = left.length ^ right.length;
  var length = Math.max(left.length, right.length);
  for (var i = 0; i < length; i += 1) {
    mismatch |= (left.charCodeAt(i % Math.max(left.length, 1)) || 0) ^
      (right.charCodeAt(i % Math.max(right.length, 1)) || 0);
  }
  return mismatch === 0 && left.length === right.length;
}

function cookieValue(req, name) {
  var source = req.headers.get('cookie') || '';
  var prefix = name + '=';
  var pieces = source.split(';');
  for (var i = 0; i < pieces.length; i += 1) {
    var piece = pieces[i].trim();
    if (piece.indexOf(prefix) === 0) return decodeURIComponent(piece.slice(prefix.length));
  }
  return '';
}

export function accessConfigured() {
  return configuredSecret().length >= 24;
}

export function isAuthorized(req) {
  var expected = configuredSecret();
  if (expected.length < 24) return false;
  var authorization = req.headers.get('authorization') || '';
  var bearer = authorization.replace(/^Bearer\s+/i, '');
  return constantTimeEqual(bearer, expected) ||
    constantTimeEqual(cookieValue(req, SESSION_COOKIE), expected);
}

export function authError() {
  var configured = accessConfigured();
  return Response.json({
    error: configured
      ? 'YahForge authentication required.'
      : 'Set YAHFORGE_ACCESS_TOKEN (at least 24 characters) in Vercel, then redeploy.',
    code: configured ? 'YAHFORGE_AUTH_REQUIRED' : 'YAHFORGE_AUTH_NOT_CONFIGURED',
  }, {
    status: configured ? 401 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function requireAuthorization(req) {
  return isAuthorized(req) ? null : authError();
}

