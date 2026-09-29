import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { getErrorMessage } from '../utils/errorHandler';
import { loadPortal, stashWelcomeData } from '../utils/welcomePrefetch';
import AuthFrame from './auth/AuthFrame';
import WelcomeScreen from './auth/WelcomeScreen';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// GHL first-entry link → the welcome (design: shumard-checkout-portal/app/welcome) while the account is signed in
// for real: "Your portal is ready" waits for /auth/signup, then straight into the portal (/book) — no button. A failure
// shows on the page (no toast — user, 2026-09-28), then sign-in.
const Signup = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const signupStartedRef = useRef(false); // Prevent double execution

  const startSignupProcess = useCallback(async (userEmail, userName, contactId) => {
    try {
      const response = await axios.post(`${API}/auth/signup`, {
        email: userEmail,
        name: userName,
        contact_id: contactId,
      });

      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('refresh_token', response.data.refresh_token);
      localStorage.setItem('user_email', userEmail);
      // The welcome is the portal's loader: /book opens without its journey check once this is in.
      await loadPortal().then(stashWelcomeData, () => {});
      setReady(true);
    } catch (error) {
      const status = error.response?.status;
      const errorMessage = status === 404
        ? 'Please make sure you have completed payment. If you have and believe this is a mistake, contact admin@drshumard.com'
        : status === 403
        // Dead first-entry link (invalid / expired / already used) → send them to email OTP.
        ? (error.response?.data?.detail || 'This sign-in link is no longer valid. Please sign in with your email to continue.')
        : getErrorMessage(error, 'Signup failed. Please try again.');

      setError(errorMessage);
      setTimeout(() => navigate('/login', { replace: true }), 8000);
    }
  }, [navigate]);

  useEffect(() => {
    // Prevent double execution in React StrictMode
    if (signupStartedRef.current) {
      return;
    }

    const emailParam = searchParams.get('email');
    const nameParam = searchParams.get('name') || 'there';
    // The first-entry secret the webhook saved, matched server-side. Deliberately carried
    // under the opaque param name `zsh` (not "contact_id") so the link doesn't advertise
    // which value is the secret. Must match the GHL link: /signup?email=...&zsh={{contact.id}}
    const contactIdParam = searchParams.get('zsh') || '';

    if (emailParam) {
      signupStartedRef.current = true;
      // Fix for GHL redirect: spaces in email should be + signs
      // (browsers decode + as space in query strings, but + is valid in emails)
      const fixedEmail = emailParam.replace(/ /g, '+');
      // A malformed %-sequence in the name would throw here and hard-brick signup (the
      // run-once ref is already set), so fall back to the raw value.
      let decodedName = nameParam;
      try { decodedName = decodeURIComponent(nameParam); } catch { /* use raw */ }
      setName(decodedName);
      startSignupProcess(fixedEmail, decodedName, contactIdParam);
    } else {
      toast.error('Invalid signup link', { id: 'invalid-signup-link' });
      navigate('/login');
    }
  }, [searchParams, navigate, startSignupProcess]);

  // Handle browser back button - redirect to dashboard instead of re-running signup
  useEffect(() => {
    const handlePopState = () => {
      // If user presses back, redirect to dashboard
      navigate('/dashboard', { replace: true });
    };

    // Push a dummy state so we can intercept back button
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate]);

  const enterPortal = useCallback(() => navigate('/book', { replace: true }), [navigate]);

  // GHL links usually carry no name (the param falls back to "there") — then the welcome greets without one.
  const firstName = name && name !== 'there' ? name.split(' ')[0] : null;

  return (
    <AuthFrame mainId="welcome">
      <WelcomeScreen firstName={firstName} ready={ready} error={error} onDone={enterPortal} />
    </AuthFrame>
  );
};

export default Signup;
