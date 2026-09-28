import React, { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowUpRight, Plus, Search } from 'lucide-react';
import { adminApi } from '../admin/api';
import { ROLE_LABELS } from '@/lib/staffApps';
import s from './staff-shell.module.css';

// Workspace home, ported from shumard-checkout-portal/app/staff: welcome band, app rack,
// and two "at a glance" cards fed by the portal (upcoming sessions, newest patients).

const DEFAULT_TZ = 'America/Los_Angeles';
const initials = (name) => (name || '').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
const patientName = (b) => [b.patient?.first_name, b.patient?.last_name].filter(Boolean).join(' ') || b.patient?.email || '—';
const stepStatus = (step) => (step === 0 ? ['Refunded', 'red'] : step >= 4 ? ['Complete', 'green'] : [`Step ${step || 1}`, 'amber']);

function fmt(value, tz, options) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...options }).format(date); }
  catch { return new Intl.DateTimeFormat('en-US', options).format(date); }
}

export default function StaffHome() {
  const { profile, role, apps, openPalette } = useOutletContext();
  const firstName = (profile.first_name || profile.name || '').trim().split(/\s+/)[0] || 'there';
  const caps = profile.capabilities || [];
  const tz = profile.timezone || DEFAULT_TZ;
  const showSessions = caps.includes('scheduling.view');
  const showPatients = caps.includes('patients.view');

  // Live clock (to the minute) in the admin display timezone.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const [sessions, setSessions] = useState(null);
  const [patients, setPatients] = useState(null);
  useEffect(() => {
    if (showSessions) {
      adminApi.get('/admin/bookings', { page_size: 4, status: 'confirmed', date_from: new Date().toISOString(), sort: 'soonest' })
        .then((r) => setSessions(r.data.bookings || [])).catch(() => setSessions([]));
    }
    if (showPatients) {
      adminApi.get('/admin/users', { page: 1, page_size: 10 })
        .then((r) => setPatients((r.data.users || []).slice(0, 4))).catch(() => setPatients([]));
    }
  }, [showSessions, showPatients]);

  return (
    <>
      <section className={s.hero} aria-labelledby="staff-greeting">
        <div className={s.readouts}>
          <span className={s.readout}>{fmt(now, tz, { weekday: 'short', month: 'short', day: 'numeric' })} · {fmt(now, tz, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</span>
          <span className={s.readout}>{ROLE_LABELS[role] || role}</span>
          <span className={s.readout}>{apps.length} {apps.length === 1 ? 'app' : 'apps'}</span>
        </div>
        <h1 id="staff-greeting">Welcome back,<br /><span>{firstName}.</span></h1>
        <p>Everything the practice runs on, in one place. Open an app below, or search the workspace.</p>
        <button type="button" className={s.commandBar} onClick={openPalette} aria-keyshortcuts="Meta+K Control+K">
          <Search size={17} aria-hidden="true" /><span>Search apps and portal pages</span><kbd>⌘K</kbd>
        </button>
      </section>

      <section aria-labelledby="apps-title">
        <div className={s.sectionHead}>
          <div><span className={s.kicker}>Your apps</span><h2 id="apps-title">Open an app</h2></div>
          {apps.length > 0 && <p className={s.keysHint}>Press <kbd>1</kbd>{apps.length > 1 && <> to <kbd>{apps.length}</kbd></>} to open</p>}
        </div>
        <ul className={s.rack}>
          {apps.map((app, i) => (
            <li key={app.key}>
              <Link to={app.path} className={s.tile} aria-label={`${app.label}: ${app.blurb}`} aria-keyshortcuts={String(i + 1)}>
                <span className={s.tileTop}><kbd aria-hidden="true">{i + 1}</kbd></span>
                <span className={s.tileIcon} data-tone={app.tone}><app.icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
                <span className={s.tileName}>{app.label}</span>
                <span className={s.tileCopy}>{app.blurb}</span>
                <span className={s.tileFoot}><span className={s.tags}>{(app.tags || []).join(' · ')}</span><ArrowUpRight size={16} className={s.arrow} aria-hidden="true" /></span>
              </Link>
            </li>
          ))}
          <li className={s.socket}>
            <span className={s.socketIcon} aria-hidden="true"><Plus size={18} /></span>
            <span className={s.tileName}>Next app</span>
            <span className={s.tileCopy}>More apps will appear here as they're added to the workspace.</span>
          </li>
        </ul>
      </section>

      {(showSessions || showPatients) && (
        <section aria-labelledby="glance-title">
          <div className={s.sectionHead}>
            <div><span className={s.kicker}>From the portal</span><h2 id="glance-title">At a glance</h2></div>
          </div>
          <div className={s.glance}>
            {showSessions && (
              <section className={s.card} aria-labelledby="upcoming-title">
                <div className={s.cardHeader}>
                  <h3 id="upcoming-title" className={s.kicker}>Up next · Sessions</h3>
                  <Link to="/admin/scheduling/bookings" className={s.cardLink}>Bookings <ArrowUpRight size={14} aria-hidden="true" /></Link>
                </div>
                {sessions && sessions.length === 0
                  ? <p className={s.empty}>No upcoming confirmed sessions.</p>
                  : (
                    <ul className={s.rows}>
                      {(sessions || []).map((b) => (
                        <li key={b.booking_id}>
                          <span className={s.dateTile} aria-hidden="true"><span>{fmt(b.slot_start_utc, tz, { weekday: 'short' })}</span><strong>{fmt(b.slot_start_utc, tz, { day: 'numeric' })}</strong></span>
                          <span className={s.rowText}><strong>{patientName(b)}</strong><span>{b.director_name ? `With ${b.director_name} · ` : ''}{fmt(b.slot_start_utc, tz, { weekday: 'long', month: 'long', day: 'numeric' })}</span></span>
                          <span className={s.time}>{fmt(b.slot_start_utc, tz, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</span>
                        </li>
                      ))}
                    </ul>
                  )}
              </section>
            )}

            {showPatients && (
              <section className={s.card} aria-labelledby="patients-title">
                <div className={s.cardHeader}>
                  <h3 id="patients-title" className={s.kicker}>New patients</h3>
                  <Link to="/admin" className={s.cardLink}>Patients <ArrowUpRight size={14} aria-hidden="true" /></Link>
                </div>
                {patients && patients.length === 0
                  ? <p className={s.empty}>No patients yet.</p>
                  : (
                    <ul className={s.rows}>
                      {(patients || []).map((u) => {
                        const [label, tone] = stepStatus(u.current_step);
                        return (
                          <li key={u.id || u.email}>
                            <span className={s.avatar} aria-hidden="true">{initials(u.name || u.email)}</span>
                            <span className={s.rowText}><strong>{u.name || u.email}</strong><span>Joined {fmt(u.created_at, tz, { month: 'short', day: 'numeric' })}{u.created_at ? ` · ${fmt(u.created_at, tz, { hour: 'numeric', minute: '2-digit' })}` : ''}</span></span>
                            <span className={s.status} data-tone={tone}>{label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
              </section>
            )}
          </div>
        </section>
      )}
    </>
  );
}
