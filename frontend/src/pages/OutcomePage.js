import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Check, Clock3, ShieldCheck, Video } from 'lucide-react';
import { formatInTz, safeTimezone } from '../utils/tz';
import { clearWelcomeData, peekWelcomeData } from '../utils/welcomePrefetch';
import { Bone } from './PatientSkeleton';
import logo from './checkout/dr-shumard-logo.png';
import frame from './auth/welcome.module.css';
import s from './OutcomePage.module.css';

// Step 4, onboarding done — design: shumard-checkout-portal/app/onboarding-complete (redesigned 2026-09-28): one calm
// column with the booked strategy session. Kept from the old page: the Join link and support (the footer's Support
// opens the pop-up).

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const openSupport = () => window.dispatchEvent(new Event('open-support'));

// The welcome frame's header and footer, shared by the page and its skeleton.
function Frame({ children }) {
  return (
    <div className={`${frame.page} ${s.page}`}>
      <a href="#main" className={frame.skipLink}>Skip to content</a>
      <header className={frame.header}>
        <Link to="/dashboard" aria-label="Dr. Shumard portal overview">
          <img src={logo} alt="Dr. Shumard" width={1024} height={152} className={frame.logo} />
        </Link>
        <Link to="/dashboard" className={s.back}><ArrowLeft size={15} aria-hidden="true" /><span className="sr-only">Back to </span>Overview</Link>
      </header>
      {children}
      <footer className={frame.footer}>
        <span className={s.secure}><ShieldCheck size={14} aria-hidden="true" /> Your information is handled securely.</span>
        <button type="button" onClick={openSupport}>Support</button>
      </footer>
    </div>
  );
}

// Loading — the page's own, and the route's journey check on the way here (App.js) — so the frame never changes.
export function OutcomeSkeleton() {
  return (
    <Frame>
      <main id="main" className={s.main} aria-busy="true">
        <p className="sr-only" role="status">Loading…</p>
        <div className={`${s.hero} ${s.skeletonHero}`} aria-hidden="true">
          <Bone w="min(400px, 80%)" h={52} />
          <Bone w="min(460px, 90%)" h={52} />
          <Bone w="min(540px, 100%)" h={14} />
          <Bone w="min(480px, 90%)" h={14} />
        </div>
        <div className={s.card} aria-hidden="true">
          <div className={s.cardHeader}><Bone w={150} h={11} /><Bone w={96} h={22} /></div>
          <div className={s.booking}>
            <Bone h={84} />
            <div className={s.skeletonLines}><Bone w="62%" h={14} /><Bone w="74%" h={26} /><Bone w="40%" h={13} /></div>
          </div>
          <div className={s.details}><Bone w={210} h={13} /><Bone w={270} h={13} /></div>
        </div>
      </main>
    </Frame>
  );
}

export default function OutcomePage() {
  const navigate = useNavigate();
  // From /ready's finish button the details are already loaded (utils/welcomePrefetch) — the page shows at once.
  const [primed] = useState(() => peekWelcomeData());
  const [user, setUser] = useState(primed?.user ?? null);
  const [appt, setAppt] = useState(primed?.appointment ?? null);
  const [loading, setLoading] = useState(!primed);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Onboarding Complete | Dr. Jason Shumard';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    if (primed) { clearWelcomeData(); return; }
    (async () => {
      try {
        const token = localStorage.getItem('access_token');
        const h = { headers: { Authorization: `Bearer ${token}` } };
        // Step gating lives in App.js's JourneyRoute (only step-4 users reach this page).
        const [u, a] = await Promise.all([
          axios.get(`${API}/user/me`, h),
          axios.get(`${API}/user/appointment`, h).catch(() => ({ data: { appointment: null } })),
        ]);
        setUser(u.data);
        setAppt(a.data?.appointment || null);
      } catch (e) {
        if (e.response?.status === 401) { localStorage.clear(); navigate('/login'); }
        else toast.error('Failed to load this page', { id: 'outcome-load' });
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, primed]);

  if (loading) return <OutcomeSkeleton />;

  // A first name to address them by; GHL signups can carry a placeholder ("there") instead of one.
  const first = (user?.first_name || user?.name || '').trim().split(' ')[0];
  const firstName = first && first.toLowerCase() !== 'there' ? first : null;
  const sessionDate = appt?.session_date ? new Date(appt.session_date) : null;
  const validDate = sessionDate && !Number.isNaN(sessionDate.getTime());
  const tz = safeTimezone(appt?.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = (opts) => formatInTz(sessionDate, tz, opts);
  const tzLabel = tz.split('/').pop().replace(/_/g, ' ');
  const durationMin = appt?.duration_minutes || appt?.duration || 30;

  return (
    <Frame>
      <main id="main" className={s.main}>
        <section className={s.hero} aria-labelledby="complete-title">
          <h1 id="complete-title">You’ve taken<br /><span>the first step.</span></h1>
          <p className={s.lead}>Your onboarding is complete{firstName ? `, ${firstName}` : ''}. Reversing type 2 diabetes doesn’t start with a giant leap. It starts with one small step in the right direction, and the first one matters most.</p>
        </section>

        <section className={s.card} aria-labelledby="session-title">
          <div className={s.cardHeader}>
            <h2 id="session-title" className={s.kicker}>Your strategy session</h2>
            <span className={s.badge}><Check size={12} strokeWidth={2.4} aria-hidden="true" /> Confirmed</span>
          </div>
          {validDate ? (
            <div className={s.booking}>
              <div className={s.dateTile} aria-hidden="true"><span>{fmt({ month: 'short' })}</span><strong>{fmt({ day: 'numeric' })}</strong></div>
              <p>
                <span className={s.forward}>We’re looking forward to meeting you on</span>
                <strong className={s.date}>{fmt({ weekday: 'long', month: 'long', day: 'numeric' })}</strong>
                <span className={s.time}>{fmt({ hour: 'numeric', minute: '2-digit' })} · {tzLabel} time</span>
                {appt.meet_link && (
                  <a className={s.meetLink} href={appt.meet_link} target="_blank" rel="noreferrer"><Video size={15} aria-hidden="true" /> Join with Google Meet</a>
                )}
              </p>
            </div>
          ) : (
            <p className={s.pending}>Your session is booked. The date, time and meeting link are in your confirmation email.</p>
          )}
          <ul className={s.details}>
            <li><Clock3 size={16} aria-hidden="true" /> {durationMin}-minute private consultation</li>
            <li><Video size={16} aria-hidden="true" /> Google Meet link in your confirmation email</li>
          </ul>
        </section>
      </main>
    </Frame>
  );
}
