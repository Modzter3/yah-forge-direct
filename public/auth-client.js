(function () {
  var authPromise = null;

  async function status() {
    return fetch('/api/auth', { credentials: 'same-origin', cache: 'no-store' });
  }

  async function authenticate(token) {
    var response = await fetch('/api/auth', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token }),
    });
    if (!response.ok) {
      var body = await response.json().catch(function () { return {}; });
      throw new Error(body.error || 'YahForge authentication failed.');
    }
    return true;
  }

  function ensureAuth(interactive) {
    if (authPromise) return authPromise;
    authPromise = status().then(function (response) {
      if (response.ok) return true;
      if (!interactive) return false;
      var token = window.prompt('Enter your YahForge access token. It will be stored only in a secure, HttpOnly session cookie.');
      if (!token) throw new Error('YahForge access token is required.');
      return authenticate(token);
    }).finally(function () {
      authPromise = null;
    });
    return authPromise;
  }

  window.YahForgeAuth = {
    authenticate: authenticate,
    ensure: ensureAuth,
    status: status,
  };

  document.addEventListener('DOMContentLoaded', function () {
    ensureAuth(true).catch(function (error) {
      if (typeof window.showToast === 'function') window.showToast(error.message);
      else console.error(error);
    });
  });
})();
