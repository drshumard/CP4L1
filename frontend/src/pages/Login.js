import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { OTPInput, REGEXP_ONLY_DIGITS } from 'input-otp';
import { ArrowLeft, ArrowRight, Check, CircleAlert, Clock3, Mail, Smartphone } from 'lucide-react';
import { getErrorMessage } from '../utils/errorHandler';
import { trackLogin, trackLoginFailed, trackPageView, trackButtonClicked } from '../utils/analytics';
import { safeSetItem } from '../utils/safeStorage';
import AuthFrame from './auth/AuthFrame';
import frame from './auth/welcome.module.css';
import s from './auth/sign-in.module.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const RESEND_SECONDS = 30;

// Sign in with a code — design: shumard-checkout-portal/app/sign-in. Patients always sign in with their email; "text"
// only changes where the code goes: a text to the mobile number already on their account. The email also carries a
// one-click link (/auto-login/:token), which lands on the same /welcome.
const content = {
  email: {
    intro: 'Enter the email you booked with, and we’ll send you a code and a link to sign in.',
    send: 'Email me a code',
    switchIcon: Smartphone,
    switchTitle: 'Prefer a text message?',
    switchCopy: 'We’ll text your code to the mobile number on your account.',
    switchAction: 'Text instead',
    inbox: 'email.',
    sent: 'We sent a code to',
    next: 'Enter it below, or open the link in that email.',
    delay: 'It can take a minute to arrive. Check your spam folder too.',
  },
  text: {
    intro: 'Enter the email you booked with, and we’ll text a code to the mobile number on your account.',
    send: 'Text me a code',
    switchIcon: Mail,
    switchTitle: 'Prefer email?',
    switchCopy: 'We’ll send a code and a link to your inbox.',
    switchAction: 'Email instead',
    inbox: 'phone.',
    sent: 'We texted a code to the mobile number linked to',
    next: 'Enter it below.',
    delay: 'Texts can take a minute to arrive.',
  },
};

function emailError(value) {
  if (!value) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return 'Enter a full email address, like name@example.com.';
  return null;
}

function Slot({ char, isActive, hasFakeCaret }) {
  return <div className={s.slot} data-active={isActive}>{char}{hasFakeCaret && <span className={s.caret} />}</div>;
}

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromBooking = searchParams.get('booking') === 'success' || searchParams.get('message') === 'booking_complete';
  const [method, setMethod] = useState('email');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState(null);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | checking | signed-in
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const fieldRef = useRef(null);
  const codeRef = useRef(null);
  const verifying = sentTo !== null;
  const copy = content[method];
  const SwitchIcon = copy.switchIcon;

  useEffect(() => {
    trackPageView('login');
    const previous = document.title;
    document.title = 'Sign In | Dr. Jason Shumard';
    if (fromBooking) {
      toast.success('Your consultation has been booked! Please sign in to continue.', { id: 'booking-login-prompt', duration: 6000 });
    }
    return () => { document.title = previous; };
  }, [fromBooking]);

  useEffect(() => {
    if (!verifying || resendIn === 0) return undefined;
    const tick = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(tick);
  }, [verifying, resendIn]);

  const focus = (ref) => requestAnimationFrame(() => ref.current?.focus());

  const switchMethod = () => {
    setMethod(method === 'email' ? 'text' : 'email');
    setError(null);
    focus(fieldRef);
  };

  // One email with a code + link, or a text to the phone on the account.
  const requestCode = async (value) => {
    if (method === 'email') {
      await axios.post(`${API}/auth/email/start`, { email: value });
      trackButtonClicked('email_signin_start', 'login_page');
    } else {
      await axios.post(`${API}/auth/otp/sms/send`, { email: value });
      trackButtonClicked('send_sms_code', 'login_page');
    }
  };

  const sendCode = async (event) => {
    event.preventDefault();
    const value = email.trim();
    const problem = emailError(value);
    setError(problem);
    if (problem) {
      focus(fieldRef);
      return;
    }
    setStatus('sending');
    try {
      await requestCode(value);
      setCode('');
      setNotice('');
      setSentTo(value);
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      // The server's own words: no account, no phone on file, too many tries, couldn't send.
      setError(getErrorMessage(err, 'We couldn’t send your code. Please try again.'));
      focus(fieldRef);
    } finally {
      setStatus('idle');
    }
  };

  const verify = async (value) => {
    if (value.length < 6) {
      setError('Enter all 6 digits of your code.');
      focus(codeRef);
      return;
    }
    setError(null);
    setNotice('');
    setStatus('checking');
    try {
      const res = await axios.post(`${API}/auth/${method === 'email' ? 'email/verify' : 'otp/sms/verify'}`, { email: sentTo, code: value });
      safeSetItem('access_token', res.data.access_token);
      safeSetItem('refresh_token', res.data.refresh_token);
      if (res.data.email) safeSetItem('user_email', res.data.email);
      trackLogin(res.data.user_id, res.data.email, method === 'email' ? 'email_code' : 'sms_otp');
      setStatus('signed-in');
      window.setTimeout(() => navigate(fromBooking ? `/welcome?next=${encodeURIComponent('/steps?booking=success')}` : '/welcome'), 800);
    } catch (err) {
      trackLoginFailed(sentTo, getErrorMessage(err, 'Verification failed'));
      setStatus('idle');
      setCode('');
      const code400 = err.response?.status === 400;
      // Only the email check says which it was; a text code comes back "invalid or expired".
      if (code400 && method === 'email' && /expired/i.test(err.response?.data?.detail || '')) {
        setError('That code has expired. Request a new one below.');
        setResendIn(0);
      } else if (code400) {
        setError('That code doesn’t match. Check the numbers and try again.');
      } else {
        setError(getErrorMessage(err, 'We couldn’t check your code. Please try again.'));
        if (err.response?.status === 429) setResendIn(0);
      }
      focus(codeRef);
    }
  };

  const resend = async () => {
    setCode('');
    setError(null);
    setStatus('sending');
    try {
      await requestCode(sentTo);
      setNotice(`We sent a new code to ${sentTo}.`);
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      setError(getErrorMessage(err, 'We couldn’t send a new code. Please try again.'));
    } finally {
      setStatus('idle');
      focus(codeRef);
    }
  };

  const changeEmail = () => {
    setSentTo(null);
    setCode('');
    setError(null);
    setNotice('');
    focus(fieldRef);
  };

  return (
    <AuthFrame mainId="sign-in" skipLabel="Skip to sign in">
      <section className={s.signIn} aria-labelledby="sign-in-title">
        <div key={verifying ? 'verify' : 'enter'} className={s.step}>
          <h1 id="sign-in-title">{verifying ? <>Check your<br /><span>{copy.inbox}</span></> : <>Sign in for<br /><span>your onboarding.</span></>}</h1>
          <p id="sign-in-copy" className={s.copy}>{verifying ? <>{copy.sent} <strong>{sentTo}</strong>. {copy.next}</> : copy.intro}</p>

          <div className={s.card} data-status={status}>
            <ol className={s.progress} aria-label="Sign in steps">
              <li aria-current={verifying ? undefined : 'step'}>
                {verifying ? <><Check size={13} strokeWidth={2.4} aria-hidden="true" /><span className="sr-only">Complete:</span></> : <span aria-hidden="true">01</span>}
                Your email
              </li>
              <li aria-current={verifying ? 'step' : undefined}><span aria-hidden="true">02</span>Your code</li>
            </ol>

            {verifying ? (
              <form className={s.form} onSubmit={(event) => { event.preventDefault(); verify(code); }} noValidate>
                <label htmlFor="code" className={s.label}>Verification code</label>
                <OTPInput
                  ref={codeRef}
                  id="code"
                  value={code}
                  onChange={(value) => { setCode(value); setError(null); }}
                  onComplete={verify}
                  maxLength={6}
                  pattern={REGEXP_ONLY_DIGITS}
                  pasteTransformer={(pasted) => pasted.replace(/\D/g, '')}
                  autoFocus
                  disabled={status !== 'idle'}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'sign-in-copy code-error' : 'sign-in-copy'}
                  containerClassName={s.code}
                  className={s.codeInput}
                  render={({ slots }) => (
                    <>
                      <div className={s.slots}>{slots.slice(0, 3).map((slot, index) => <Slot key={index} {...slot} />)}</div>
                      <span className={s.dash} aria-hidden="true" />
                      <div className={s.slots}>{slots.slice(3).map((slot, index) => <Slot key={index} {...slot} />)}</div>
                    </>
                  )}
                />
                {error && <p id="code-error" className={s.error} role="alert"><CircleAlert size={16} aria-hidden="true" />{error}</p>}
                <p className={s.status} role="status">{status === 'signed-in' ? 'You’re signed in. Opening your portal…' : notice}</p>
                <button type="submit" className={s.primary} disabled={status !== 'idle'}>
                  {status === 'checking' ? 'Checking your code…' : status === 'signed-in' ? <><Check size={18} aria-hidden="true" /> Signed in</> : <>Sign in <ArrowRight size={18} aria-hidden="true" /></>}
                </button>
              </form>
            ) : (
              <form className={s.form} onSubmit={sendCode} noValidate>
                <label htmlFor="email" className={s.label}>Email address</label>
                <input
                  ref={fieldRef}
                  id="email"
                  className={s.input}
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  maxLength={254}
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); setError(null); }}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'email-error' : undefined}
                  data-testid="email-input"
                />
                {error && <p id="email-error" className={s.error} role="alert"><CircleAlert size={16} aria-hidden="true" />{error}</p>}
                <button type="submit" className={s.primary} disabled={status === 'sending'} data-testid="continue-button">
                  {status === 'sending' ? 'Sending your code…' : <>{copy.send} <ArrowRight size={18} aria-hidden="true" /></>}
                </button>
              </form>
            )}

            <div className={s.alternative}>
              {verifying ? (
                <>
                  <span className={s.altIcon}><Clock3 size={17} aria-hidden="true" /></span>
                  <div><strong>Didn’t get it?</strong><p>{copy.delay}</p></div>
                  <button type="button" className={s.secondary} onClick={resend} disabled={resendIn > 0 || status !== 'idle'}>
                    {resendIn > 0 ? `Resend in 0:${String(resendIn).padStart(2, '0')}` : 'Resend code'}
                  </button>
                </>
              ) : (
                <>
                  <span className={s.altIcon}><SwitchIcon size={17} aria-hidden="true" /></span>
                  <div><strong>{copy.switchTitle}</strong><p>{copy.switchCopy}</p></div>
                  <button type="button" className={s.secondary} onClick={switchMethod} disabled={status !== 'idle'}>{copy.switchAction}</button>
                </>
              )}
            </div>
          </div>

          {verifying && (
            <button type="button" className={`${frame.quietButton} ${s.back}`} onClick={changeEmail} disabled={status !== 'idle'}><ArrowLeft size={13} aria-hidden="true" /> Use a different email</button>
          )}
        </div>
      </section>
    </AuthFrame>
  );
};

export default Login;
