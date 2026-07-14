import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, MessageSquare, ArrowLeft, ExternalLink, Check } from 'lucide-react';
import { getErrorMessage } from '../utils/errorHandler';
import { trackLogin, trackLoginFailed, trackPageView, trackButtonClicked } from '../utils/analytics';
import { safeSetItem } from '../utils/safeStorage';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function maskEmail(email) {
  try {
    const [local, domain] = email.split('@');
    return `${(local?.[0] || '') + '•••'}@${domain}`;
  } catch {
    return email;
  }
}

// Best-effort "open email app" target for common providers.
function inboxUrl(email) {
  const domain = (email.split('@')[1] || '').toLowerCase();
  if (domain.includes('gmail') || domain.includes('googlemail')) return 'https://mail.google.com/mail/u/0/#inbox';
  if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live') || domain.includes('msn')) return 'https://outlook.live.com/mail/0/inbox';
  if (domain.includes('yahoo')) return 'https://mail.yahoo.com/';
  if (domain.includes('icloud') || domain.includes('me.com') || domain.includes('mac.com')) return 'https://www.icloud.com/mail';
  if (domain.includes('proton')) return 'https://mail.proton.me/u/0/inbox';
  if (domain.includes('aol')) return 'https://mail.aol.com/';
  return null;
}

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [stage, setStage] = useState('request'); // request | check_email | sms_code
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false); // an email code is outstanding (still valid)
  const [phoneHint, setPhoneHint] = useState('');
  const [tryAnother, setTryAnother] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  const bookingSuccess = searchParams.get('booking') === 'success';
  const bookingMessage = searchParams.get('message') === 'booking_complete';

  useEffect(() => {
    trackPageView('login');
    if (bookingSuccess || bookingMessage) {
      toast.success('Your consultation has been booked! Please sign in to continue.', { id: 'booking-login-prompt', duration: 6000 });
    }
  }, [bookingSuccess, bookingMessage]);

  useEffect(() => {
    if (!notification) return undefined;
    const t = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(t);
  }, [notification]);

  const note = (type, message) => setNotification({ type, message });

  const finishLogin = (data, method) => {
    safeSetItem('access_token', data.access_token);
    safeSetItem('refresh_token', data.refresh_token);
    if (data.email) safeSetItem('user_email', data.email);
    trackLogin(data.user_id, data.email, method);
    note('success', 'Signed in!');
    setTimeout(() => navigate(bookingSuccess || bookingMessage ? '/steps?booking=success' : '/'), 500);
  };

  // ---- email channel ----
  const startEmail = async (e) => {
    e?.preventDefault();
    if (!email) return note('error', 'Please enter your email.');
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/email/start`, { email });
      trackButtonClicked('email_signin_start', 'login_page');
      setMaskedEmail(res.data?.masked_email || maskEmail(email));
      setCode('');
      setTryAnother(false);
      setEmailSent(true);
      setStage('check_email');
    } catch (err) {
      const s = err.response?.status;
      if (s === 404) note('error', "We couldn't find an account with that email. Use the email from your checkout.");
      else if (s === 429) note('error', 'Too many requests. Try again in a few minutes.');
      else if (s === 502) note('error', "We couldn't send the email right now. Please try again in a moment.");
      else note('error', getErrorMessage(err, 'Could not send the sign-in email.'));
    } finally {
      setLoading(false);
    }
  };

  const verifyEmailCode = async (value) => {
    const c = value ?? code;
    if (c.length !== 6) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/email/verify`, { email, code: c });
      finishLogin(res.data, 'email_code');
    } catch (err) {
      trackLoginFailed(email, getErrorMessage(err, 'Verification failed'));
      setCode('');
      const s = err.response?.status;
      if (s === 400) note('error', 'Incorrect or expired code. Try again or resend.');
      else if (s === 429) note('error', 'Too many attempts. Resend a new code.');
      else note('error', getErrorMessage(err, 'Verification failed.'));
    } finally {
      setLoading(false);
    }
  };

  // ---- SMS channel ----
  const sendSms = async () => {
    if (!email) return note('error', 'Please enter your email first.');
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/otp/sms/send`, { email });
      trackButtonClicked('send_sms_code', 'login_page');
      setPhoneHint(res.data?.phone_hint || '');
      setCode('');
      setStage('sms_code');
    } catch (err) {
      const s = err.response?.status;
      if (s === 404) note('error', "We couldn't find an account with that email.");
      else if (s === 409) note('error', 'No phone number is on file. Please use the email code instead.');
      else if (s === 503) note('error', 'SMS sign-in is unavailable. Use the email code instead.');
      else if (s === 429) note('error', 'Too many requests. Try again in a few minutes.');
      else note('error', getErrorMessage(err, 'Could not send the text code.'));
    } finally {
      setLoading(false);
    }
  };

  const verifySms = async (value) => {
    const c = value ?? code;
    if (c.length !== 6) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/otp/sms/verify`, { email, code: c });
      finishLogin(res.data, 'sms_otp');
    } catch (err) {
      trackLoginFailed(email, getErrorMessage(err, 'Verification failed'));
      setCode('');
      const s = err.response?.status;
      if (s === 400) note('error', 'Invalid or expired code. Try again or resend.');
      else note('error', getErrorMessage(err, 'Verification failed.'));
    } finally {
      setLoading(false);
    }
  };

  const otpSlots = (onComplete) => (
    <div className="flex justify-center">
      <InputOTP
        maxLength={6}
        value={code}
        onChange={(v) => { setCode(v); if (v.length === 6) onComplete(v); }}
        data-testid="otp-input"
      >
        <InputOTPGroup className="gap-2.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} className="otp-slot" />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-2 sm:p-4 md:p-6 lg:p-8 overflow-x-hidden"
      style={{ background: 'var(--brand-50)', fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="w-full h-full flex items-center justify-center overflow-x-hidden">
        <div className="grid md:grid-cols-2 bg-white overflow-hidden border border-[#d9eaf1] w-full max-w-7xl"
          style={{
            borderRadius: 14,
            boxShadow: '0 16px 40px rgba(47,70,83,0.12)',
            height: window.innerWidth < 768 ? 'auto' : 'calc(100vh - 4rem)',
            minHeight: window.innerWidth < 768 ? '100vh' : 'auto',
          }}>
          {/* Brand panel */}
          <div className="relative p-6 sm:p-8 md:p-12 lg:p-16 flex flex-col text-white overflow-hidden min-h-[300px] md:min-h-0"
            style={{
              backgroundImage: 'linear-gradient(150deg, rgba(74,122,143,0.88), rgba(47,70,83,0.94)), url("https://portal-drshumard.b-cdn.net/Honeycomb_mesh_with_brand_colors_202606220846.jpeg")',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}>
            <div className="relative z-10 flex flex-col flex-1">
              <img src="https://portal-drshumard.b-cdn.net/logo.png" alt="Dr. Shumard"
                className="h-12 md:h-16 lg:h-20 object-contain self-center md:self-start brightness-0 invert" />
              <div className="flex-1 flex flex-col justify-center mt-8 md:mt-0">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-3 md:mb-4 text-center" style={{ letterSpacing: '-0.02em' }}>Welcome to your onboarding portal</h1>
                <p className="text-base md:text-lg mb-6 text-center" style={{ color: 'var(--brand-100)' }}>Sign in to continue your onboarding journey.</p>
                <div className="space-y-3 hidden sm:block self-center">
                  {['Guided onboarding steps', 'Track your progress', 'Concierge support'].map((line) => (
                    <div key={line} className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,0.15)' }}>
                        <Check size={16} strokeWidth={2.5} />
                      </span>
                      <span className="text-sm md:text-base" style={{ color: 'var(--brand-100)' }}>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Form panel */}
          <div className="p-6 sm:p-8 md:p-10 lg:p-14 xl:p-16 flex flex-col justify-center overflow-y-auto">
            <div className="relative w-full">
              <AnimatePresence>
                {notification && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="absolute bottom-full inset-x-0 mb-3 z-10">
                    <div className="p-3 rounded-[7px] text-sm font-medium border shadow-sm"
                      style={notification.type === 'success'
                        ? { background: 'var(--brand-50)', borderColor: 'var(--brand-200)', color: 'var(--brand-800)' }
                        : { background: '#fff1f2', borderColor: '#fecdd3', color: '#be123c' }}>
                      {notification.message}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            {/* STAGE: request */}
            {stage === 'request' && (
              <form onSubmit={startEmail} data-testid="request-form">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: 'var(--brand-700)' }}>Onboarding</p>
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1" style={{ letterSpacing: '-0.01em' }}>Sign in</h2>
                <p className="text-[15px] text-slate-500 mb-7">Enter your email and we'll send a sign-in link and code.</p>

                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">Email</label>
                <input id="email" type="email" placeholder="you@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} autoComplete="email" required data-testid="email-input"
                  className="w-full h-12 px-4 text-[15px] border border-slate-200 rounded-[7px] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-100)]" />

                <button type="submit" disabled={loading} data-testid="continue-button"
                  className="brand-btn w-full h-12 mt-5 rounded-[7px] font-semibold text-[15px]">
                  {loading ? 'Sending…' : 'Continue'}
                </button>

                <div className="text-center mt-5">
                  <button type="button" onClick={sendSms} disabled={loading} data-testid="use-phone-instead"
                    className="brand-link text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                    <MessageSquare size={15} strokeWidth={1.75} /> Use phone instead
                  </button>
                </div>
              </form>
            )}

            {/* STAGE: check_email */}
            {stage === 'check_email' && (
              <div data-testid="check-email">
                <div className="w-11 h-11 rounded-full grid place-items-center mb-4" style={{ background: 'var(--brand-50)' }}>
                  <Mail size={20} strokeWidth={1.75} style={{ color: 'var(--brand-600)' }} />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">Check your email</h2>
                <p className="text-[15px] text-slate-500 mb-6">
                  We sent a sign-in link and code to <strong className="text-slate-700">{maskedEmail}</strong>.
                </p>

                <label className="block text-sm font-medium text-slate-700 mb-3 text-center">Enter the 6-digit code</label>
                <div className="mb-3">{otpSlots(verifyEmailCode)}</div>
                {loading && <p className="text-sm text-slate-400 mb-4 text-center">Verifying…</p>}

                <button type="button" onClick={() => verifyEmailCode()} disabled={loading || code.length !== 6}
                  className="brand-btn w-full h-12 mt-3 rounded-[7px] font-semibold text-[15px]" data-testid="verify-email-code">
                  {loading ? 'Verifying…' : 'Verify and sign in'}
                </button>

                <div className="flex items-center justify-between mt-4 text-sm">
                  {inboxUrl(email) ? (
                    <a href={inboxUrl(email)} target="_blank" rel="noreferrer"
                      className="brand-link font-medium inline-flex items-center gap-1.5">
                      <ExternalLink size={15} strokeWidth={1.75} /> Open email app
                    </a>
                  ) : <span />}
                  <button type="button" onClick={startEmail} disabled={loading}
                    className="text-slate-500 hover:text-slate-800 font-medium disabled:opacity-50" data-testid="resend-email">
                    Didn't get it? Resend
                  </button>
                </div>

                <div className="border-t border-slate-100 mt-6 pt-5">
                  {!tryAnother ? (
                    <button type="button" onClick={() => setTryAnother(true)}
                      className="text-sm text-slate-500 hover:text-slate-800 font-medium" data-testid="try-another-way">
                      Try another way
                    </button>
                  ) : (
                    <button type="button" onClick={sendSms} disabled={loading}
                      className="w-full h-11 rounded-[7px] border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
                      data-testid="text-me-instead">
                      <MessageSquare size={16} strokeWidth={1.75} /> Text me a code instead
                    </button>
                  )}
                </div>

                <button type="button" onClick={() => { setStage('request'); setCode(''); setEmailSent(false); }}
                  className="mt-5 text-sm text-slate-400 hover:text-slate-700 inline-flex items-center gap-1.5" data-testid="edit-email">
                  <ArrowLeft size={15} strokeWidth={1.75} /> Use a different email
                </button>
              </div>
            )}

            {/* STAGE: sms_code */}
            {stage === 'sms_code' && (
              <div data-testid="sms-code">
                <div className="w-11 h-11 rounded-full grid place-items-center mb-4" style={{ background: 'var(--brand-50)' }}>
                  <MessageSquare size={20} strokeWidth={1.75} style={{ color: 'var(--brand-600)' }} />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">Enter the text code</h2>
                <p className="text-[15px] text-slate-500 mb-6">
                  We texted a 6-digit code to the phone on file{phoneHint ? <> (<strong className="text-slate-700">{phoneHint}</strong>)</> : ''}.
                </p>

                <div className="mb-2">{otpSlots(verifySms)}</div>

                <button type="button" onClick={() => verifySms()} disabled={loading || code.length !== 6}
                  className="brand-btn w-full h-12 mt-4 rounded-[7px] font-semibold text-[15px]" data-testid="verify-sms-code">
                  {loading ? 'Verifying…' : 'Verify and sign in'}
                </button>

                <div className="flex items-center justify-between mt-4 text-sm">
                  <button type="button" onClick={() => { setStage(emailSent ? 'check_email' : 'request'); setCode(''); }}
                    className="text-slate-500 hover:text-slate-800 font-medium inline-flex items-center gap-1.5" data-testid="back-from-sms">
                    <ArrowLeft size={15} strokeWidth={1.75} /> {emailSent ? 'Use email code' : 'Use email'}
                  </button>
                  <button type="button" onClick={sendSms} disabled={loading}
                    className="brand-link font-medium disabled:opacity-50" data-testid="resend-sms">
                    Resend code
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
