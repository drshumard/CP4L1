import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { CheckCircle2, Calendar, Play, Home, LogOut, ClipboardCheck, Heart, TrendingUp, ArrowRight, Quote, HelpCircle } from 'lucide-react';
import { formatInTz, safeTimezone } from '../utils/tz';
import './prototype/proto.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LOGO = 'https://portal-drshumard.b-cdn.net/logo.png';

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.45, delay: i * 0.08, ease: [0.22, 0.61, 0.36, 1] } }),
};

const ACHIEVEMENTS = [
  { icon: Calendar, title: 'Consultation booked', body: 'Your one-on-one call is scheduled.' },
  { icon: ClipboardCheck, title: 'Health profile complete', body: 'We have everything we need for your visit.' },
  { icon: Heart, title: 'Committed to your health', body: 'You took the most important step.' },
  { icon: TrendingUp, title: 'Ready to begin', body: 'Prepared for your personalized plan.' },
];

const PREP = [
  'Review your current medications',
  'List your top health goals',
  'Note any recent lab or test results',
  'Write down questions for Dr. Shumard',
  'Have your medical history handy',
  'Think about lifestyle changes you want to make',
];

export default function OutcomePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [appt, setAppt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, [navigate]);

  const logout = () => { localStorage.clear(); navigate('/login'); toast.success('Logged out successfully', { id: 'logout-success' }); };

  if (loading) {
    return (
      <div className="proto" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 999, border: '3px solid var(--brand-100)', borderTopColor: 'var(--brand-600)', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
          <p className="proto-soft" style={{ marginTop: 14 }}>Loading...</p>
        </div>
        <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
      </div>
    );
  }

  const firstName = (user?.name || '').trim().split(' ')[0] || 'there';
  const sessionDate = appt?.session_date ? new Date(appt.session_date) : null;
  const validDate = sessionDate && !Number.isNaN(sessionDate.getTime());
  const tz = safeTimezone(appt?.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sessionWhen = validDate
    ? formatInTz(sessionDate, tz, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;
  const director = appt?.director_name || appt?.director || 'Dr. Shumard';
  const durationMin = appt?.duration_minutes || appt?.duration || 30;
  const sessionTitle = appt?.session_title || 'Strategy Session';
  const stats = ['3/3 steps', '100% complete', appt ? 'Session booked' : 'Onboarding done'];

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
            <button className="proto-btn proto-btn--danger" style={{ padding: '8px 12px' }} aria-label="Log out" onClick={logout}>
              <LogOut size={16} /> <span className="proto-hide-sm">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="proto-container proto-main">
        {/* HERO */}
        <motion.section variants={fadeUp} initial="hidden" animate="show" className="proto-hero proto-card--pad" style={{ color: '#eaf3f6' }}>
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 220, damping: 16 }}
              className="grid place-items-center rounded-full mb-5"
              style={{ width: 76, height: 76, background: 'rgba(234,243,246,0.12)', boxShadow: '0 0 0 8px rgba(234,243,246,0.06)' }}>
              <CheckCircle2 size={44} strokeWidth={2} color="#eaf3f6" />
            </motion.div>
            <span className="proto-eyebrow" style={{ color: 'var(--brand-200)' }}>Onboarding complete</span>
            <h1 className="mt-2 font-extrabold leading-tight" style={{ fontSize: 'clamp(26px, 6vw, 38px)', color: '#fff' }}>
              You&apos;re all set, {firstName}
            </h1>
            <p className="mt-3 max-w-md" style={{ color: '#cfe2e9', fontSize: 16, lineHeight: 1.55 }}>
              Your consultation is booked and your health profile is in. Here&apos;s how to make the most of your time with Dr. Shumard.
            </p>
            <div className="mt-5 flex flex-wrap justify-center md:justify-start gap-2">
              {stats.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 rounded-full font-semibold"
                  style={{ padding: '6px 12px', fontSize: 12.5, background: 'rgba(234,243,246,0.14)', color: '#eaf3f6' }}>
                  <CheckCircle2 size={14} strokeWidth={2.4} />{s}
                </span>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Main flow + side rail on large screens; stacks on phones/laptops */}
        <div className="proto-cols" style={{ marginTop: 20 }}>
        {/* Main column first in the DOM so keyboard/screen-reader order matches the
            visual order (grid auto-placement puts the aside in the right rail). */}
        <div className="proto-cols__main">
        {/* What you've accomplished */}
        <motion.section variants={fadeUp} custom={2} initial="hidden" animate="show" className="proto-card proto-card--pad">
          <h2 className="font-bold" style={{ color: 'var(--brand-900)', fontSize: 19 }}>What you&apos;ve accomplished</h2>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {ACHIEVEMENTS.map((a) => {
              const Icon = a.icon;
              return (
                <div key={a.title} className="flex items-start gap-3" style={{ padding: '12px 0' }}>
                  <span className="grid place-items-center rounded-xl flex-none" style={{ width: 38, height: 38, background: 'var(--brand-100)', color: 'var(--brand-700)' }}>
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold" style={{ color: 'var(--brand-900)', fontSize: 15 }}>{a.title}</h3>
                    <p className="proto-muted mt-0.5" style={{ fontSize: 13.5, lineHeight: 1.45 }}>{a.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>

        {/* Prepare for your call */}
        <motion.section variants={fadeUp} custom={3} initial="hidden" animate="show" className="proto-card proto-card--pad">
          <h2 className="font-bold" style={{ color: 'var(--brand-900)', fontSize: 19 }}>Prepare for your call</h2>
          <p className="proto-muted mt-1" style={{ fontSize: 14 }}>A few things to have ready before you meet.</p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {PREP.map((item) => (
              <div key={item} className="flex items-center gap-2.5" style={{ padding: '9px 0' }}>
                <CheckCircle2 size={18} strokeWidth={2} color="var(--brand-600)" className="flex-none" />
                <span style={{ color: 'var(--brand-900)', fontSize: 14.5 }}>{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-5" style={{ borderTop: '1px solid var(--p-line)' }}>
            <span className="proto-eyebrow">What comes next</span>
            <p className="proto-muted mt-1.5 max-w-2xl" style={{ fontSize: 14, lineHeight: 1.55 }}>
              During your consultation, Dr. Shumard will review your profile and build a personalized plan around your
              goals — covering nutrition, lifestyle, and the right next steps for your health.
            </p>
          </div>
        </motion.section>
        </div>

        <aside className="proto-cols__side">
        {/* Booked session summary */}
        {appt && (
          <motion.div variants={fadeUp} custom={1} initial="hidden" animate="show" className="proto-card proto-card--pad">
            <div className="flex items-start gap-3">
              <span className="grid place-items-center rounded-2xl flex-none" style={{ width: 46, height: 46, background: 'var(--brand-100)', color: 'var(--brand-700)' }}>
                <Calendar size={22} strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="proto-badge proto-badge--ok">Confirmed</span>
                  <span className="proto-muted" style={{ fontSize: 13 }}>{durationMin} min · with {director}</span>
                </div>
                <div className="mt-1.5 font-bold" style={{ color: 'var(--brand-900)', fontSize: 16 }}>{sessionTitle}</div>
                {sessionWhen && <div className="mt-0.5" style={{ color: 'var(--brand-700)', fontSize: 15 }}>{sessionWhen}</div>}
                {appt.meet_link && (
                  <a className="proto-btn proto-btn--primary mt-3" href={appt.meet_link} target="_blank" rel="noreferrer" style={{ gap: 8 }}>
                    <Play size={16} strokeWidth={2.4} /> Join with Google Meet
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Quote (rail) */}
        <motion.section variants={fadeUp} custom={4} initial="hidden" animate="show" className="proto-card proto-card--pad proto-card--flat" style={{ textAlign: 'center' }}>
          <Quote size={26} color="var(--brand-300)" style={{ margin: '0 auto' }} />
          <blockquote className="mt-3 font-bold" style={{ color: 'var(--brand-900)', fontSize: 20, lineHeight: 1.35 }}>
            &ldquo;The greatest wealth is health.&rdquo;
          </blockquote>
          <p className="proto-muted mt-1.5" style={{ fontSize: 13.5 }}>— Virgil</p>
        </motion.section>

        {/* CTA (rail) */}
        <motion.div variants={fadeUp} custom={5} initial="hidden" animate="show" className="flex justify-center">
          <button className="proto-btn proto-btn--secondary proto-btn--block" onClick={() => navigate('/dashboard')} style={{ gap: 8 }}>
            Back to your dashboard <ArrowRight size={17} strokeWidth={2.2} />
          </button>
        </motion.div>
        </aside>
        </div>
      </main>

      <style>{'.proto-hide-sm{display:none}@media(min-width:720px){.proto-hide-sm{display:inline}}'}</style>
    </div>
  );
}
