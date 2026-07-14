import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Play, Calendar, Users, ExternalLink, Mail } from 'lucide-react';
import { MOCK } from './protoData';

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: i * 0.08, ease: [0.22, 0.61, 0.36, 1] },
  }),
};

const CHECKLIST = [
  {
    n: 1,
    icon: Calendar,
    title: 'Confirm your calendar',
    body: 'Find the confirmation email and add the session as top priority.',
  },
  {
    n: 2,
    icon: Users,
    title: 'Bring your support team',
    body: 'Forward the invite to your spouse or a trusted decision-maker to join the call.',
  },
  {
    n: 3,
    icon: Mail,
    title: 'Activate your portal',
    body: 'Check your email for the Practice Better invite and click Activate My Account.',
  },
];

export default function ProtoReady() {
  const { user, session } = MOCK;
  const [playing, setPlaying] = useState(false);

  const sessionWhen = new Date(session.startIso).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: session.tz,
  });

  const stats = [
    { label: '3/3 steps' },
    { label: '100% complete' },
    { label: 'Session booked' },
  ];

  return (
    <div className="pb-2">
      {/* 1) HERO - complete moment */}
      <motion.section
        variants={fadeUp}
        initial="hidden"
        animate="show"
        className="proto-hero proto-card--pad"
        style={{ color: '#eaf3f6' }}
      >
        <div className="flex flex-col items-center text-center md:items-start md:text-left">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 220, damping: 16 }}
            className="grid place-items-center rounded-full mb-5"
            style={{
              width: 76,
              height: 76,
              background: 'rgba(234,243,246,0.12)',
              boxShadow: '0 0 0 8px rgba(234,243,246,0.06)',
            }}
          >
            <CheckCircle2 size={44} strokeWidth={2} color="#eaf3f6" />
          </motion.div>

          <span className="proto-eyebrow" style={{ color: 'var(--brand-200)' }}>
            Step 3 of 3
          </span>
          <h1
            className="mt-2 font-extrabold leading-tight"
            style={{ fontSize: 'clamp(26px, 6vw, 38px)', color: '#fff' }}
          >
            You're all set, {user.firstName}
          </h1>
          <p
            className="mt-3 max-w-md"
            style={{ color: '#cfe2e9', fontSize: 16, lineHeight: 1.55 }}
          >
            Your onboarding is complete. Here's how to make the most of your session.
          </p>

          {/* tiny stat chips */}
          <div className="mt-5 flex flex-wrap justify-center md:justify-start gap-2">
            {stats.map((s) => (
              <span
                key={s.label}
                className="inline-flex items-center gap-1.5 rounded-full font-semibold"
                style={{
                  padding: '6px 12px',
                  fontSize: 12.5,
                  background: 'rgba(234,243,246,0.14)',
                  color: '#eaf3f6',
                }}
              >
                <CheckCircle2 size={14} strokeWidth={2.4} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Booked session summary - reassurance */}
      <motion.div
        variants={fadeUp}
        custom={1}
        initial="hidden"
        animate="show"
        className="proto-card proto-card--pad mt-5"
      >
        <div className="flex items-start gap-3">
          <span
            className="grid place-items-center rounded-2xl flex-none"
            style={{ width: 46, height: 46, background: 'var(--brand-100)', color: 'var(--brand-700)' }}
          >
            <Calendar size={22} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="proto-badge proto-badge--ok">Confirmed</span>
              <span className="proto-muted" style={{ fontSize: 13 }}>
                {session.durationMin} min · with {session.director}
              </span>
            </div>
            <div className="mt-1.5 font-bold" style={{ color: 'var(--brand-900)', fontSize: 16 }}>
              {session.title}
            </div>
            <div className="mt-0.5" style={{ color: 'var(--brand-700)', fontSize: 15 }}>
              {sessionWhen}
            </div>
          </div>
        </div>
      </motion.div>

      {/* 2) WATCH THIS FIRST - video card */}
      <motion.section
        variants={fadeUp}
        custom={2}
        initial="hidden"
        animate="show"
        className="proto-card mt-6 overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="block w-full text-left"
          style={{ position: 'relative', aspectRatio: '16 / 9', border: 0, cursor: 'pointer' }}
        >
          {/* dark placeholder */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(135deg, var(--brand-900) 0%, var(--brand-700) 60%, var(--brand-600) 100%)',
            }}
          />
          {/* play overlay */}
          <div className="absolute inset-0 grid place-items-center">
            <motion.span
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              className="grid place-items-center rounded-full"
              style={{
                width: 66,
                height: 66,
                background: 'rgba(255,255,255,0.94)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
              }}
            >
              <Play size={26} strokeWidth={2.5} color="var(--brand-700)" style={{ marginLeft: 3 }} />
            </motion.span>
          </div>
          {/* label */}
          <div
            className="absolute left-0 right-0 bottom-0 flex items-center justify-between"
            style={{
              padding: '12px 14px',
              background: 'linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.45))',
            }}
          >
            <span style={{ color: '#eaf3f6', fontWeight: 700, fontSize: 14.5 }}>
              Preparing for your session
            </span>
            <span
              className="rounded-full font-semibold"
              style={{ padding: '3px 9px', fontSize: 12, background: 'rgba(255,255,255,0.18)', color: '#eaf3f6' }}
            >
              2 min
            </span>
          </div>
        </button>
        <div className="proto-card--pad" style={{ paddingTop: 14, paddingBottom: 14 }}>
          <div className="proto-eyebrow">Watch this first</div>
          <p className="proto-muted mt-1" style={{ fontSize: 14 }}>
            {playing ? 'Now playing - a quick primer before we meet.' : 'A short primer on what to expect and how to prepare before we meet.'}
          </p>
        </div>
      </motion.section>

      {/* 3) FINAL CHECKLIST */}
      <motion.section variants={fadeUp} custom={3} initial="hidden" animate="show" className="mt-7">
        <h2 className="font-bold" style={{ color: 'var(--brand-900)', fontSize: 19 }}>
          Your final checklist
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          {CHECKLIST.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.n}
                variants={fadeUp}
                custom={4 + i}
                initial="hidden"
                animate="show"
                className="proto-card proto-card--pad"
              >
                <div className="flex items-start gap-3.5">
                  <div className="proto-step-dot proto-step-dot--current" style={{ marginTop: 2 }}>
                    {step.n}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon size={17} strokeWidth={2} color="var(--brand-600)" />
                      <h3 className="font-bold" style={{ color: 'var(--brand-900)', fontSize: 16 }}>
                        {step.title}
                      </h3>
                    </div>
                    <p className="proto-muted mt-1" style={{ fontSize: 14.5, lineHeight: 1.5 }}>
                      {step.body}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.section>

      {/* 4) ACTIVATION CARD */}
      <motion.section
        variants={fadeUp}
        custom={7}
        initial="hidden"
        animate="show"
        className="proto-hero proto-card--pad mt-7"
        style={{ color: '#eaf3f6' }}
      >
        <div className="md:flex md:items-center md:justify-between md:gap-8">
          <div className="max-w-md">
            <span className="proto-eyebrow" style={{ color: 'var(--brand-200)' }}>
              Last step
            </span>
            <h2 className="mt-2 font-extrabold leading-tight" style={{ fontSize: 24, color: '#fff' }}>
              Activate your patient portal
            </h2>
            <p className="mt-2" style={{ color: '#cfe2e9', fontSize: 15, lineHeight: 1.55 }}>
              Set up your secure account in Practice Better to access your plan, messages, and
              resources before we meet.
            </p>
          </div>

          <div className="mt-5 md:mt-0 md:flex-none md:w-72">
            <a
              href="#activate"
              className="proto-btn proto-btn--onhero proto-btn--lg proto-btn--block"
              style={{ gap: 8 }}
            >
              <ExternalLink size={19} strokeWidth={2.2} />
              Activate your Practice Better portal
            </a>
            <p
              className="mt-3 flex items-start gap-2 justify-center md:justify-start"
              style={{ color: '#a9cbd6', fontSize: 12.5, lineHeight: 1.45 }}
            >
              <Mail size={14} strokeWidth={2} style={{ marginTop: 1, flex: 'none' }} />
              You can also find the activation email in your inbox or spam.
            </p>
          </div>
        </div>
      </motion.section>

      {/* Mobile sticky CTA - hidden on desktop where the card CTA is visible */}
      <div className="proto-actionbar md:hidden">
        <a href="#activate" className="proto-btn proto-btn--primary proto-btn--lg proto-btn--block" style={{ gap: 8 }}>
          <ExternalLink size={19} strokeWidth={2.2} />
          Activate your portal
        </a>
      </div>
    </div>
  );
}
