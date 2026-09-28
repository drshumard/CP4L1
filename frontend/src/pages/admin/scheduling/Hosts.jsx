import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarCheck2, CalendarDays, CircleAlert, Info, Link2, Pencil, Plus, Search, UsersRound } from 'lucide-react';
import { adminApi } from '../api';
import HostSheet, { zoneLabel } from './HostSheet';
import s from './team.module.css';

// Hosts = anyone who can host a booked session (owns a Google calendar). Only Directors appear on the patient portal;
// PCCs / HCs / VA are manual-book-only hosts. Directors, HCs and VAs share the directors collection (by `role`);
// PCCs live in their own — they're also the coordinators on the rota. Design: prototype hosts/page.tsx.
const ROLES = [
  { key: 'director', label: 'Directors', one: 'director', many: 'directors',
    description: 'The people leading your consultations. Manage their calendars, availability and time away.',
    empty: 'No directors yet. Add one to start taking bookings.' },
  { key: 'pcc', label: 'PCCs', one: 'PCC', many: 'PCCs',
    description: 'Patient Care Coordinators — rota coordinators and manual-book hosts. Give each a Google calendar to host a session; assign them to directors’ days on the Coordinators tab.',
    empty: 'None yet. Add one to pick them as a host in a manual booking.' },
  { key: 'hc', label: 'HCs', one: 'health coach', many: 'health coaches',
    description: 'Health Coaches — manual-book-only hosts. Never shown on the patient portal; pick them as the meeting host when booking manually.',
    empty: 'None yet. Add one to pick them as a host in a manual booking.' },
  { key: 'va', label: 'VA', one: 'assistant', many: 'assistants',
    description: 'Virtual Assistants — manual-book-only hosts. Never shown on the patient portal; pick them as the meeting host when booking manually.',
    empty: 'None yet. Add one to pick them as a host in a manual booking.' },
];

const teamInitials = (name = '') => name.replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const rulesLabel = (h) => {
  const overrides = (h.date_overrides || []).length;
  return `${plural((h.weekly_rules || []).length, 'weekly rule')}${overrides ? ` · ${plural(overrides, 'override')}` : ''}`;
};

function Person({ host, onClick }) {
  return (
    <button type="button" className={s.person} onClick={onClick}>
      <span className={s.avatar}>{teamInitials(host.name)}</span>
      <span><strong>{host.name}</strong><small>{host.email || 'No email'}</small></span>
    </button>
  );
}

function CalendarStatus({ host }) {
  const label = host.google_calendar_id ? 'Calendar added' : host.use_primary_calendar ? 'Primary calendar' : 'Not set';
  const connected = label !== 'Not set';
  return (
    <span className={s.connection} data-connected={connected} title={host.google_calendar_id || undefined}>
      {connected ? <Link2 size={13} /> : <CircleAlert size={13} />}{label}
    </span>
  );
}

function ActiveBadge({ host }) {
  const active = host.active !== false;
  return <span className={s.badge} data-active={active}><i />{active ? 'Active' : 'Inactive'}</span>;
}

export default function Hosts() {
  const [data, setData] = useState({ directors: [], pccs: [] });
  const [loading, setLoading] = useState(true);
  const [engine, setEngine] = useState(null);
  const [roleKey, setRoleKey] = useState('director');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // { role, host (null = new), tab }

  const load = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([adminApi.get('/admin/directors'), adminApi.get('/admin/pccs')]);
      setData({ directors: d.data.directors || [], pccs: p.data.pccs || [] });
    } catch (e) {
      toast.error(e?.response?.status === 403 ? 'Admin access required' : 'Failed to load hosts');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    adminApi.get('/admin/settings').then((r) => setEngine(r.data?.booking_engine || 'pb')).catch(() => {});
  }, []);

  const byRole = useMemo(() => ({
    director: data.directors.filter((d) => (d.role || 'director') === 'director'),
    pcc: data.pccs,
    hc: data.directors.filter((d) => d.role === 'hc'),
    va: data.directors.filter((d) => d.role === 'va'),
  }), [data]);
  const role = ROLES.find((r) => r.key === roleKey);
  const isDirectors = roleKey === 'director';
  const q = query.trim().toLowerCase();
  const rows = byRole[roleKey].filter((h) => `${h.name || ''} ${h.email || ''}`.toLowerCase().includes(q));
  const openHost = (host, tab = 'profile') => setEditing({ role: roleKey, host, tab });
  const availability = (h) => (isDirectors
    ? <button type="button" className={s.rulesLink} onClick={() => openHost(h, 'availability')}><CalendarDays size={13} />{rulesLabel(h)}</button>
    : <span className={s.micro}>Manual bookings only</span>);

  return (
    <div className={s.page}>
      <section className={s.card} aria-labelledby="hosts-heading">
        <div className={s.header}>
          <div>
            <span className={s.kicker}>YOUR PRACTICE TEAM</span>
            <h2 id="hosts-heading" className={s.title}>Hosts</h2>
            <p className={s.description}>Every role, every calendar. A little easier to manage.</p>
          </div>
          <button type="button" className={s.button} onClick={() => openHost(null)}><Plus size={15} />Add {role.one}</button>
        </div>

        <div className={s.roleNav}>
          <div className={s.segmented} role="group" aria-label="Host roles">
            {ROLES.map((r) => (
              <button type="button" key={r.key} aria-pressed={roleKey === r.key} onClick={() => { setRoleKey(r.key); setQuery(''); }}>
                {r.label}<small>{byRole[r.key].length}</small>
              </button>
            ))}
          </div>
          <p>{role.description}</p>
          {isDirectors && engine === 'pb' && (
            <div className={s.inlineNotice}>
              <Info size={15} />
              <span>Booking engine is <strong>Practice Better (legacy)</strong>: patient availability comes from each active director’s own Practice Better schedule (via their PB consultant ID). The weekly hours, time off and date overrides here apply only when the engine is Portal (local).</span>
            </div>
          )}
        </div>

        <div className={s.toolbar}>
          <div className={s.search}>
            <Search size={16} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email" aria-label="Search hosts" />
          </div>
          <span className={s.count}>{rows.length} {rows.length === 1 ? role.one : role.many}</span>
        </div>

        {rows.length > 0 && (
          <>
            <div className={s.desktop}>
              <table className={s.table}>
                <thead>
                  <tr><th>Name</th><th>Timezone</th><th>Calendar</th><th>Availability</th><th>Status</th><th><span className="sr-only">Edit host</span></th></tr>
                </thead>
                <tbody>
                  {rows.map((h) => (
                    <tr key={h.pcc_id || h.director_id}>
                      <td><Person host={h} onClick={() => openHost(h)} /></td>
                      <td><span className={s.mono}>{zoneLabel(h.timezone)}</span></td>
                      <td><CalendarStatus host={h} /></td>
                      <td>{availability(h)}</td>
                      <td><ActiveBadge host={h} /></td>
                      <td><button type="button" className={s.iconButton} aria-label={`Edit ${h.name}`} onClick={() => openHost(h)}><Pencil size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={s.mobileList}>
              {rows.map((h) => (
                <article className={s.mobileRow} key={h.pcc_id || h.director_id}>
                  <div className={s.mobileTop}>
                    <Person host={h} onClick={() => openHost(h)} />
                    <button type="button" className={s.iconButton} aria-label={`Edit ${h.name}`} onClick={() => openHost(h)}><Pencil size={14} /></button>
                  </div>
                  <div className={s.mobileMeta}>
                    <div><span className={s.mono}>{zoneLabel(h.timezone)}</span><CalendarStatus host={h} /></div>
                    <div><ActiveBadge host={h} /><span className={s.micro}>{isDirectors ? rulesLabel(h) : 'Manual bookings only'}</span></div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        {!rows.length && (
          <div className={s.empty}>
            <UsersRound size={24} />
            <h3>{loading ? 'Loading hosts…' : q ? 'No hosts found' : `No ${role.many} yet`}</h3>
            {!loading && <p>{q ? 'Try another name or email address.' : role.empty}</p>}
            {q && <button type="button" className={s.secondary} onClick={() => setQuery('')}>Clear search</button>}
          </div>
        )}
        {isDirectors && (
          <div className={s.note}><CalendarCheck2 size={15} /><span>Weekly availability is set in each director’s own timezone. Time off takes priority over their usual hours.</span></div>
        )}
      </section>

      <HostSheet
        target={editing}
        singular={ROLES.find((r) => r.key === editing?.role)?.one || role.one}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </div>
  );
}
