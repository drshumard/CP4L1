import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/staffApps';
import s from './staff-shell.module.css';

export default function StaffHome() {
  const { profile, role, apps } = useOutletContext();
  const firstName = (profile.first_name || profile.name || '').trim().split(/\s+/)[0] || 'there';

  return (
    <div>
      <div className={s.heading}>
        <div>
          <p className={s.eyebrow}>Team workspace</p>
          <h1>Welcome, {firstName}</h1>
          <p>Signed in as {ROLE_LABELS[role] || role}. Pick an app to get started.</p>
        </div>
      </div>

      <div className={s.tiles}>
        {apps.map((a) => (
          <Link key={a.key} to={a.path} className={s.tile}>
            <span className={s.tileIcon}><a.icon size={19} strokeWidth={1.75} /></span>
            <span>
              <strong>{a.label}</strong>
              <p>{a.blurb}</p>
            </span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ))}
      </div>

      <p className={s.tilesNote}>More apps will appear here as they're added to the portal.</p>
    </div>
  );
}
