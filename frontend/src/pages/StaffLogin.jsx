import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowRight, CircleAlert, Eye, EyeOff, KeyRound } from 'lucide-react';
import { isStaffHost } from '@/lib/staffApps';
import logo from './checkout/dr-shumard-logo.png';
import s from './staff-login.module.css';

// Staff sign-in (staff.drshumard.com, also reachable at /staff-login): sign in with
// Google (primary) or email + password (alternative). Either way the backend only learns
// the email — the Team page (users collection) decides membership/role. The one portal
// JWT it returns then governs the admin portal, Supplements, and Learn (via SSO handoff).
// Layout ported from shumard-checkout-portal/app/sign-in inside the welcome frame (Lyra).

const API = process.env.REACT_APP_BACKEND_URL + '/api';
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID || '';
const GSI_SRC = 'https://accounts.google.com/gsi/client';
const PATIENT_LOGIN = 'https://portal.drshumard.com/login';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');   // server-side rejection (wrong password, not on the team…)
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Team Sign In | Dr. Shumard';
    return () => { document.title = previous; };
  }, []);

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
          setNotice('');
          setBusy(true);
          try {
            const res = await axios.post(`${API}/auth/google-exchange`, { credential });
            onSession(res.data);
          } catch (e) {
            setBusy(false);
            setNotice(e?.response?.data?.detail || "Couldn't sign in with Google. Please try again.");
          }
        },
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline', size: 'large', shape: 'rectangular', text: 'signin_with',
        width: Math.min(392, googleBtnRef.current.clientWidth || 392),
      });
    }).catch(() => setNotice('Could not load Google sign-in — you can still use email and password.'));
    return () => { cancelled = true; };
  }, []);

  const submitPassword = async (e) => {
    e.preventDefault();
    const value = email.trim();
    const next = {
      email: !value ? 'Enter your work email.'
        : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? 'Enter a full email address, like name@drshumard.com.' : undefined,
      password: password ? undefined : 'Enter your password.',
    };
    setErrors(next);
    setNotice('');
    if (next.email || next.password) {
      document.getElementById(next.email ? 'staff-email' : 'staff-password')?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await axios.post(`${API}/auth/staff-login`, { email: value, password });
      onSession(res.data);
    } catch (err) {
      setBusy(false);
      setNotice(err?.response?.data?.detail || 'Incorrect email or password');
      document.getElementById('staff-email')?.focus();
    }
  };

  const patientLink = isStaffHost()
    ? <a href={PATIENT_LOGIN}>Go to patient sign in <ArrowRight size={14} aria-hidden="true" /></a>
    : <Link to="/login">Go to patient sign in <ArrowRight size={14} aria-hidden="true" /></Link>;

  return (
    <div className={s.page}>
      <header className={s.header}>
        <a href="https://drshumardworkshop.com" aria-label="Dr. Shumard home">
          <img src={logo} alt="Dr. Shumard" width={1024} height={152} className={s.logo} />
        </a>
        <span className={s.portalLabel}>Team workspace</span>
      </header>

      <main id="sign-in" className={s.main}>
        <section className={s.signIn} aria-labelledby="staff-title">
          <h1 id="staff-title">Sign in to<br /><span>your workspace.</span></h1>
          <p className={s.copy}>For the Dr. Shumard practice team.</p>

          <div className={s.card}>
            <form className={s.form} onSubmit={submitPassword} noValidate>
              {GOOGLE_CLIENT_ID && (
                <>
                  <div ref={googleBtnRef} className={s.google} />
                  <div className={s.divider}>or</div>
                </>
              )}

              <label htmlFor="staff-email" className={s.label}>Work email</label>
              <input
                id="staff-email"
                className={s.input}
                type="email"
                name="email"
                autoComplete="username"
                placeholder="name@drshumard.com"
                maxLength={254}
                value={email}
                onChange={(event) => { setEmail(event.target.value); setErrors({ ...errors, email: undefined }); }}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'staff-email-error' : undefined}
              />
              {errors.email && <p id="staff-email-error" className={s.error} role="alert"><CircleAlert size={16} aria-hidden="true" />{errors.email}</p>}

              <label htmlFor="staff-password" className={s.label}>Password</label>
              <div className={s.passwordField}>
                <input
                  id="staff-password"
                  className={s.input}
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setErrors({ ...errors, password: undefined }); }}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'staff-password-error' : undefined}
                />
                <button type="button" className={s.reveal} onClick={() => setShowPassword((v) => !v)} aria-label="Show password" aria-pressed={showPassword}>
                  {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
              {errors.password && <p id="staff-password-error" className={s.error} role="alert"><CircleAlert size={16} aria-hidden="true" />{errors.password}</p>}
              {notice && <p className={s.error} role="alert"><CircleAlert size={16} aria-hidden="true" />{notice}</p>}

              <button type="submit" className={s.primary} disabled={busy}>
                {busy ? 'Signing in…' : <>Sign in <ArrowRight size={18} aria-hidden="true" /></>}
              </button>
            </form>

            <div className={s.alternative}>
              <span className={s.altIcon}><KeyRound size={17} aria-hidden="true" /></span>
              <div><strong>Forgot your password?</strong><p>Ask an admin to reset it on the Team page.</p></div>
            </div>
          </div>

          <p className={s.patient}>Are you a patient? {patientLink}</p>
        </section>
      </main>

      <footer className={s.footer}>
        <span>A healthier tomorrow starts with you.</span>
        <a href="https://drshumardworkshop.com/contact-us" target="_blank" rel="noreferrer">Need a hand?</a>
      </footer>
    </div>
  );
}
