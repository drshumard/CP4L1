import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCheck, CircleHelp, Clock, LockKeyhole } from 'lucide-react';
import logo from './dr-shumard-logo.png';
import './checkout.css';

// Stripe's return_url after payment (/checkout/complete?session_id=...). The booking is made by the
// Stripe webhook, never here: this page polls GET /api/checkout/status until the order is fulfilled,
// then signs a brand-new patient in and sends them on (Step 2, or Step 1 if their time was taken).

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmtSlot = (iso, tz) => {
  try {
    return new Date(iso).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz || undefined, timeZoneName: 'short' });
  } catch { return ''; }
};

export default function CheckoutComplete() {
  const [status, setStatus] = useState({ state: 'confirming' });

  useEffect(() => {
    const prev = document.title;
    document.title = 'Your Strategy Session | Dr. Jason Shumard';
    const sessionId = new URLSearchParams(window.location.search).get('session_id');
    if (!sessionId) { setStatus({ state: 'missing' }); return () => { document.title = prev; }; }
    let stopped = false;
    let tries = 0;
    const poll = async () => {
      tries += 1;
      try {
        const res = await fetch(`${API}/checkout/status?session_id=${encodeURIComponent(sessionId)}`);
        const body = await res.json().catch(() => ({}));
        if (stopped) return;
        if (!res.ok) { setStatus({ state: res.status === 404 ? 'missing' : 'error' }); return; }
        setStatus(body);
        if (body.state === 'fulfilled' && body.login === 'tokens') {
          localStorage.setItem('access_token', body.access_token);
          localStorage.setItem('refresh_token', body.refresh_token);
          localStorage.setItem('user_email', body.email || '');
          // A full page load into the portal: nothing from the checkout page comes along.
          setTimeout(() => window.location.replace(body.outcome === 'needs_new_time' ? '/book' : '/forms'), 2500);
        } else if (body.state === 'confirming' || body.state === 'processing') {
          if (tries < 60) setTimeout(poll, body.state === 'processing' ? 5000 : 1500);
          else setStatus({ state: 'slow' });
        }
      } catch {
        if (!stopped && tries < 60) setTimeout(poll, 3000);
      }
    };
    poll();
    return () => { stopped = true; document.title = prev; };
  }, []);

  const { state, outcome, login } = status;
  const when = status.slot_start_utc ? fmtSlot(status.slot_start_utc, status.patient_timezone) : '';
  let icon = <Clock size={28} />;
  let title = 'Confirming your booking…';
  let text = 'This only takes a few seconds. Please keep this page open.';
  let action = null;
  const signIn = <a className="primary-button" href="/login">Sign in to continue<ArrowRight size={17} /></a>;
  if (state === 'fulfilled' && outcome === 'needs_new_time') {
    icon = <CheckCheck size={28} />;
    title = 'Payment received.';
    text = 'The time you picked was just taken, so the next step is choosing another time that suits you.';
    action = login === 'tokens' ? <p className="under-button">Taking you to pick a new time…</p> : signIn;
  } else if (state === 'fulfilled') {
    icon = <CheckCheck size={28} />;
    title = 'You’re booked.';
    text = `${when ? `${when} · ` : ''}30-minute video call. We’ve emailed your confirmation and next steps.`;
    action = login === 'tokens' ? <p className="under-button">Taking you to your next step…</p> : signIn;
  } else if (state === 'processing') {
    text = 'Your payment is still processing. We’ll email you as soon as it clears and your time is confirmed.';
  } else if (state === 'unpaid' || state === 'expired') {
    icon = <LockKeyhole size={28} />;
    title = 'Your payment wasn’t completed.';
    text = 'No charge was made. You can go back and try again.';
    action = <a className="primary-button" href="/checkout">Back to the checkout<ArrowRight size={17} /></a>;
  } else if (state === 'slow') {
    text = 'We’re still confirming your payment. You’ll get an email as soon as your booking is confirmed.';
  } else if (state === 'missing' || state === 'error') {
    icon = <CircleHelp size={28} />;
    title = 'We couldn’t find this checkout.';
    text = 'If you completed a payment, please contact us and we’ll sort it out right away.';
    action = <a className="primary-button" href="https://drshumardworkshop.com/contact-us">Contact the team<ArrowRight size={17} /></a>;
  }

  return <div className="co min-h-screen">
    <header className="site-header"><div className="header-inner">
      <a href="/checkout" className="brand" aria-label="Dr. Jason Shumard — back to the start of checkout"><img src={logo} alt="Dr. Shumard" width={1024} height={152} className="brand-logo" /></a>
      <a className="help-link" href="https://drshumardworkshop.com/contact-us" target="_blank" rel="noreferrer"><CircleHelp size={17} /><span>Need help?</span></a>
    </div></header>
    <main className="page-shell">
      <div className="complete-shell">
        <div className="checkout-card">
          <div className="confirmation" role="status" aria-live="polite">
            <div className="confirmation-icon">{icon}</div>
            <h3>{title}</h3>
            <p>{text}</p>
            {action}
          </div>
          <div className="checkout-footer"><span><LockKeyhole size={15} /> Private &amp; secure</span><span className="powered-by">Payments by <strong>stripe</strong></span></div>
        </div>
      </div>
    </main>
  </div>;
}
