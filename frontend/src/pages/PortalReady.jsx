import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, CircleHelp, ClipboardCheck, Clock3, ExternalLink, Loader2, LockKeyhole, Mail,
  Play, ShieldCheck, Utensils, Video,
} from 'lucide-react';
import { formatInTz, safeTimezone } from '../utils/tz';
import { loadPortal, stashWelcomeData } from '../utils/welcomePrefetch';
import logo from './checkout/dr-shumard-logo.png';
import frame from './auth/welcome.module.css';
import s from './PortalReady.module.css';

// Step 3 — design: shumard-checkout-portal/app/onboarding-complete. Activate the health record (Practice Better),
// see the add-ons it unlocks and the booked session; then finish onboarding (step 3 → 4, /outcome).

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PB_PORTAL_BASE = 'https://drshumard.practicebetter.io';

// Per-patient Practice Better activation deep-link — the same computation the booking email uses:
// activationId = (record id as hex) + 4, hex, zero-padded to the record id's length. Falls back to
// the PRACTICE's patient portal login when we don't have the patient's record id yet — NEVER
// my.practicebetter.io, which is PB's practitioner-side entry (patients end up creating a
// practitioner account).
function pbActivateUrl(recordId) {
  if (!recordId) return PB_PORTAL_BASE;
  try {
    const activationId = (BigInt('0x' + recordId) + 4n).toString(16).padStart(recordId.length, '0');
    return `${PB_PORTAL_BASE}/#/u/activate/${activationId}`;
  } catch {
    return PB_PORTAL_BASE;
  }
}

const statuses = ['Session booked', 'Details complete', 'Add-ons ready'];

// Free resources delivered inside the Practice Better patient portal — only visible once the patient has activated.
const addOns = [
  { icon: Play, type: 'Video series', title: '3 Foundations to Boosting Your Health', description: 'A practical series to help you build strong, sustainable foundations.', tone: 'blue' },
  { icon: BookOpen, type: 'Digital book', title: 'How to Reverse Your Diabetes', description: 'Dr. Shumard’s guide to understanding the path ahead.', tone: 'aqua' },
  { icon: Utensils, type: '7-day recipe challenge', title: 'Reduce Blood Sugars', description: 'Simple recipes and daily guidance you can put into practice.', tone: 'yellow' },
];

const nextSteps = [
  { title: 'Open your invitation', copy: 'Use the email sent by the health record system.' },
  { title: 'Create your login', copy: 'Choose a password and confirm your details.' },
  { title: 'Access your add-ons', copy: 'Your resources will be waiting inside.' },
];

const openSupport = () => window.dispatchEvent(new Event('open-support'));
// Desktop: at the top of the side column, flush with the activation card (user, 2026-09-28); stacked: under the hero.
const StatusList = ({ className }) => (
  <ul className={className} aria-label="Onboarding status">
    {statuses.map((status) => <li key={status}><Check size={14} strokeWidth={2.4} aria-hidden="true" />{status}</li>)}
  </ul>
);

export default function PortalReady() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [appt, setAppt] = useState(null);
  const [finishing, setFinishing] = useState(false);

  // Completes the journey (step 3 -> 4) and unlocks /outcome. Re-checks the server-side
  // step first: the route guard fails open on network errors, and advance-step blindly
  // increments — without this check an out-of-sync user could get bumped past a step
  // they never finished.
  const finishOnboarding = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const h = { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } };
      const p = await axios.get(`${API}/user/progress`, h);
      const cs = p.data?.current_step;
      if (cs === 4) { navigate('/outcome'); return; }
      if (cs !== 3) { navigate('/dashboard'); return; }
      await axios.post(`${API}/user/advance-step`, {}, h);
      // /outcome's details load while "Finishing…" shows, so it opens complete (utils/welcomePrefetch).
      await loadPortal().then(stashWelcomeData, () => {});
      navigate('/outcome');
    } catch {
      toast.error("We couldn't finish this step - please try again.", { id: 'ready-finish' });
      setFinishing(false);
    }
  };

  useEffect(() => {
    const previous = document.title;
    document.title = 'Onboarding Complete | Dr. Jason Shumard';
    (async () => {
      try {
        const token = localStorage.getItem('access_token');
        const h = { headers: { Authorization: `Bearer ${token}` } };
        const [u, a] = await Promise.all([
          axios.get(`${API}/user/me`, h),
          axios.get(`${API}/user/appointment`, h).catch(() => ({ data: { appointment: null } })),
        ]);
        setUser(u.data);
        setAppt(a.data?.appointment || null);
      } catch (e) {
        if (e.response?.status === 401) { localStorage.clear(); navigate('/login'); }
        else toast.error('Failed to load this page', { id: 'ready-load' });
      }
    })();
    return () => { document.title = previous; };
  }, [navigate]);

  const sessionDate = appt?.session_date ? new Date(appt.session_date) : null;
  const validDate = sessionDate && !Number.isNaN(sessionDate.getTime());
  const tz = safeTimezone(appt?.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const director = appt?.director_name || appt?.director || 'Dr. Shumard';
  const durationMin = appt?.duration_minutes || appt?.duration || 30;
  const sessionTitle = appt?.session_title || 'Strategy Session';

  return (
    <div className={`${frame.page} ${s.page}`}>
      <a href="#activation" className={frame.skipLink}>Skip to activation</a>
      <header className={frame.header}>
        <Link to="/dashboard" aria-label="Dr. Shumard portal overview">
          <img src={logo} alt="Dr. Shumard" width={1024} height={152} className={frame.logo} />
        </Link>
        <Link to="/dashboard" className={s.back}><ArrowLeft size={15} aria-hidden="true" /><span className="sr-only">Back to </span>Overview</Link>
      </header>

      <main className={s.main}>
        <section className={s.hero} aria-labelledby="completion-title">
          <div>
            <h1 id="completion-title">Congratulations on&nbsp;completing<br /><span>your onboarding.</span></h1>
            <p className={s.lead}>Activate the <strong>Electronic Health Record System</strong> to access the add-ons with your purchase.</p>
          </div>
          <StatusList className={`${s.status} ${s.heroStatus}`} />
        </section>

        <div className={s.grid} data-appointment={appt ? 'true' : undefined}>
          <section id="activation" className={`${s.card} ${s.activationCard}`} aria-labelledby="activation-title">
            <div className={s.activation}>
              <span className={s.iconBox}><LockKeyhole size={19} aria-hidden="true" /></span>
              <div>
                <span className={s.kicker}>One final step</span>
                <h2 id="activation-title" className={s.title}>Activate your health record access</h2>
                <p className={s.body}>Use the secure invitation sent to your email to create your account and unlock everything below.</p>
              </div>
            </div>

            <div className={s.included}>
              <div><span className={s.kicker}>Included with your purchase</span><h2 className={s.subtitle}>Your add-ons are ready</h2></div>
              <span className={s.count}>3 included</span>
            </div>
            <ul className={s.addOns}>
              {addOns.map(({ icon: Icon, type, title, description, tone }) => (
                <li key={title}>
                  <span className={s.iconBox} data-tone={tone}><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
                  <div><span className={s.kicker}>{type}</span><h3>{title}</h3><p>{description}</p></div>
                  <span className={s.badge}><Check size={12} strokeWidth={2.4} aria-hidden="true" /> Included</span>
                </li>
              ))}
            </ul>

            <div className={s.actions}>
              <a href={pbActivateUrl(user?.pb_client_record_id)} target="_blank" rel="noreferrer" className={s.primary}>
                Activate Electronic Health Record <ExternalLink size={18} aria-hidden="true" />
              </a>
              <p className={s.hint}><Mail size={15} aria-hidden="true" /> Look for the activation email in your inbox or spam folder.</p>
            </div>
          </section>

          <section className={`${s.card} ${s.finish}`} aria-labelledby="finish-title">
            <span className={s.iconBox} data-tone="neutral"><ClipboardCheck size={19} aria-hidden="true" /></span>
            <div>
              <span className={s.kicker}>One last thing</span>
              <h2 id="finish-title" className={s.title}>Health record activated?</h2>
              <p className={s.body}>Mark your onboarding complete to see how to prepare for your call.</p>
              <button type="button" className={s.secondary} onClick={finishOnboarding} disabled={finishing}>
                {finishing
                  ? <><Loader2 size={17} className={s.spin} aria-hidden="true" /> Finishing…</>
                  : <>I’m ready — finish my onboarding <ArrowRight size={17} aria-hidden="true" /></>}
              </button>
            </div>
          </section>

          <aside className={s.aside} aria-label="Appointment and support">
            <StatusList className={`${s.status} ${s.asideStatus}`} />
            {appt && (
              <section className={s.card} aria-labelledby="appointment-title">
                <div className={s.cardHeader}><span className={s.kicker}>Your next appointment</span><span className={s.badge}><Check size={12} strokeWidth={2.4} aria-hidden="true" /> Confirmed</span></div>
                <div className={s.cardBody}>
                  <h2 id="appointment-title" className={s.cardTitle}>{sessionTitle}</h2>
                  <p className={s.duration}>{durationMin}-minute private session · with {director}</p>
                  {validDate && (
                    <div className={s.when}>
                      <Clock3 size={17} aria-hidden="true" />
                      <div>
                        <span className={s.kicker}>When</span>
                        <strong>{formatInTz(sessionDate, tz, { weekday: 'long', month: 'long', day: 'numeric' })}</strong>
                        <span className={s.time}>{formatInTz(sessionDate, tz, { hour: 'numeric', minute: '2-digit' })}</span>
                        {appt.meet_link && <a className={s.meetLink} href={appt.meet_link} target="_blank" rel="noreferrer"><Video size={14} aria-hidden="true" /> Join with Google Meet</a>}
                      </div>
                    </div>
                  )}
                  {!validDate && appt.meet_link && (
                    <a className={s.meetLink} href={appt.meet_link} target="_blank" rel="noreferrer"><Video size={14} aria-hidden="true" /> Join with Google Meet</a>
                  )}
                </div>
              </section>
            )}

            <section className={`${s.card} ${s.stepsCard}`} aria-labelledby="next-steps-title">
              <div className={s.cardHeader}><h2 id="next-steps-title" className={s.kicker}>What happens next</h2></div>
              <ol className={s.steps}>
                {nextSteps.map(({ title, copy }, index) => <li key={title}><span aria-hidden="true">0{index + 1}</span><p><strong>{title}</strong>{copy}</p></li>)}
              </ol>
            </section>

            <section className={s.support} aria-labelledby="support-title">
              <span className={s.iconBox} data-tone="neutral"><CircleHelp size={18} aria-hidden="true" /></span>
              <div>
                <h2 id="support-title">Need a hand?</h2>
                <p>Can’t find your invitation or unsure about a step? Our team can help.</p>
                <button type="button" onClick={openSupport}>Contact support <ArrowRight size={15} aria-hidden="true" /></button>
              </div>
            </section>
          </aside>
        </div>
      </main>

      <footer className={frame.footer}>
        <span className={s.secure}><ShieldCheck size={14} aria-hidden="true" /> Your information is handled securely.</span>
        <button type="button" onClick={openSupport}>Support</button>
      </footer>
    </div>
  );
}
