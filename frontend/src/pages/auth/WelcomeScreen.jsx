import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import portrait from '../checkout/dr-shumard-portrait.jpeg';
import s from './welcome.module.css';

const MESSAGES = [
  'Getting your portal ready…',
  'Putting your next steps in place…',
  'Your portal is ready. Make yourself at home.',
];
// Signing in, and new patients from /checkout: two seconds, then straight into the portal (user, 2026-09-28).
const BRIEF_READY_MS = 1600;
const BRIEF_TOTAL_MS = 2000;
// GHL signups: the prototype's full pace (and the account set up), then a moment on "ready" before the portal.
const FULL_HOLD_MS = 1200;

// The welcome between signing in / signing up and the portal — design: shumard-checkout-portal/app/welcome. There's
// nothing to click: once ready it calls `onDone` (the page heads into the portal). "Ready" also waits for the real work
// (`ready`: the account set up, or the patient's details loaded). No first name (GHL signups arrive without one) →
// a greeting that needs none.
export default function WelcomeScreen({ firstName, ready, error, brief, onDone }) {
  const [stage, setStage] = useState(0);
  const [paced, setPaced] = useState(false);

  useEffect(() => {
    if (brief) {
      const complete = window.setTimeout(() => setPaced(true), BRIEF_READY_MS);
      return () => window.clearTimeout(complete);
    }
    const preparing = window.setTimeout(() => setStage(1), 2800);
    const complete = window.setTimeout(() => setPaced(true), 5600);
    return () => {
      window.clearTimeout(preparing);
      window.clearTimeout(complete);
    };
  }, [brief]);

  const isReady = ready && paced && !error;
  const shown = isReady ? 2 : stage;

  useEffect(() => {
    if (!isReady) return undefined;
    const done = window.setTimeout(onDone, brief ? BRIEF_TOTAL_MS - BRIEF_READY_MS : FULL_HOLD_MS);
    return () => window.clearTimeout(done);
  }, [isReady, brief, onDone]);

  return (
    <section className={s.welcome} aria-labelledby="welcome-title">
      <div className={s.doctor}>
        <img src={portrait} alt="Dr. Jason Shumard" width={1000} height={1250} className={s.portrait} />
        <p>Dr. Jason Shumard, DC</p>
      </div>

      <h1 id="welcome-title">{firstName ? <>Welcome,<br /><span>{firstName}.</span></> : <>Hello there,<br /><span>welcome!</span></>}</h1>
      <p className={s.greeting}>We’re glad you’re here.</p>
      <p className={s.copy}>A little clarity. A plan for what’s next.<br />And support, every step of the way.</p>

      <div className={s.setup} data-ready={isReady} data-brief={brief ? 'true' : undefined} data-error={error ? 'true' : undefined}>
        <div className={s.track} aria-hidden="true">
          <span className={s.fill} />
        </div>
        <div className={s.status} role="status" aria-live="polite" aria-atomic="true">
          <span className={s.statusMark} aria-hidden="true">
            {isReady ? <Check size={15} strokeWidth={2} /> : <span className={s.statusDot} />}
          </span>
          <span key={error ? 'error' : shown} className={s.statusText}>{error || MESSAGES[shown]}</span>
        </div>
      </div>

      <div className={s.actionSpace}>
        {error ? (
          <Link to="/login" className={s.quietButton}>Go to sign in <ArrowRight size={13} /></Link>
        ) : (
          <p className={s.waiting}>Just a moment. We’ll take it from here.</p>
        )}
      </div>
    </section>
  );
}
