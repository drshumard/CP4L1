import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ClerkProvider, SignIn, useAuth as useClerkAuth } from '@clerk/react';

// Staff sign-in (staff.drshumard.com, also reachable at /staff-login): authenticates
// against the existing fm.drshumard.com Clerk instance — the same credentials the team
// has always used — then exchanges the Clerk session for a normal portal JWT.
// Clerk proves identity; the Team page decides membership and role (exchange fails
// closed for anyone not on the roster).

const API = process.env.REACT_APP_BACKEND_URL + '/api';
const CLERK_PK = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY || '';

function StaffLoginInner() {
  const { isLoaded, isSignedIn, getToken, signOut } = useClerkAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const exchanging = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || exchanging.current) return;
    exchanging.current = true;
    (async () => {
      try {
        const clerkToken = await getToken();
        const res = await axios.post(`${API}/auth/clerk-exchange`, { token: clerkToken });
        localStorage.setItem('access_token', res.data.access_token);
        if (res.data.refresh_token) localStorage.setItem('refresh_token', res.data.refresh_token);
        localStorage.setItem('user_data', JSON.stringify(res.data.user || {}));
        navigate('/staff', { replace: true });
      } catch (e) {
        const detail = e?.response?.data?.detail || 'Sign-in failed. Please try again.';
        setError(detail);
        exchanging.current = false;
        try { await signOut(); } catch { /* stay on page with the error */ }
      }
    })();
  }, [isLoaded, isSignedIn, getToken, navigate, signOut]);

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
        ) : isSignedIn && !error ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-800 border-t-transparent" />
            Signing you in…
          </div>
        ) : (
          <SignIn routing="hash" />
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
