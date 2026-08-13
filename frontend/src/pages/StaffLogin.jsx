import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ClerkProvider, SignIn, useAuth as useClerkAuth, useUser } from '@clerk/react';

// Staff sign-in (staff.drshumard.com, also reachable at /staff-login): authenticates
// against the existing fm.drshumard.com Clerk instance, then exchanges the Clerk session
// for a normal portal JWT. Clerk proves identity; the Team page decides membership/role.
//
// A Clerk session that ALREADY exists when this page opens (e.g. after a portal logout —
// the two sessions are separate) is offered as an explicit "Continue as …" choice rather
// than silently signing back in. A fresh sign-in through the widget continues automatically.

const API = process.env.REACT_APP_BACKEND_URL + '/api';
const CLERK_PK = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY || '';

function StaffLoginInner() {
  const { isLoaded, isSignedIn, getToken, signOut } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const navigate = useNavigate();
  // A failed exchange signs the Clerk session out, which reloads this page — the message
  // rides sessionStorage across that reload so the person actually gets to read it.
  const [error, setError] = useState(() => {
    const stored = sessionStorage.getItem('staff_login_error') || '';
    sessionStorage.removeItem('staff_login_error');
    return stored;
  });
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const exchanging = useRef(false);
  const initialSession = useRef(null);

  const runExchange = useCallback(async () => {
    if (exchanging.current) return;
    exchanging.current = true;
    setBusy(true);
    try {
      const clerkToken = await getToken();
      const res = await axios.post(`${API}/auth/clerk-exchange`, { token: clerkToken });
      localStorage.setItem('access_token', res.data.access_token);
      if (res.data.refresh_token) localStorage.setItem('refresh_token', res.data.refresh_token);
      localStorage.setItem('user_data', JSON.stringify(res.data.user || {}));
      navigate('/staff', { replace: true });
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Sign-in failed. Please try again.';
      sessionStorage.setItem('staff_login_error', detail);
      setError(detail);
      exchanging.current = false;
      setBusy(false);
      try { await signOut(); } catch { /* stay on page with the error */ }
    }
  }, [getToken, navigate, signOut]);

  // Record whether a Clerk session already existed when the page opened.
  useEffect(() => {
    if (isLoaded && initialSession.current === null) {
      initialSession.current = isSignedIn;
      if (isSignedIn && !error) setNeedsConfirm(true);
    }
  }, [isLoaded, isSignedIn, error]);

  // Fresh sign-ins (session appears after mount) continue automatically.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || needsConfirm || error) return;
    if (initialSession.current === false) runExchange();
  }, [isLoaded, isSignedIn, needsConfirm, error, runExchange]);

  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress || '';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F8FA] p-4">
      <div className="flex flex-col items-center gap-5">
        <img src="https://portal-drshumard.b-cdn.net/logo.png" alt="Dr. Shumard"
          className="h-9 w-auto object-contain" style={{ filter: 'brightness(0.2)' }} />
        <p className="text-sm text-slate-500">Team workspace sign-in</p>
        {error && (
          <div className="max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
            {error}
          </div>
        )}
        {!isLoaded ? (
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-800 border-t-transparent" />
        ) : isSignedIn && needsConfirm && !error ? (
          <div className="flex w-72 flex-col items-stretch gap-2 rounded-xl border bg-white p-5 text-center shadow-sm">
            <p className="text-sm text-slate-600">You're signed in as</p>
            <p className="truncate text-sm font-semibold text-slate-900">{clerkEmail || 'your team account'}</p>
            <button type="button" disabled={busy} onClick={() => { setNeedsConfirm(false); runExchange(); }}
              className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
              {busy ? 'Signing you in…' : 'Continue to workspace'}
            </button>
            <button type="button" disabled={busy} onClick={() => signOut()}
              className="text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline">
              Use a different account
            </button>
          </div>
        ) : isSignedIn && !error ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-800 border-t-transparent" />
            Signing you in…
          </div>
        ) : (
          <>
            <SignIn routing="hash" forceRedirectUrl="/staff-login" fallbackRedirectUrl="/staff-login" />
            <button type="button" onClick={() => window.location.reload()}
              className="text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline">
              Verified by email in another tab? Click here to continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function StaffLogin() {
  if (!CLERK_PK) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-slate-600">
        Staff sign-in isn't configured (missing Clerk key). Use the regular sign-in at /login instead.
      </div>
    );
  }
  return (
    <ClerkProvider publishableKey={CLERK_PK} afterSignOutUrl="/staff-login">
      <StaffLoginInner />
    </ClerkProvider>
  );
}
