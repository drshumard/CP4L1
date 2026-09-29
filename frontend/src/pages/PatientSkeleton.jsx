import React from 'react';
import { useLocation } from 'react-router-dom';
import { PatientHeader } from './PatientShell';
import dash from './PortalDashboard.module.css';
import s from './PatientSkeleton.module.css';

// Skeleton loaders in the Lyra style — they replaced the spinners (user, 2026-09-28): the patient pages' real header,
// then flat placeholder blocks where the content will be. Screen readers hear the label instead.

export const Bone = ({ w = '100%', h = 12, className }) => (
  <span className={className ? `${s.bone} ${className}` : s.bone} style={{ width: w, height: h }} />
);

function Card({ rows = 0, action = false }) {
  return (
    <div className={s.card}>
      <Bone w="34%" h={11} />
      <Bone w="70%" h={24} />
      <Bone w="92%" />
      <Bone w="66%" />
      {action && <Bone w={220} h={46} className={s.action} />}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={s.row}>
          <Bone w={34} h={34} />
          <div><Bone w={`${56 - i * 12}%`} h={13} /><Bone w={`${82 - i * 10}%`} h={11} /></div>
        </div>
      ))}
    </div>
  );
}

// A patient page loading: the route guard's journey check, or the dashboard's details. Laid out like the dashboard.
export default function PatientSkeleton({ label = 'Loading…' }) {
  const { pathname } = useLocation();
  return (
    <div className={dash.page}>
      <PatientHeader current={pathname === '/' || pathname === '/dashboard' ? 'overview' : undefined} />
      <main className={dash.main} aria-busy="true">
        <p className="sr-only" role="status">{label}</p>
        <div className={dash.welcome} aria-hidden="true">
          <div className={s.intro}><Bone w="min(440px, 78vw)" h={40} /><Bone w="min(360px, 66vw)" h={14} /></div>
          <div className={dash.welcomeStatus}><Bone w={176} h={24} /></div>
        </div>
        <div className={dash.mainGrid} aria-hidden="true">
          <Card rows={2} action />
          <div className={s.side}><Card rows={2} /><Card /></div>
        </div>
      </main>
    </div>
  );
}

// The health profile forms loading, inside their page (PortalForms): the heading, the part tabs, a card of fields.
export function FormsSkeleton() {
  return (
    <div className={s.forms} aria-busy="true">
      <p className="sr-only" role="status">Loading your forms…</p>
      <div className={s.intro} aria-hidden="true">
        <Bone w="min(400px, 80%)" h={32} />
        <Bone w="min(620px, 100%)" />
        <Bone w="min(420px, 72%)" />
      </div>
      <div className={s.card} aria-hidden="true"><Bone w="min(330px, 100%)" h={36} /></div>
      <div className={s.card} aria-hidden="true">
        <Bone w="42%" h={20} />
        {['28%', '36%', '24%', '32%'].map((w) => <div key={w} className={s.field}><Bone w={w} h={11} /><Bone h={42} /></div>)}
      </div>
    </div>
  );
}
