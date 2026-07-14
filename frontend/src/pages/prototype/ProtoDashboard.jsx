import React from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Clock,
  Video,
  User,
  Globe,
  CalendarPlus,
  Check,
  Lock,
  CalendarCheck,
  ClipboardList,
  Sparkles,
} from 'lucide-react';
import { MOCK } from './protoData';

// ---- derived display values from MOCK ----
const sessionStart = new Date(MOCK.session.startIso);

const sessionWhen = sessionStart.toLocaleString('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: MOCK.session.tz,
});

const tzLabel = MOCK.session.tz.split('/').pop().replace(/_/g, ' ') + ' time';

// Days until the session (relative to "today"); keeps a friendly "in N days" countdown.
const daysUntil = Math.max(
  0,
  Math.round((sessionStart.getTime() - Date.now()) / 86400000)
);
const countdownText =
  daysUntil <= 0 ? 'today' : daysUntil === 1 ? 'in 1 day' : `in ${daysUntil} days`;

const PROGRESS_PCT = 66;

const PROGRAM = [
  {
    icon: CalendarCheck,
    title: 'Book Consultation',
    line: 'Schedule your 1:1 call',
    done: true,
  },
  {
    icon: ClipboardList,
    title: 'Health Profile',
    line: 'Complete your blueprint',
    current: true,
  },
  {
    icon: Sparkles,
    title: 'Ready to Start',
    line: 'Final preparations',
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] },
  }),
};

export default function ProtoDashboard() {
  const { user, session } = MOCK;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 1) HERO - warm greeting + journey progress */}
      <motion.section
        variants={fadeUp}
        initial="hidden"
        animate="show"
        className="proto-hero proto-card--pad"
      >
        <div className="md:grid md:grid-cols-[1.4fr_1fr] md:gap-8 md:items-center">
          {/* left: greeting + progress + CTA */}
          <div>
            <span
              className="proto-eyebrow"
              style={{ color: '#bfe0ea', letterSpacing: '0.14em' }}
            >
              Your Wellness Journey
            </span>
            <h1 className="mt-2" style={{ color: '#ffffff' }}>
              Welcome back, {user.firstName}
            </h1>
            <p
              className="mt-2 text-[15px] sm:text-base"
              style={{ color: '#d6e9ef', maxWidth: '42ch' }}
            >
              You're on step 2 of 3 - let's finish your health profile.
            </p>

            {/* progress */}
            <div className="mt-5" style={{ maxWidth: 460 }}>
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[13px] font-semibold"
                  style={{ color: '#eaf3f6' }}
                >
                  Health profile
                </span>
                <span
                  className="proto-mono text-[13px] font-bold"
                  style={{ color: '#ffffff' }}
                >
                  {PROGRESS_PCT}%
                </span>
              </div>
              <div
                className="proto-track"
                style={{ background: 'rgba(255,255,255,.22)' }}
                role="progressbar"
                aria-valuenow={PROGRESS_PCT}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${PROGRESS_PCT}%` }} />
              </div>
            </div>

            <button
              type="button"
              className="proto-btn proto-btn--onhero proto-btn--lg mt-5 w-full sm:w-auto"
            >
              Continue health profile
              <ArrowRight size={18} strokeWidth={2.2} />
            </button>
          </div>

          {/* right: compact journey summary (desktop only) */}
          <div
            className="hidden md:block mt-0 rounded-2xl p-5"
            style={{
              background: 'rgba(255,255,255,.10)',
              border: '1px solid rgba(255,255,255,.18)',
            }}
          >
            <span
              className="text-[12px] font-bold uppercase tracking-wider"
              style={{ color: '#bfe0ea' }}
            >
              Your progress
            </span>
            <div className="mt-3 space-y-3">
              {MOCK.journey.steps.map((s) => (
                <div key={s.key} className="flex items-center gap-3">
                  <span
                    className="grid place-items-center flex-none rounded-full"
                    style={{
                      width: 28,
                      height: 28,
                      fontWeight: 800,
                      fontSize: 13,
                      background: s.done
                        ? '#ffffff'
                        : s.current
                        ? 'rgba(255,255,255,.22)'
                        : 'rgba(255,255,255,.10)',
                      color: s.done ? 'var(--brand-700)' : '#eaf3f6',
                      border: s.current ? '1px solid rgba(255,255,255,.55)' : 'none',
                    }}
                  >
                    {s.done ? <Check size={15} strokeWidth={3} /> : s.n}
                  </span>
                  <span
                    className="text-[14px] font-semibold"
                    style={{ color: s.current ? '#ffffff' : '#d6e9ef' }}
                  >
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* 2) NEXT SESSION */}
      <motion.section
        variants={fadeUp}
        custom={1}
        initial="hidden"
        animate="show"
        className="proto-card proto-card--pad"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="proto-eyebrow">Your next session</span>
            <h2 className="mt-1.5">{session.title}</h2>
          </div>
          <span className="proto-badge proto-badge--ok whitespace-nowrap">
            <span className="proto-dot" style={{ background: '#157a4b' }} />
            {countdownText}
          </span>
        </div>

        {/* detail rows */}
        <div className="mt-4 space-y-3">
          <DetailRow icon={Clock}>
            <span className="font-semibold">{sessionWhen}</span>
            <span className="proto-muted">
              {' '}
              · {session.durationMin} min · {tzLabel}
            </span>
          </DetailRow>
          <DetailRow icon={User}>
            With <span className="font-semibold">{session.director}</span>, Program
            Director
          </DetailRow>
          <DetailRow icon={Video}>
            Google Meet video call
          </DetailRow>
          <DetailRow icon={Globe}>
            Online · link opens 10 minutes before start
          </DetailRow>
        </div>

        <hr className="proto-divider my-5" />

        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={session.meetLink}
            target="_blank"
            rel="noreferrer"
            className="proto-btn proto-btn--primary proto-btn--block sm:w-auto"
          >
            <Video size={18} strokeWidth={2} />
            Join with Google Meet
          </a>
          <button
            type="button"
            className="proto-btn proto-btn--secondary proto-btn--block sm:w-auto"
          >
            <CalendarPlus size={18} strokeWidth={2} />
            Add to calendar
          </button>
        </div>
      </motion.section>

      {/* 3) YOUR 3 STEPS - journey checklist */}
      <motion.section
        variants={fadeUp}
        custom={2}
        initial="hidden"
        animate="show"
        className="proto-card proto-card--pad"
      >
        <span className="proto-eyebrow">Your 3 steps</span>
        <h2 className="mt-1.5 mb-4">Your journey to reversal</h2>

        <ol className="space-y-3">
          {/* Step 1 - done */}
          <li
            className="proto-step rounded-2xl p-3"
            style={{ background: 'var(--brand-50)' }}
          >
            <span className="proto-step-dot proto-step-dot--done">
              <Check size={17} strokeWidth={3} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold">Book your consult</p>
              <p className="text-[13px] proto-muted">Completed</p>
            </div>
          </li>

          {/* Step 2 - current */}
          <li
            className="proto-step rounded-2xl p-3"
            style={{
              background: '#fff',
              border: '1.5px solid var(--brand-300)',
              boxShadow: '0 0 0 4px var(--brand-100)',
            }}
          >
            <span className="proto-step-dot proto-step-dot--current">2</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold proto-brand">
                  Complete your health profile
                </p>
                <span className="proto-badge proto-badge--brand whitespace-nowrap">
                  In progress
                </span>
              </div>
              <p className="text-[13px] proto-soft mt-0.5">
                {PROGRESS_PCT}% done ·{' '}
                <button
                  type="button"
                  className="font-bold proto-brand underline underline-offset-2"
                >
                  Resume
                </button>
              </p>
            </div>
          </li>

          {/* Step 3 - todo */}
          <li className="proto-step rounded-2xl p-3">
            <span className="proto-step-dot proto-step-dot--todo">
              <Lock size={15} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold proto-soft">Get ready</p>
              <p className="text-[13px] proto-muted">
                Unlocks after your profile is complete
              </p>
            </div>
          </li>
        </ol>
      </motion.section>

      {/* 4) YOUR PROGRAM - 3-up overview */}
      <motion.section
        variants={fadeUp}
        custom={3}
        initial="hidden"
        animate="show"
      >
        <span className="proto-eyebrow">Your program</span>
        <h2 className="mt-1.5 mb-4">How the program works</h2>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
          {PROGRAM.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="proto-card proto-card--flat p-5"
                style={
                  p.current
                    ? { borderColor: 'var(--brand-300)', background: 'var(--brand-50)' }
                    : undefined
                }
              >
                <span
                  className="grid place-items-center rounded-xl"
                  style={{
                    width: 42,
                    height: 42,
                    background: p.current ? 'var(--brand-600)' : 'var(--brand-100)',
                    color: p.current ? '#fff' : 'var(--brand-700)',
                  }}
                >
                  <Icon size={20} strokeWidth={2} />
                </span>
                <div className="mt-3 flex items-center gap-2">
                  <h3>{p.title}</h3>
                  {p.done && (
                    <Check
                      size={16}
                      strokeWidth={3}
                      style={{ color: 'var(--brand-600)' }}
                    />
                  )}
                </div>
                <p className="text-[14px] proto-soft mt-0.5">{p.line}</p>
              </div>
            );
          })}
        </div>
      </motion.section>
    </div>
  );
}

// Small reusable icon + content row for the session card.
function DetailRow({ icon: Icon, children }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="grid place-items-center flex-none rounded-lg mt-0.5"
        style={{ width: 32, height: 32, background: 'var(--brand-50)' }}
      >
        <Icon size={17} strokeWidth={2} style={{ color: 'var(--brand-600)' }} />
      </span>
      <p className="text-[14px] sm:text-[15px] leading-snug pt-1">{children}</p>
    </div>
  );
}
