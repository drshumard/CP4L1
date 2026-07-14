import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { HeartPulse, CheckCircle2, Activity, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { getErrorMessage } from '../utils/errorHandler';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Signup = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [stage, setStage] = useState(0); // 0: welcome, 1: setting up, 2: account ready, 3: redirecting
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [progress, setProgress] = useState(0); // Progress percentage 0-100
  const signupStartedRef = useRef(false); // Prevent double execution

  // Signup process starts automatically via the other useEffect

  const startSignupProcess = useCallback(async (userEmail, userName, contactId) => {
    // The welcome animation and the API call run in parallel. The animation
    // is purely presentational (acknowledges the screen for ~2s); the API
    // fires on mount so the fast path — webhook already landed — can
    // complete in well under 5s instead of forcing a 16s minimum wait.
    const startTime = Date.now();
    const MIN_WELCOME_MS = 2000;       // user sees the welcome stage at least this long
    const ANIMATION_TARGET_SECONDS = 14; // progress bar fills over ~14s; holds at 95% if API is slower

    const progressInterval = setInterval(() => {
      setProgress(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed >= ANIMATION_TARGET_SECONDS) return 95;
        return Math.min((elapsed / ANIMATION_TARGET_SECONDS) * 95, 95);
      });
    }, 200);

    // Animation: welcome (stage 0) → setting up (stage 1) after MIN_WELCOME_MS.
    setTimeout(() => {
      setStage((s) => (s < 2 ? 1 : s));
    }, MIN_WELCOME_MS);

    // API fires immediately. When it returns, we wait out the welcome minimum
    // before transitioning to stage 2 so the user always sees the intro frame.
    try {
      const response = await axios.post(`${API}/auth/signup`, {
        email: userEmail,
        name: userName,
        contact_id: contactId,
      });

      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('refresh_token', response.data.refresh_token);
      localStorage.setItem('user_email', userEmail);

      const elapsed = Date.now() - startTime;
      const waitBeforeReady = Math.max(0, MIN_WELCOME_MS - elapsed);

      setTimeout(() => {
        setProgress(100);
        setStage(2);
        setTimeout(() => setStage(3), 800);
        setTimeout(() => {
          clearInterval(progressInterval);
          navigate('/book', { replace: true });
        }, 1600);
      }, waitBeforeReady);

    } catch (error) {
      clearInterval(progressInterval);

      const status = error.response?.status;
      const errorMessage = status === 404
        ? 'Please make sure you have completed payment. If you have and believe this is a mistake, contact admin@drshumard.com'
        : status === 403
        // Dead first-entry link (invalid / expired / already used) → send them to email OTP.
        ? (error.response?.data?.detail || 'This sign-in link is no longer valid. Please sign in with your email to continue.')
        : getErrorMessage(error, 'Signup failed. Please try again.');

      toast.error(errorMessage, { id: 'signup-error', duration: 8000 });
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
      setEmail(fixedEmail);
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

  const greetName = name && name !== 'there' ? name.split(' ')[0] : null;
  const STAGES = {
    0: { icon: HeartPulse, heading: 'Welcome to Dr. Shumard', sub: greetName ? `${greetName}, we're glad you're here.` : "We're glad you're here." },
    1: { icon: Activity, heading: 'Setting up your account', sub: 'Preparing your onboarding portal.' },
    2: { icon: CheckCircle2, heading: 'Account ready', sub: 'Taking you to your portal.' },
    3: { icon: ArrowRight, heading: 'Almost there', sub: 'Redirecting to your onboarding.' },
  };
  const current = STAGES[stage] || STAGES[0];
  const StageIcon = current.icon;
  const R = 54;
  const C = 2 * Math.PI * R;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4" style={{ background: '#F4F3F2' }}>
      {/* Calm ambient teal glow */}
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 size-[30rem] -translate-x-1/2 rounded-full bg-teal-400 opacity-25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-24 size-96 rounded-full bg-cyan-500 opacity-[0.14] blur-3xl" />

      <div className="relative z-10 w-full max-w-md animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
        <Card className="border-border/60 bg-white/85 shadow-xl backdrop-blur-xl">
          <CardContent className="flex flex-col items-center px-8 py-10 text-center">
            {/* Progress ring with the current stage icon at its center */}
            <div className="relative size-32">
              <svg className="size-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={R} fill="none" strokeWidth="6" className="stroke-teal-100" />
                <circle
                  cx="60" cy="60" r={R}
                  fill="none" strokeWidth="6" strokeLinecap="round"
                  stroke="url(#tealRing)"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - progress / 100)}
                  style={{ transition: 'stroke-dashoffset 0.3s ease-out' }}
                />
                <defs>
                  <linearGradient id="tealRing" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2dd4bf" />
                    <stop offset="100%" stopColor="#0d9488" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div key={stage} className="animate-in fade-in-0 zoom-in-50 duration-300">
                  <StageIcon className="text-teal-600" size={38} strokeWidth={2} />
                </div>
              </div>
            </div>

            {/* Stage heading + subtext */}
            <div key={stage} className="mt-7 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{current.heading}</h1>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-500">{current.sub}</p>
            </div>

            {/* Footer: live indicator + numeric progress */}
            <div className="mt-8 flex w-full items-center justify-between border-t border-border/60 pt-5 text-xs text-slate-500">
              <span className="flex items-center gap-2">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-teal-500" />
                </span>
                Stay on this page — redirecting automatically
              </span>
              <span className="font-medium tabular-nums text-slate-700">{Math.floor(progress)}%</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Signup;