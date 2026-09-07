import axios from 'axios';

// Shared session refresh — single-flight so concurrent 401s from BOTH clients
// (the global Axios interceptor and the Supplementor's raw-fetch client)
// coalesce into one /auth/refresh call instead of racing and rotating each
// other's tokens. Callers retry their original request after this resolves.

const API = process.env.REACT_APP_BACKEND_URL + '/api';

// Once a session has been ended, an in-flight refresh that resolves afterwards
// must NOT write tokens back into localStorage and silently resurrect the login.
let loggedOut = false;

// One logout for every session-ender — the staff/admin logout buttons, the
// Supplementor's expiry path, and the global 401 interceptor all come through
// here so the Learn cookie dies with the portal session. (Same-origin /learn in
// prod; dev's cross-port call is CORS-blocked and harmlessly ignored.)
// Note: this does NOT end the viewer's Google account session — that's theirs to
// manage; the staff sign-in requires an explicit click, so there's no auto re-login.
export function endSession(redirect) {
  loggedOut = true;
  const learnBase = process.env.REACT_APP_LEARN_URL || '/learn';
  try {
    // keepalive: the request must survive the navigation below, or the Learn cookie outlives the portal logout.
    fetch(`${learnBase}/api/auth/signout`, { method: 'POST', credentials: 'include', keepalive: true }).catch(() => {});
  } catch { /* ignore */ }
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user_data');
  window.location.replace(redirect);
}

let refreshing = null;

export function refreshSession() {
  if (!refreshing) {
    refreshing = (async () => {
      const refresh_token = localStorage.getItem('refresh_token');
      if (!refresh_token) throw new Error('No refresh token');
      // skipAuthRefresh keeps the global 401 interceptor from recursing into us.
      const res = await axios.post(`${API}/auth/refresh`, { refresh_token }, { skipAuthRefresh: true });
      if (loggedOut) throw new Error('Session ended');  // logout won the race — don't resurrect
      localStorage.setItem('access_token', res.data.access_token);
      if (res.data.refresh_token) localStorage.setItem('refresh_token', res.data.refresh_token);
      return res.data.access_token;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}
