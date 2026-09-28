import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowRight, CalendarPlus, Check, ClipboardList, Clock3, FileHeart, Gift, LockKeyhole, Mail, MessageCircle, Sparkles, Video,
} from 'lucide-react';
import { trackDashboardViewed, trackButtonClicked } from '../utils/analytics';
import { formatInTz, safeTimezone } from '../utils/tz';
import { clearWelcomeData, peekWelcomeData } from '../utils/welcomePrefetch';
import { PatientFooter, PatientHeader, openSupport } from './PatientShell';
import PatientSkeleton from './PatientSkeleton';
import styles from './PortalDashboard.module.css';

// Patient dashboard (/ and /dashboard). Design: shumard-checkout-portal/app/dashboard (a step-3 snapshot); here
// every journey step (1 book → 2 health profile → 3 access add-ons → 4 done) gets its own next-step card, and the
// session card shows the real booking.

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// \u2060 (word joiner): on phones "Access add-ons" wraps before "add-ons", never at its hyphen.
const STEP_LABELS = [['Book your session', 'Session booked'], ['Health profile', 'Health profile'], ['Access add-\u2060ons', 'Add-ons ready']];

// What the "Your next step" card says at each journey step.
const NEXT_STEP = {
  1: {
    status: 'Let’s get started', intro: 'Let’s get your strategy session booked.',
    title: 'Book your strategy session.', copy: 'Choose a time that suits you for your private, one-to-one consultation.',
    cta: 'Book your session', to: '/book', track: 'continue_journey',
    items: [
      [CalendarPlus, 'Pick a date and time', 'See live availability in your own time zone.'],
      [Video, 'Meet online', 'Your session takes place on Google Meet.'],
    ],
  },
  2: {
    status: 'You’re on your way', intro: 'Your session is booked. Next, your health profile.',
    title: 'Complete your health profile.', copy: 'A few questions about your health so your session can focus on what matters most to you.',
    cta: 'Continue your health profile', to: '/forms', track: 'continue_journey',
    note: 'Your session is booked.',
    items: [
      [ClipboardList, 'Your health history', 'Your conditions, medications and goals.'],
      [LockKeyhole, 'Private and secure', 'Shared only with your care team.'],
    ],
  },
  3: {
    status: 'Ready for your consultation', intro: 'You’re ready for your consultation, and your add-ons are ready for you too.',
    title: 'Access your add-ons.',
    copy: 'You’ve completed everything you need for your consultation. Now activate your Health Record System to access the extras included with your purchase.',
    cta: 'Activate your Health Record System', to: '/ready', track: 'continue_journey',
    note: 'Your booking and health profile are complete — you’re all set for your consultation.',
    items: [
      [LockKeyhole, 'One secure home for your health', 'Your health information and your add-ons, all in one place.'],
      [Gift, 'Access your add-ons', 'Your video series, Dr. Shumard’s book, and the 7-day recipe challenge.'],
    ],
  },
  4: {
    status: 'You’re all set', intro: 'You’re ready for your consultation and you have access to your add-ons.',
    label: 'You’re ready', title: 'You’re all set.',
    copy: 'Everything is in place for your strategy session, and your add-ons are waiting in your Health Record System.',
    cta: 'View your session details', to: '/outcome', track: 'view_achievement',
    note: 'Your booking, health profile and add-ons are all set.',
    items: [
      [Sparkles, 'Your add-ons', 'Your video series, digital book, and recipe challenge are in your Health Record System.'],
    ],
  },
};

const sessionTopics = [
  { icon: MessageCircle, title: 'Time to be heard', copy: 'Talk through your health, your questions, and what matters most to you.' },
  { icon: FileHeart, title: 'A clearer understanding', copy: 'Explore your health assessment and the factors affecting your metabolic health.' },
  { icon: ClipboardList, title: 'A plan that’s personal', copy: 'Leave with practical next steps built around your individual needs.' },
];

export default function PortalDashboard() {
  const navigate = useNavigate();
  // Straight from the welcome, everything's already loaded (utils/welcomePrefetch) — the dashboard shows at once.
  const [primed] = useState(() => peekWelcomeData());
  const [user, setUser] = useState(primed?.user ?? null);
  const [progress, setProgress] = useState(primed?.progress ?? null);
  const [appt, setAppt] = useState(primed?.appointment ?? null);
  const [loading, setLoading] = useState(!primed);

  useEffect(() => {
    if (primed) { clearWelcomeData(); trackDashboardViewed(primed.user?.current_step); return; }
    (async () => {
      try {
        const token = localStorage.getItem('access_token');
        const h = { headers: { Authorization: `Bearer ${token}` } };
        const [u, p, a] = await Promise.all([
          axios.get(`${API}/user/me`, h),
          axios.get(`${API}/user/progress`, h),
          axios.get(`${API}/user/appointment`, h).catch(() => ({ data: { appointment: null } })),
        ]);
        setUser(u.data);
        setProgress(p.data);
        setAppt(a.data?.appointment || null);
        trackDashboardViewed(u.data?.current_step);
      } catch (e) {
        if (e.response?.status === 401) { localStorage.clear(); navigate('/login'); }
        else toast.error('Failed to load your dashboard', { id: 'dash-load' });
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, primed]);

  if (loading) {
    return <PatientSkeleton label="Loading your dashboard…" />;
  }

  const step = Math.min(Math.max(progress?.current_step ?? 1, 1), 4);
  const next = NEXT_STEP[step];
  const done = step - 1;                       // steps completed (of 3)
  const firstName = (user?.name || '').trim().split(' ')[0] || 'there';
  const goNext = () => { trackButtonClicked(next.track, 'dashboard'); navigate(next.to); };

  // ----- the booked session, in the patient's zone -----
  const sessionDate = appt?.session_date ? new Date(appt.session_date) : null;
  const validDate = sessionDate && !Number.isNaN(sessionDate.getTime());
  // Resolve the zone once (invalid stored zones fall back to the browser's) so the label names the zone used.
  const tz = safeTimezone(appt?.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  const fmt = (opts) => (validDate ? formatInTz(sessionDate, tz, opts) : '');
  const tzLabel = tz.split('/').pop().replace(/_/g, ' ');
  const gcalUrl = () => {
    const end = new Date(sessionDate.getTime() + 30 * 60000);
    const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Strategy Session with Dr. Shumard')}&dates=${f(sessionDate)}/${f(end)}`;
  };

  return (
    <div className={styles.page}>
      <a href="#dashboard-main" className={styles.skipLink}>Skip to dashboard</a>
      <PatientHeader user={user} current="overview" />

      <main id="dashboard-main" className={styles.main}>
        <div className={styles.welcome}>
          <div>
            <h1>Welcome back, {firstName}<span>.</span></h1>
            <p>{next.intro}</p>
          </div>
          <div className={styles.welcomeStatus}>
            {done > 0 && <span className={styles.checkCircle}><Check size={15} aria-hidden="true" /></span>} {next.status}
          </div>
        </div>

        <div className={styles.mainGrid}>
          <section className={styles.preparation} aria-labelledby="preparation-title">
            <div className={styles.preparationHeader}>
              <h2>Your preparation</h2>
              <span>{Math.min(done, 3)} of 3 steps complete</span>
            </div>
            <ol className={styles.steps} aria-label="Preparation progress">
              {STEP_LABELS.map(([todo, complete], i) => (i + 1 < step
                ? <li key={todo}><span className={styles.stepCircle}><Check size={18} aria-hidden="true" /><span className="sr-only">Complete:</span></span><span>{complete}</span></li>
                : <li key={todo} aria-current={i + 1 === step ? 'step' : undefined}><span className={styles.stepCircle}>{i + 1}</span><span>{todo}</span></li>))}
            </ol>

            <div className={styles.nextStep}>
              <span className={styles.nextLabel}>{next.label || 'Your next step'}</span>
              <h3 id="preparation-title">{next.title}</h3>
              <p>{next.copy}</p>
              <button type="button" onClick={goNext} className={styles.primaryButton}>{next.cta} <ArrowRight size={19} aria-hidden="true" /></button>
              <ul className={styles.preparationList}>
                {next.items.map(([Icon, title, copy]) => (
                  <li key={title}><span><Icon size={19} aria-hidden="true" /></span><div><strong>{title}</strong><p>{copy}</p></div></li>
                ))}
              </ul>
            </div>
            {next.note && <div className={styles.preparationNote}><Check size={16} aria-hidden="true" /><p>{next.note}</p></div>}
          </section>

          <aside className={styles.aside} aria-label="Your appointment and support">
            <section id="next-session" className={styles.appointment} aria-labelledby="appointment-title">
              <div className={styles.appointmentHeader}>
                <h2 id="appointment-title">Your next session</h2>
                {(appt || step > 1) && <span className={styles.confirmed}><Check size={14} aria-hidden="true" /> Confirmed</span>}
              </div>
              {validDate ? (
                <>
                  <div className={styles.dateRow}>
                    <div className={styles.dateTile} aria-hidden="true"><span>{fmt({ month: 'short' }).toUpperCase()}</span><strong>{fmt({ day: 'numeric' })}</strong></div>
                    <div><h3>{fmt({ weekday: 'long', month: 'long', day: 'numeric' })}</h3><p>{fmt({ hour: 'numeric', minute: '2-digit' })} <span>· {tzLabel} time</span></p></div>
                  </div>
                  <ul className={styles.sessionDetails}>
                    <li><Clock3 size={18} aria-hidden="true" /><span>30-minute private consultation</span></li>
                    <li><Video size={18} aria-hidden="true" /><span>Online via Google Meet</span></li>
                  </ul>
                  <div className={styles.emailNote}><Mail size={17} aria-hidden="true" /><p>Your meeting link is in your confirmation email.</p></div>
                  {appt.meet_link && (
                    <a className={styles.secondaryButton} href={appt.meet_link} target="_blank" rel="noreferrer"><Video size={18} aria-hidden="true" /> Join with Google Meet</a>
                  )}
                  <a className={styles.secondaryButton} href={gcalUrl()} target="_blank" rel="noreferrer"><CalendarPlus size={18} aria-hidden="true" /> Add to calendar</a>
                </>
              ) : step > 1 ? (
                <>
                  <p className={styles.notBooked}>Your session is booked. The date, time and meeting link are in your confirmation email.</p>
                  <div className={styles.emailNote} style={{ marginTop: 16 }}><Mail size={17} aria-hidden="true" /><p>Can’t find it? Check your spam folder, or ask us below.</p></div>
                </>
              ) : (
                <>
                  <p className={styles.notBooked}>You haven’t booked your strategy session yet. Choose a time that suits you — it only takes a minute.</p>
                  <button type="button" className={styles.secondaryButton} onClick={goNext}><CalendarPlus size={18} aria-hidden="true" /> Book your session</button>
                </>
              )}
            </section>
            <section className={styles.help} aria-labelledby="help-title">
              <span className={styles.helpIcon}><MessageCircle size={21} aria-hidden="true" /></span>
              <div>
                <h2 id="help-title">A little help along the way?</h2>
                <p>Our team is here for questions about your booking, your health profile or your add-ons.</p>
                <a href="#support" onClick={(e) => { e.preventDefault(); openSupport(); }}>Contact support <ArrowRight size={16} aria-hidden="true" /></a>
              </div>
            </section>
          </aside>
        </div>

        <section className={styles.expectations} aria-labelledby="expectations-title">
          <div className={styles.expectationsHeader}><h2 id="expectations-title">A conversation built around you.</h2><p>What to expect from your strategy session</p></div>
          <div className={styles.topicGrid}>
            {sessionTopics.map(({ icon: Icon, title, copy }) => <article className={styles.topic} key={title}><Icon size={24} strokeWidth={1.6} aria-hidden="true" /><h3>{title}</h3><p>{copy}</p></article>)}
          </div>
        </section>
      </main>

      <PatientFooter />
    </div>
  );
}
