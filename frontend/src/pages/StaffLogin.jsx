import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

// Staff sign-in (staff.drshumard.com, also reachable at /staff-login): sign in with
// Google (primary) or email + password (alternative). Either way the backend only learns
// the email — the Team page (users collection) decides membership/role. The one portal
// JWT it returns then governs the admin portal, Supplements, and Learn (via SSO handoff).

const API = process.env.REACT_APP_BACKEND_URL + '/api';
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID || '';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

// Load Google Identity Services once, resolving when window.google.accounts.id is ready.
function loadGsi() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function StaffLogin() {
  const navigate = useNavigate();
  const googleBtnRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSession = (data) => {
    localStorage.setItem('access_token', data.access_token);
    if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('user_data', JSON.stringify(data.user || {}));
    navigate('/staff', { replace: true });
  };

  // Render the "Sign in with Google" button; its callback exchanges the Google ID token.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;
    let cancelled = false;
    loadGsi().then(() => {
      if (cancelled || !googleBtnRef.current || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          setError('');
          setBusy(true);
          try {
            const res = await axios.post(`${API}/auth/google-exchange`, { credential });
            onSession(res.data);
          } catch (e) {
            setBusy(false);
            setError(e?.response?.data?.detail || "Couldn't sign in with Google. Please try again.");
          }
        },
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline', size: 'large', width: 288, text: 'signin_with',
      });
    }).catch(() => setError('Could not load Google sign-in — you can still use email and password.'));
    return () => { cancelled = true; };
  }, []);

  const submitPassword = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await axios.post(`${API}/auth/staff-login`, { email, password });
      onSession(res.data);
    } catch (err) {
      setBusy(false);
      setError(err?.response?.data?.detail || 'Incorrect email or password');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F8FA] p-4">
      <div className="flex w-80 flex-col items-center gap-5">
        <img src="https://portal-drshumard.b-cdn.net/logo.png" alt="Dr. Shumard"
          className="h-9 w-auto object-contain" style={{ filter: 'brightness(0.2)' }} />
        <p className="text-sm text-slate-500">Team workspace sign-in</p>

        {error && (
          <div className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
            {error}
          </div>
        )}

        {GOOGLE_CLIENT_ID && (
          <>
            <div ref={googleBtnRef} className="flex min-h-[40px] justify-center" />
            <div className="flex w-full items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        )}

        <form onSubmit={submitPassword} className="flex w-full flex-col gap-2">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Email" autoComplete="username"
            className="h-10 rounded-md border border-slate-300 px-3 text-sm focus:border-slate-500 focus:outline-none" />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password" autoComplete="current-password"
            className="h-10 rounded-md border border-slate-300 px-3 text-sm focus:border-slate-500 focus:outline-none" />
          <button type="submit" disabled={busy}
            className="mt-1 h-10 rounded-md bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400">
          Forgot your password? Ask an admin to reset it on the Team page.
        </p>
      </div>
    </div>
  );
}
