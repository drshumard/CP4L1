import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  ArrowRight, LogOut, Home, Clock, Video, Globe, CalendarPlus, Check, Lock,
  CalendarCheck, ClipboardList, Sparkles, Trophy, LayoutGrid, BarChart3, HelpCircle,
} from 'lucide-react';
import { trackDashboardViewed, trackLogout, trackButtonClicked } from '../utils/analytics';
import { formatInTz, safeTimezone } from '../utils/tz';
import './prototype/proto.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LOGO = 'https://portal-drshumard.b-cdn.net/logo.png';

const JOURNEY = [
  { n: 1, label: 'Book your consultation', sub: 'Schedule your 1:1 call', icon: CalendarCheck },
  { n: 2, label: 'Complete your health profile', sub: 'Your health blueprint', icon: ClipboardList },
  { n: 3, label: 'Get ready', sub: 'Final preparations', icon: Sparkles },
];

export default function PortalDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [progress, setProgress] = useState(null);
  const [appt, setAppt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, [navigate]);

  const logout = () => {
    trackLogout(user?.id);
    localStorage.clear();
    navigate('/login');
    toast.success('Logged out successfully', { id: 'logout-success' });
  };

  const isStaff = user?.role === 'admin' || user?.role === 'staff';
  const step = progress?.current_step ?? 1;
  const isComplete = step >= 4;
  const pct = Math.min(Math.round((step / 4) * 100), 100);
  const firstName = (user?.name || '').trim().split(' ')[0] || 'there';

  const ctaLabel = isComplete ? 'View your achievement'
    : step <= 1 ? 'Book your consultation'
    : step === 2 ? 'Continue your health profile'
    : 'Finish getting ready';
  const goJourney = () => {
    trackButtonClicked(isComplete ? 'view_achievement' : 'continue_journey', 'dashboard');
    navigate(isComplete ? '/outcome' : step <= 1 ? '/book' : step === 2 ? '/forms' : '/ready');
  };

  // ----- appointment formatting -----
  const sessionDate = appt?.session_date ? new Date(appt.session_date) : null;
  const validDate = sessionDate && !Number.isNaN(sessionDate.getTime());
  // Resolve the zone ONCE (invalid stored zones fall back to the browser's) so the label
  // always names the zone the time was actually rendered in.
  const tz = safeTimezone(appt?.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  const fmt = (opts) => (validDate ? formatInTz(sessionDate, tz, opts) : '');
  const dateLabel = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
  const timeLabel = fmt({ hour: 'numeric', minute: '2-digit' });
  const tzLabel = tz.split('/').pop().replace(/_/g, ' ');
  const daysUntil = validDate ? Math.round((sessionDate.getTime() - Date.now()) / 86400000) : null;
  const countdown = daysUntil == null ? '' : daysUntil < 0 ? 'past' : daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
  const gcalUrl = () => {
    if (!validDate) return '#';
    const end = new Date(sessionDate.getTime() + 30 * 60000);
    const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Strategy Session with Dr. Shumard')}&dates=${f(sessionDate)}/${f(end)}`;
  };

  if (loading) {
    return (
      <div className="proto" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 999, border: '3px solid var(--brand-100)', borderTopColor: 'var(--brand-600)', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
          <p className="proto-soft" style={{ marginTop: 14 }}>Loading your dashboard...</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div className="proto">
      {/* Top bar */}
      <header className="proto-topbar">
        <div className="proto-container" style={{ height: 62, display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={LOGO} alt="Dr. Shumard" style={{ height: 22 }} />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="proto-btn proto-btn--ghost proto-help-sm" style={{ padding: '8px 12px' }} aria-label="Help"
              onClick={() => window.dispatchEvent(new Event('open-support'))}>
              <HelpCircle size={16} />
            </button>
            <button className="proto-btn proto-btn--ghost" style={{ padding: '8px 12px' }} aria-label="Home" onClick={() => navigate('/dashboard')}>
              <Home size={16} /> <span className="proto-hide-sm">Home</span>
            </button>
            {isStaff && (
              <>
                <button className="proto-btn proto-btn--ghost" style={{ padding: '8px 12px' }}
                  onClick={() => { trackButtonClicked('admin_panel', 'dashboard'); navigate('/admin'); }}>
                  <LayoutGrid size={16} /> <span className="proto-hide-sm">Admin</span>
                </button>
                <button className="proto-btn proto-btn--ghost" style={{ padding: '8px 12px' }}
                  onClick={() => { trackButtonClicked('analytics', 'dashboard'); navigate('/admin/analytics'); }}>
                  <BarChart3 size={16} /> <span className="proto-hide-sm">Analytics</span>
                </button>
              </>
            )}
            <button className="proto-btn proto-btn--danger" style={{ padding: '8px 12px' }} aria-label="Log out" onClick={logout}>
              <LogOut size={16} /> <span className="proto-hide-sm">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="proto-container proto-main">
        {/* Hero */}
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="proto-hero proto-card--pad" style={{ marginBottom: 18 }}>
          <div className="proto-hero-grid">
            <div>
              <p className="proto-eyebrow" style={{ color: 'var(--brand-200)' }}>Your wellness journey</p>
              <h1 style={{ color: '#fff', marginTop: 6 }}>Welcome back, {firstName}</h1>
              <p style={{ color: '#dbeaf0', marginTop: 8, maxWidth: 460 }}>
                {isComplete
                  ? "You've completed your onboarding - here's what's coming up."
                  : `You're on step ${Math.min(step, 3)} of 3. ${step <= 1 ? "Let's get your consultation booked." : step === 2 ? "Let's finish your health profile." : "A few final preparations and you're set."}`}
              </p>

              <div style={{ marginTop: 18, maxWidth: 460 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, fontSize: 13, color: '#cfe2ea' }}>
                  <span>Your progress</span><span style={{ fontWeight: 700, color: '#fff' }}>{pct}%</span>
                </div>
                <div className="proto-track" style={{ background: 'rgba(255,255,255,.22)' }}>
                  <span style={{ width: `${pct}%`, background: 'rgba(255,255,255,.95)' }} />
                </div>
              </div>

              <button className="proto-btn proto-btn--onhero proto-btn--lg" style={{ marginTop: 20 }} onClick={goJourney}>
                {isComplete ? <Trophy size={18} /> : null}{ctaLabel}{!isComplete && <ArrowRight size={18} />}
              </button>
            </div>

            {/* progress card (desktop) */}
            <div className="proto-hero-aside">
              <div style={{ background: 'rgba(255,255,255,.10)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 'var(--p-r-sm)', padding: 18 }}>
                <p className="proto-eyebrow" style={{ color: 'var(--brand-200)' }}>Your progress</p>
                <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                  {JOURNEY.map((s) => {
                    const done = step > s.n; const current = step === s.n;
                    return (
                      <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', flex: 'none',
                          background: done ? '#fff' : current ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.10)',
                          color: done ? 'var(--brand-700)' : '#fff', fontWeight: 800, fontSize: 12 }}>
                          {done ? <Check size={14} /> : s.n}
                        </span>
                        <span style={{ color: done || current ? '#fff' : '#bcd3dd', fontWeight: current ? 700 : 500, fontSize: 14 }}>{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Below the hero: a bento grid. Every row's edges line up — checklist beside the
            session card, then the program cards as one horizontal strip with support —
            instead of a tall skinny rail beside a short column. Stacks below 1200px. */}
        <div className="proto-bento">
        {/* Journey checklist */}
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }}
          className="proto-card proto-card--pad proto-bento--journey">
          <p className="proto-eyebrow" style={{ marginBottom: 4 }}>Your 3 steps</p>
          <h2 style={{ marginBottom: 14 }}>Your journey to reversal</h2>
          <div style={{ display: 'grid', gap: 4 }}>
            {JOURNEY.map((s, i) => {
              const done = step > s.n; const current = step === s.n;
              return (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: i ? '1px solid var(--p-line)' : 'none' }}>
                  <span className={`proto-step-dot ${done ? 'proto-step-dot--done' : current ? 'proto-step-dot--current' : 'proto-step-dot--todo'}`}>
                    {done ? <Check size={16} /> : current ? s.n : <Lock size={14} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: current || done ? 'var(--p-ink)' : 'var(--p-ink-soft)' }}>{s.label}</div>
                    <div className="proto-muted" style={{ fontSize: 13.5 }}>{done ? 'Completed' : s.sub}</div>
                  </div>
                  {current && !isComplete && (
                    <button className="proto-btn proto-btn--ghost" onClick={goJourney}>Resume <ArrowRight size={15} /></button>
                  )}
                </div>
              );
            })}
          </div>
        </motion.section>

        {/* Next session */}
        {appt && (
          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.12 }}
            className="proto-card proto-card--pad proto-bento--appt">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p className="proto-eyebrow">Your next session</p>
                <h2 style={{ marginTop: 6 }}>{validDate ? dateLabel : 'Session booked'}</h2>
                {validDate && <p className="proto-soft" style={{ marginTop: 2, fontSize: 17 }}>{timeLabel} · {tzLabel} time</p>}
              </div>
              {countdown && countdown !== 'past' && (
                <span className="proto-badge proto-badge--ok"><span className="proto-dot" style={{ background: 'currentColor' }} />{countdown}</span>
              )}
            </div>

            <div style={{ marginTop: 16, display: 'grid', gap: 11 }}>
              <Row icon={Clock}>Strategy session with Dr. Shumard · 30 min</Row>
              <Row icon={Video}>Google Meet - your link is in your confirmation email</Row>
              <Row icon={Globe}>Online · {tzLabel} time</Row>
            </div>

            <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {appt.meet_link && (
                <a className="proto-btn proto-btn--primary" href={appt.meet_link} target="_blank" rel="noreferrer">
                  <Video size={17} /> Join with Google Meet
                </a>
              )}
              {validDate && (
                <a className="proto-btn proto-btn--secondary" href={gcalUrl()} target="_blank" rel="noreferrer">
                  <CalendarPlus size={17} /> Add to calendar
                </a>
              )}
            </div>
          </motion.section>
        )}

        {/* No appointment: the support card fills the slot beside the checklist so the
            row still closes flush. */}
        {!appt && <SupportCard className="proto-bento--appt" delay={0.12} />}

        {/* Program overview — a full-width horizontal strip, never a tall rail */}
        <div className="proto-bento__head">
          <p className="proto-eyebrow" style={{ marginBottom: 4 }}>Your program</p>
          <h2>What to expect</h2>
        </div>
        {JOURNEY.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.n} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.16 + i * 0.04 }}
              className={`proto-card proto-card--pad proto-card--flat ${appt ? 'proto-bento--prog4' : 'proto-bento--prog3'}`}>
              <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--brand-50)', color: 'var(--brand-600)', display: 'grid', placeItems: 'center' }}>
                <Icon size={19} />
              </span>
              <h3 style={{ marginTop: 12 }}>{s.label}</h3>
              <p className="proto-soft" style={{ fontSize: 14, marginTop: 4 }}>{s.sub}</p>
            </motion.div>
          );
        })}

        {/* With an appointment, support completes the program row (3+3+3+3). */}
        {appt && <SupportCard className="proto-bento--prog4" delay={0.28} flat />}
        </div>
      </main>

      {/* responsive helpers for this page */}
      <style>{`
        .proto-hero-grid { display: grid; gap: 22px; }
        .proto-hero-aside { display: none; }
        .proto-hide-sm { display: none; }
        /* Bento: one column on phones; program cards go 3-up on tablets; on large screens
           a 12-col grid where every row closes flush (7+5, then 4+4+4 or 3+3+3+3). */
        .proto-bento { display: grid; gap: 14px; grid-template-columns: 1fr; }
        .proto-bento > * { grid-column: 1 / -1; min-width: 0; }
        .proto-bento__head { margin-top: 10px; }
        @media (min-width: 720px) {
          .proto-hide-sm { display: inline; }
          .proto-bento { grid-template-columns: repeat(3, 1fr); }
          .proto-bento--prog3, .proto-bento--prog4 { grid-column: span 1; }
        }
        @media (min-width: 900px) {
          .proto-hero-grid { grid-template-columns: 1.4fr 1fr; align-items: center; }
          .proto-hero-aside { display: block; }
        }
        @media (min-width: 1200px) {
          .proto-bento { grid-template-columns: repeat(12, 1fr); gap: 20px; }
          .proto-bento > * { grid-column: 1 / -1; }
          .proto-bento--journey { grid-column: span 7; }
          .proto-bento--appt { grid-column: span 5; }
          .proto-bento--prog3 { grid-column: span 4; }
          .proto-bento--prog4 { grid-column: span 3; }
        }
      `}</style>
    </div>
  );
}

function Row({ icon: Icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <Icon size={17} style={{ color: 'var(--brand-500)', flex: 'none' }} />
      <span className="proto-soft" style={{ fontSize: 14.5 }}>{children}</span>
    </div>
  );
}

function SupportCard({ className = '', delay = 0, flat = false }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay }}
      className={`proto-card proto-card--pad ${flat ? 'proto-card--flat' : ''} ${className}`}>
      <p className="proto-eyebrow">Need a hand?</p>
      <h3 style={{ marginTop: 8 }}>We're here to help</h3>
      <p className="proto-soft" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>
        Questions about your booking or your health profile? Our concierge team responds quickly.
      </p>
      <button className="proto-btn proto-btn--secondary" style={{ marginTop: 14 }}
        onClick={() => window.dispatchEvent(new Event('open-support'))}>
        <HelpCircle size={16} /> Chat with support
      </button>
    </motion.section>
  );
}
