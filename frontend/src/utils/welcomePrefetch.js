import axios from 'axios';

// While the welcome is on screen it loads what the portal opens with, so the page after it shows straight away — the
// welcome is the loader (user, 2026-09-28). Same for /ready's finish button → /outcome. One bundle, for the next
// portal page, used once.

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const FRESH_MS = 20000;
let bundle = null; // { token, at, user, progress, appointment }

// The patient, their journey step and their booking. `me`: a /user/me request already on its way (the welcome greets
// with it), so it isn't made twice.
export async function loadPortal(me) {
  const h = { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } };
  const [u, p, a] = await Promise.all([
    me || axios.get(`${API}/user/me`, h),
    axios.get(`${API}/user/progress`, h),
    axios.get(`${API}/user/appointment`, h).catch(() => ({ data: { appointment: null } })),
  ]);
  return { user: u.data, progress: p.data, appointment: a.data?.appointment || null };
}

// Keeps it for the page after the welcome — called while the welcome is still up, so a late answer can't stand in
// for a later visit.
export function stashWelcomeData(data) {
  bundle = { ...data, token: localStorage.getItem('access_token'), at: Date.now() };
}

// The bundle, if this session loaded it moments ago.
export function peekWelcomeData() {
  if (bundle && (bundle.token !== localStorage.getItem('access_token') || Date.now() - bundle.at > FRESH_MS)) bundle = null;
  return bundle;
}

// Once a page has taken it — from an effect, as StrictMode runs state initializers twice — so later visits load fresh.
export function clearWelcomeData() {
  bundle = null;
}
