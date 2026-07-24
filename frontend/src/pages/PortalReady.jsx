import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { CheckCircle2, Play, Calendar, Users, ExternalLink, Mail, LogOut, Home, HelpCircle, ArrowRight, Loader2 } from 'lucide-react';
import { formatInTz, safeTimezone } from '../utils/tz';
import './prototype/proto.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LOGO = 'https://portal-drshumard.b-cdn.net/logo.png';
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

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.45, delay: i * 0.08, ease: [0.22, 0.61, 0.36, 1] } }),
};

const CHECKLIST = [
  { n: 1, icon: Calendar, title: 'Confirm your calendar', body: 'Find the confirmation email and add the session as top priority.' },
  { n: 2, icon: Users, title: 'Bring your support team', body: 'Forward the invite to your spouse or a trusted decision-maker to join the call.' },
  { n: 3, icon: Mail, title: 'Activate your portal', body: 'Check your email for the Practice Better invite and click Activate My Account.' },
];

export default function PortalReady() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [appt, setAppt] = useState(null);
  const [loading, setLoading] = useState(true);
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
      navigate('/outcome');
    } catch {
      toast.error("We couldn't finish this step - please try again.", { id: 'ready-finish' });
      setFinishing(false);
    }
  };

  useEffect(() => {
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
        {/* 1) HERO */}
        <motion.section variants={fadeUp} initial="hidden" animate="show" className="proto-hero proto-card--pad" style={{ color: '#eaf3f6' }}>
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 220, damping: 16 }}
              className="grid place-items-center rounded-full mb-5"
              style={{ width: 76, height: 76, background: 'rgba(234,243,246,0.12)', boxShadow: '0 0 0 8px rgba(234,243,246,0.06)' }}>
              <CheckCircle2 size={44} strokeWidth={2} color="#eaf3f6" />
            </motion.div>
            <span className="proto-eyebrow" style={{ color: 'var(--brand-200)' }}>Step 3 of 3</span>
            <h1 className="mt-2 font-extrabold leading-tight" style={{ fontSize: 'clamp(26px, 6vw, 38px)', color: '#fff' }}>
              You&apos;re all set, {firstName}
            </h1>
            <p className="mt-3 max-w-md" style={{ color: '#cfe2e9', fontSize: 16, lineHeight: 1.55 }}>
              Your onboarding is complete. Here&apos;s how to make the most of your session.
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
        {/* Final checklist + activation - one card */}
        <motion.section variants={fadeUp} custom={2} initial="hidden" animate="show" className="proto-card proto-card--pad">
          <h2 className="font-bold" style={{ color: 'var(--brand-900)', fontSize: 19 }}>Your final checklist</h2>
          <p className="proto-muted mt-1" style={{ fontSize: 14 }}>A few quick things before we meet.</p>

          <div className="mt-3">
            {CHECKLIST.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={item.n} className="flex items-start gap-3.5" style={{ padding: '14px 0', borderTop: i ? '1px solid var(--p-line)' : 'none' }}>
                  <div className="proto-step-dot proto-step-dot--current" style={{ marginTop: 2 }}>{item.n}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon size={17} strokeWidth={2} color="var(--brand-600)" />
                      <h3 className="font-bold" style={{ color: 'var(--brand-900)', fontSize: 15.5 }}>{item.title}</h3>
                    </div>
                    <p className="proto-muted mt-1" style={{ fontSize: 14, lineHeight: 1.5 }}>{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Activation CTA */}
          <div className="mt-1 pt-5" style={{ borderTop: '1px solid var(--p-line)' }}>
            <span className="proto-eyebrow">Last step</span>
            <h3 className="mt-1.5 font-bold" style={{ color: 'var(--brand-900)', fontSize: 17 }}>Activate your patient portal</h3>
            <p className="proto-muted mt-1 max-w-lg" style={{ fontSize: 14, lineHeight: 1.5 }}>
              Set up your secure account in Practice Better to access your plan, messages, and resources before we meet. You can also find the activation email in your inbox or spam.
            </p>
            <a href={pbActivateUrl(user?.pb_client_record_id)} target="_blank" rel="noreferrer" className="proto-btn proto-btn--primary proto-btn--lg mt-4" style={{ gap: 8 }}>
              <ExternalLink size={19} strokeWidth={2.2} /> Activate your Practice Better portal
            </a>
          </div>
        </motion.section>

        {/* Finish: completes the journey (step 3 -> 4) and opens the outcome page */}
        <motion.section variants={fadeUp} custom={3} initial="hidden" animate="show"
          className="proto-card proto-card--pad" style={{ background: 'var(--brand-50)' }}>
          <p className="proto-eyebrow">One last thing</p>
          <h3 className="mt-2 font-bold" style={{ color: 'var(--brand-900)', fontSize: 17 }}>Done with your checklist?</h3>
          <p className="proto-muted mt-1 max-w-lg" style={{ fontSize: 14, lineHeight: 1.5 }}>
            Mark your onboarding complete to see everything you&apos;ve accomplished and how to prepare for your call.
          </p>
          <button className="proto-btn proto-btn--primary proto-btn--lg mt-4" onClick={finishOnboarding} disabled={finishing} style={{ gap: 8 }}>
            {finishing
              ? <><Loader2 size={18} className="proto-spin" /> Finishing...</>
              : <>I&apos;m ready - finish my onboarding <ArrowRight size={18} strokeWidth={2.2} /></>}
          </button>
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

        {/* Support (rail) */}
        <motion.section variants={fadeUp} custom={3} initial="hidden" animate="show" className="proto-card proto-card--pad proto-card--flat">
          <p className="proto-eyebrow">Need a hand?</p>
          <p className="proto-soft" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
            Can&apos;t find an email or unsure about a step? We&apos;ll sort it out quickly.
          </p>
          <button className="proto-btn proto-btn--secondary" style={{ marginTop: 12 }}
            onClick={() => window.dispatchEvent(new Event('open-support'))}>
            <HelpCircle size={16} /> Chat with support
          </button>
        </motion.section>
        </aside>
        </div>

        {/* Mobile finish CTA (static, end of page — inside the container so it keeps the
            page's side padding instead of running edge-to-edge) */}
        <div className="proto-actionbar md:hidden">
          <button className="proto-btn proto-btn--primary proto-btn--lg proto-btn--block" onClick={finishOnboarding} disabled={finishing} style={{ gap: 8 }}>
            {finishing
              ? <><Loader2 size={18} className="proto-spin" /> Finishing...</>
              : <>Finish my onboarding <ArrowRight size={19} strokeWidth={2.2} /></>}
          </button>
        </div>
      </main>

      <style>{'.proto-hide-sm{display:none}@media(min-width:720px){.proto-hide-sm{display:inline}}.proto-spin{animation:proto-spin .8s linear infinite}@keyframes proto-spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}
