import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowUpRight, CalendarDays, Check, ChevronDown, CreditCard, ExternalLink, Info, Mail, MessageSquare, Save, Send,
  Settings2, ShieldCheck, Upload, UserRound, Users, X,
} from 'lucide-react';
import { adminApi } from '../api';
import { AdminSelect } from '../workspace-ui';
import s from './settings.module.css';

// Scheduling → Settings (prototype scheduling/settings/page.tsx): a rail of four panels over one form, one save bar.
const TABS = [
  { id: 'profile', label: 'Your profile', description: 'Your details & photo', icon: UserRound },
  { id: 'engine', label: 'Booking engine', description: 'Scheduling & routing', icon: Settings2 },
  { id: 'sms', label: 'SMS reminders', description: 'Timing & messages', icon: MessageSquare },
  { id: 'checkout', label: 'Checkout', description: 'Pricing & promotions', icon: CreditCard },
];

const ENGINES = [
  { value: 'local', icon: CalendarDays, title: 'Dr. Shumard portal', tag: 'PORTAL SCHEDULING',
    text: 'Availability set here, round-robin across directors, and a Google Meet link for every session.' },
  { value: 'pb', icon: ExternalLink, title: 'Practice Better', tag: 'LEGACY SCHEDULING',
    text: 'Use your existing Practice Better scheduling and availability settings.' },
];
const ROUTINGS = [
  { value: 'per_director', icon: Users, title: 'Per director', text: 'Record each session under its assigned director.' },
  { value: 'one_director', icon: UserRound, title: 'One director', text: 'Route every session to the same consultant.' },
];

// Fixed set of reminders (mirrors backend SMS_REMINDER_DEFAULTS.items). The editable fields
// (enabled / value / message) come from settings; this is just how each one is presented.
const REMINDER_GROUPS = [
  {
    title: 'Book a session',
    hint: 'For patients who signed up and haven’t booked yet.',
    items: [
      { key: 'book_24h', label: 'First reminder', unit: 'hours after signup' },
      { key: 'book_72h', label: 'Second reminder', unit: 'hours after signup' },
    ],
  },
  {
    title: 'Complete a health profile',
    hint: 'For patients with a booking and unfinished health forms.',
    items: [
      { key: 'forms_24h', label: 'After booking', unit: 'hours after booking' },
      { key: 'forms_pre', label: 'Before appointment', unit: 'hours before appointment' },
    ],
  },
  {
    title: 'Join the appointment',
    hint: 'A timely reminder with the session time and meeting link.',
    items: [
      { key: 'precall', label: 'Pre-call reminder', unit: 'minutes before appointment', preCall: true },
    ],
  },
];
const ITEMS = REMINDER_GROUPS.flatMap((g) => g.items);
// Backend _SMS_REMINDER_VALUE_BOUNDS (server.py) — the API clamps to these; precall is minutes, the rest hours.
const VALUE_BOUNDS = { book_24h: [1, 720], book_72h: [1, 720], forms_24h: [1, 720], forms_pre: [1, 720], precall: [5, 1440] };
const MAX_MESSAGE = 800; // the API truncates longer copy (each SMS segment costs money)
const START_HOURS = Array.from({ length: 24 }, (_, h) => h);     // quiet_start_hour 0–23
const END_HOURS = Array.from({ length: 24 }, (_, h) => h + 1);   // quiet_end_hour 1–24
const hourLabel = (h) => (h % 24 === 0 ? '12:00 AM (midnight)' : `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`);

const PLACEHOLDERS = ['{first_name}', '{link}', '{time}', '{join}'];
const PLACEHOLDER_RE = /(\{first_name\}|\{link\}|\{time\}|\{join\})/g;
const PREVIEW_SAMPLE = {
  '{first_name}': 'Alex',
  '{link}': 'portal.drshumard.com/aB3xY9',
  '{time}': '2:30 PM',
  '{join}': ' Join here: meet.google.com/abc-defg-hij',
};

// /checkout's two Stripe prices (STRIPE_PRICE_ID / STRIPE_PROMO_PRICE_ID), checked against live Stripe 2026-09-26.
// No API returns both (GET /checkout/config gives only the current one), so the preview states them.
const REGULAR_PRICE = 97;
const PROMO_PRICE = 77;

const segmentInfo = (msg = '') => {
  const chars = msg.length;
  const segments = chars <= 160 ? 1 : Math.ceil(chars / 153);
  return { chars, segments };
};

// booking.py fills {time}/{join} only for the pre-call reminder (elsewhere they vanish) and sends unknown
// placeholders exactly as typed — so both would reach patients broken.
function placeholderProblem(msg, preCall) {
  const used = [...(msg || '').matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);
  if (!preCall && used.some((t) => t === 'time' || t === 'join')) return '{time} and {join} only work in the pre-call reminder.';
  const allowed = preCall ? ['first_name', 'link', 'time', 'join'] : ['first_name', 'link'];
  if (used.some((t) => !allowed.includes(t))) {
    return `Use only ${preCall ? '{first_name}, {link}, {time} and {join}' : '{first_name} and {link}'} — anything else is sent as typed.`;
  }
  return '';
}

function renderPreview(msg, allow) {
  const parts = (msg || '').split(PLACEHOLDER_RE);
  return parts.map((part, i) => {
    if (part === '{time}' || part === '{join}') {
      return allow
        ? <span key={i} className={s.previewToken}>{PREVIEW_SAMPLE[part]}</span>
        : <span key={i} className={s.previewBad}>{part}</span>;
    }
    if (part === '{first_name}' || part === '{link}') {
      return <span key={i} className={s.previewToken}>{PREVIEW_SAMPLE[part]}</span>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function initialsOf(name, email) {
  const n = (name || '').trim();
  if (n) return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (email || '?').slice(0, 2).toUpperCase();
}

const toNum = (v) => (v === '' ? '' : Number(v)); // keep an emptied number field empty (validation catches it)

// What each half of the save compares — the fields this page owns (Events writes the rest of /admin/settings).
const profileKey = (p) => JSON.stringify([p.first_name || '', p.last_name || '', p.phone || '', p.avatar_url || '']);
const settingsKey = (x) => JSON.stringify([x.booking_engine, x.shared_pb_consultant_id || '', x.pb_booking_mode || 'one_director',
  x.sms_reminders || {}, !!x.checkout_promo_enabled]);

// Only the dirty half is checked, so an untouched panel can never block saving another.
function validate(profile, draft, { profileDirty, settingsDirty }) {
  const errors = {};
  if (profileDirty) {
    if (!(profile.first_name || '').trim()) errors.first_name = 'Enter your first name.';
    const phone = (profile.phone || '').trim();
    const digits = phone.replace(/\D/g, '').length;
    if (phone && (!/^[+\d\s().-]+$/.test(phone) || digits < 7 || digits > 15)) {
      errors.phone = 'Enter a valid phone number, including the country code.';
    }
  }
  if (settingsDirty) {
    const sms = draft.sms_reminders || {};
    if ((sms.quiet_end_hour ?? 20) <= (sms.quiet_start_hour ?? 9)) errors.quiet_end_hour = 'The end time must be after the start time.';
    const age = sms.booking_max_age_days ?? 14;
    if (!Number.isInteger(age) || age < 1 || age > 365) errors.booking_max_age_days = 'Choose between 1 and 365 days.';
    if (sms.enabled) {
      const items = sms.items || {};
      for (const { key, preCall } of ITEMS) {
        const it = items[key] || {};
        if (!it.enabled) continue;
        const [lo, hi] = VALUE_BOUNDS[key];
        if (!Number.isInteger(it.value) || it.value < lo || it.value > hi) {
          errors[`${key}-value`] = `Choose between ${lo} and ${hi} ${preCall ? 'minutes' : 'hours'}.`;
        }
        const problem = (it.message || '').trim() ? placeholderProblem(it.message, preCall) : 'Write a reminder message.';
        if (problem) errors[`${key}-message`] = problem;
      }
      const first = items.book_24h || {};
      const second = items.book_72h || {};
      if (first.enabled && second.enabled && !errors['book_24h-value'] && !errors['book_72h-value'] && second.value <= first.value) {
        errors['book_72h-value'] = 'Send the second reminder later than the first.';
      }
    }
  }
  return errors;
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className={s.toggle}>
      <span className={s.toggleText}>{checked ? 'On' : 'Off'}</span>
      <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={s.toggleTrack} aria-hidden="true"><span /></span>
    </label>
  );
}

function Field({ id, label, error, hint, className = '', children }) {
  return (
    <div className={`${s.field} ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <span id={`${id}-error`} className={s.error}>{error}</span> : hint ? <span className={s.hint}>{hint}</span> : null}
    </div>
  );
}

function CardHeading({ kicker, title, description, action }) {
  return (
    <div className={s.cardHeading}>
      <div><p className={s.kicker}>{kicker}</p><h2>{title}</h2><p className={s.description}>{description}</p></div>
      {action}
    </div>
  );
}

const invalidProps = (id, error) => ({ 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined });

export default function SettingsTab() {
  const [tab, setTab] = useState('profile');
  const [savedProfile, setSavedProfile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [saved, setSaved] = useState(null);   // settings as last loaded / saved
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState('book_24h');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [testNums, setTestNums] = useState({});
  const [testing, setTesting] = useState({});
  const fileRef = useRef(null);
  const taRefs = useRef({}); // reminder key -> textarea DOM node (for caret insertion)

  useEffect(() => {
    adminApi.get('/user/me').then((r) => { setProfile(r.data); setSavedProfile(r.data); })
      .catch(() => toast.error('Failed to load your profile'));
    adminApi.get('/admin/settings').then((r) => { setDraft(r.data); setSaved(r.data); })
      .catch((e) => toast.error(e?.response?.status === 403 ? 'Admin access required' : 'Failed to load settings'));
  }, []);
  useEffect(() => { setPhotoFailed(false); }, [profile?.avatar_url]);

  if (!profile || !draft) return <div className={s.scope}><p className={s.loading}>Loading settings…</p></div>;

  const profileDirty = profileKey(profile) !== profileKey(savedProfile);
  const settingsDirty = settingsKey(draft) !== settingsKey(saved);
  const dirty = profileDirty || settingsDirty;
  const hasErrors = Object.keys(errors).length > 0;

  // Any edit clears the last save's errors and message (the prototype's behaviour).
  const edited = () => { setErrors({}); setNotice(''); };
  const setP = (k, v) => { setProfile((p) => ({ ...p, [k]: v })); edited(); };
  const set = (k, v) => { setDraft((p) => ({ ...p, [k]: v })); edited(); };
  const isLocal = draft.booking_engine === 'local';
  const routing = draft.pb_booking_mode || 'one_director';
  const promo = !!draft.checkout_promo_enabled;

  const sms = draft.sms_reminders || {};
  const smsItems = sms.items || {};
  const setSms = (patch) => { setDraft((p) => ({ ...p, sms_reminders: { ...(p.sms_reminders || {}), ...patch } })); edited(); };
  const setSmsItem = (key, patch) => {
    setDraft((p) => {
      const cur = p.sms_reminders || {};
      const items = cur.items || {};
      return { ...p, sms_reminders: { ...cur, items: { ...items, [key]: { ...(items[key] || {}), ...patch } } } };
    });
    edited();
  };
  const enabledCount = sms.enabled ? ITEMS.filter(({ key }) => smsItems[key]?.enabled).length : 0;

  const insertToken = (key, token) => {
    const node = taRefs.current[key];
    const cur = (smsItems[key] && smsItems[key].message) || '';
    const start = node ? node.selectionStart : cur.length;
    const end = node ? node.selectionEnd : cur.length;
    const next = cur.slice(0, start) + token + cur.slice(end);
    if (next.length > MAX_MESSAGE) return;
    setSmsItem(key, { message: next });
    requestAnimationFrame(() => {
      if (node) { node.focus(); const pos = start + token.length; node.setSelectionRange(pos, pos); }
    });
  };

  const onTabKey = (e) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const current = TABS.findIndex((t) => t.id === tab);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1
      : (current + (['ArrowDown', 'ArrowRight'].includes(e.key) ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next].id);
    document.getElementById(`settings-tab-${TABS[next].id}`)?.focus();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error('Image too large (max 8MB)'); e.target.value = ''; return; }
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await adminApi.post('/user/me/avatar', fd);
      const url = r.data.avatar_url || '';
      // The upload is saved on the spot, so it belongs to the saved profile too (Discard mustn't undo it).
      setProfile((p) => ({ ...p, avatar_url: url }));
      setSavedProfile((p) => ({ ...p, avatar_url: url }));
      window.dispatchEvent(new Event('profile-updated'));
      toast.success('Photo updated');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not upload that photo');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const sendTest = async (key) => {
    const to = (testNums[key] || '').trim();
    if (!to) { toast.error('Enter a phone number to send a test to.'); return; }
    setTesting((t) => ({ ...t, [key]: true }));
    try {
      const r = await adminApi.post('/booking/reminders/test', { key, to });
      toast.success(`Test sent to ${r.data?.to || to}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not send test');
    } finally {
      setTesting((t) => ({ ...t, [key]: false }));
    }
  };

  const save = async () => {
    if (!dirty || saving) return;
    const found = validate(profile, draft, { profileDirty, settingsDirty });
    setErrors(found);
    if (Object.keys(found).length) {
      if (found.first_name || found.phone) setTab('profile');
      else {
        setTab('sms');
        const bad = ITEMS.find(({ key }) => found[`${key}-value`] || found[`${key}-message`]);
        if (bad) setExpanded(bad.key);
      }
      setNotice('Please check the highlighted fields before saving.');
      return;
    }
    setSaving(true);
    try {
      if (profileDirty) {
        const r = await adminApi.put('/user/me', {
          first_name: profile.first_name || '', last_name: profile.last_name || '',
          phone: profile.phone || '', avatar_url: profile.avatar_url || '',
        });
        setProfile(r.data);
        setSavedProfile(r.data);
        window.dispatchEvent(new Event('profile-updated'));
      }
      if (settingsDirty) {
        const r = await adminApi.put('/admin/settings', {
          booking_engine: draft.booking_engine, shared_pb_consultant_id: draft.shared_pb_consultant_id || '',
          pb_booking_mode: draft.pb_booking_mode || 'one_director', sms_reminders: draft.sms_reminders,
          checkout_promo_enabled: !!draft.checkout_promo_enabled,
        });
        setDraft(r.data);
        setSaved(r.data);
      }
      setNotice('');
      toast.success('All changes saved');
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(detail || 'Save failed');
      setNotice(typeof detail === 'string' ? detail : 'Couldn’t save — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const discard = () => { setProfile(savedProfile); setDraft(saved); setErrors({}); setNotice('Unsaved changes discarded.'); };

  const reminderEditor = ({ key, label, unit, preCall }) => {
    const it = smsItems[key] || {};
    const msg = it.message || '';
    const open = expanded === key;
    const [lo, hi] = VALUE_BOUNDS[key];
    const { chars, segments } = segmentInfo(msg);
    const valueError = errors[`${key}-value`];
    const messageError = errors[`${key}-message`] || placeholderProblem(msg, preCall);
    const tokens = preCall ? PLACEHOLDERS : PLACEHOLDERS.slice(0, 2);
    return (
      <div className={s.reminder} key={key} data-open={open}>
        <div className={s.reminderTop}>
          <button type="button" className={s.reminderTrigger} aria-expanded={open} aria-controls={`sms-${key}-editor`} onClick={() => setExpanded(open ? null : key)}>
            <ChevronDown size={15} className={s.chevron} />
            <span><strong>{label}</strong><small>{it.value === '' || it.value == null ? '—' : it.value} {unit}</small></span>
          </button>
          <Toggle label={`${label} reminder`} checked={!!it.enabled} onChange={(v) => setSmsItem(key, { enabled: v })} />
        </div>
        {open && (
          <div id={`sms-${key}-editor`} className={s.reminderBody}>
            <div className={s.reminderEdit}>
              <Field id={`sms-${key}-value`} label="Send reminder" error={valueError}>
                <div className={s.inputUnit}>
                  <input id={`sms-${key}-value`} type="number" min={lo} max={hi} value={it.value ?? ''}
                    onChange={(e) => setSmsItem(key, { value: toNum(e.target.value) })} {...invalidProps(`sms-${key}-value`, valueError)} />
                  <span>{unit}</span>
                </div>
              </Field>
              <Field id={`sms-${key}-message`} label="Message" error={messageError}>
                <textarea id={`sms-${key}-message`} rows={4} maxLength={MAX_MESSAGE} value={msg}
                  ref={(el) => { taRefs.current[key] = el; }}
                  onChange={(e) => setSmsItem(key, { message: e.target.value })} {...invalidProps(`sms-${key}-message`, messageError)} />
                <div className={s.tokenBar}>
                  <span>Insert</span>
                  {tokens.map((t) => (
                    <button key={t} type="button" disabled={msg.length + t.length > MAX_MESSAGE} onClick={() => insertToken(key, t)}>{t}</button>
                  ))}
                  <small>{chars} chars · {segments} SMS</small>
                </div>
              </Field>
              <Field id={`sms-${key}-test`} label="Send a test" hint="Texts the last saved message to this number.">
                <div className={s.testRow}>
                  {/* Enter here mustn't submit the whole settings form. */}
                  <input id={`sms-${key}-test`} type="tel" placeholder="Test number" value={testNums[key] || ''}
                    onChange={(e) => setTestNums((n) => ({ ...n, [key]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
                  <button type="button" className={s.secondary} disabled={!!testing[key]} onClick={() => sendTest(key)}>
                    <Send size={14} />{testing[key] ? 'Sending…' : 'Send test'}
                  </button>
                </div>
              </Field>
            </div>
            <div className={s.messagePreview}>
              <p className={s.kicker}><MessageSquare size={13} /> MESSAGE PREVIEW</p>
              <p>{msg ? renderPreview(msg, !!preCall) : 'Your message will appear here.'}</p>
              <small>Sample values · {PREVIEW_SAMPLE['{first_name}']}</small>
            </div>
            {preCall && <p className={s.reminderFoot}><Info size={14} />This reminder is sent before the session, even outside the sending window.</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={s.scope}>
      <div className={s.settingsIntro}>
        <div>
          <p className={s.kicker}>PRACTICE PREFERENCES</p>
          <h2>A little setup. A smoother day.</h2>
          <p>Manage how your team books sessions and keeps patients informed.</p>
        </div>
        <span className={s.staffOnly}><ShieldCheck size={14} />Staff settings</span>
      </div>
      <div className={s.layout}>
        <aside className={s.rail}>
          <div className={s.tabs} role="tablist" aria-label="Scheduling settings" aria-orientation="vertical" onKeyDown={onTabKey}>
            {TABS.map(({ id, label, description, icon: Icon }) => (
              <button key={id} id={`settings-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`settings-panel-${id}`}
                tabIndex={tab === id ? 0 : -1} className={s.tab} onClick={() => setTab(id)}>
                <Icon size={17} /><span><strong>{label}</strong><small>{description}</small></span>
              </button>
            ))}
          </div>
          <div className={s.railNote}><Info size={16} /><p>Saved changes take effect straight away — for patient bookings, reminder texts and checkout.</p></div>
        </aside>
        <div className={s.content}>
          <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`} tabIndex={0} className={s.panel}>
              {tab === 'profile' && (
                <section className={s.card}>
                  <CardHeading kicker="01 / STAFF PROFILE" title="Your profile" description="A familiar face for your team. These details are only visible to staff." />
                  <div className={s.cardBody}>
                    <div className={s.photoRow}>
                      <div className={s.avatar}>
                        {profile.avatar_url && !photoFailed
                          ? <img src={profile.avatar_url} alt={profile.name || 'Your profile'} onError={() => setPhotoFailed(true)} />
                          : <span>{initialsOf(profile.name, profile.email)}</span>}
                      </div>
                      <div className={s.photoControls}>
                        <div className={s.inlineActions}>
                          <button type="button" className={s.secondary} disabled={uploadingPhoto} onClick={() => fileRef.current?.click()}>
                            <Upload size={15} />{uploadingPhoto ? 'Uploading…' : 'Upload photo'}
                          </button>
                          {profile.avatar_url && (
                            <button type="button" className={s.textButton} onClick={() => setP('avatar_url', '')}><X size={14} />Remove</button>
                          )}
                        </div>
                        <span className={s.hint}>JPG, PNG or WebP · Up to 8 MB</span>
                        <input ref={fileRef} type="file" accept="image/*" className={s.hiddenInput} aria-label="Choose profile photo" onChange={onFile} />
                      </div>
                    </div>
                    <div className={s.fields}>
                      <Field id="profile-first" label="First name" error={errors.first_name}>
                        <input id="profile-first" autoComplete="given-name" value={profile.first_name || ''}
                          onChange={(e) => setP('first_name', e.target.value)} {...invalidProps('profile-first', errors.first_name)} />
                      </Field>
                      <Field id="profile-last" label="Last name">
                        <input id="profile-last" autoComplete="family-name" value={profile.last_name || ''} onChange={(e) => setP('last_name', e.target.value)} />
                      </Field>
                      <Field id="profile-phone" label="Phone number" hint="Include your country code." error={errors.phone}>
                        <input id="profile-phone" type="tel" autoComplete="tel" placeholder="Optional" value={profile.phone || ''}
                          onChange={(e) => setP('phone', e.target.value)} {...invalidProps('profile-phone', errors.phone)} />
                      </Field>
                      <Field id="profile-email" label="Email address" hint="Your sign-in email is managed by your administrator.">
                        <div className={s.inputIcon}><Mail size={15} /><input id="profile-email" type="email" readOnly value={profile.email || ''} /></div>
                      </Field>
                    </div>
                    <div className={s.infoStrip}><ShieldCheck size={17} /><p>Your name and photo appear across the admin, so colleagues can see who booked or changed what.</p></div>
                  </div>
                </section>
              )}

              {tab === 'engine' && (
                <div className={s.stack}>
                  <section className={s.card}>
                    <CardHeading kicker="02 / SCHEDULING" title="Your booking engine" description="Choose where availability is managed and appointments are created." />
                    <div className={s.cardBody}>
                      <fieldset className={s.radioGrid}>
                        <legend className={s.srOnly}>Booking engine</legend>
                        {ENGINES.map(({ value, icon: Icon, title, text, tag }) => {
                          const on = draft.booking_engine === value;
                          return (
                            <label key={value} className={s.choice} data-checked={on}>
                              <input type="radio" name="booking-engine" value={value} checked={on} onChange={() => set('booking_engine', value)} />
                              <div className={s.choiceTop}><Icon size={20} /><span className={s.radioMark}>{on && <Check size={12} />}</span></div>
                              <strong>{title}</strong>
                              <p>{text}</p>
                              <span className={s.choiceTag}>{tag}</span>
                            </label>
                          );
                        })}
                      </fieldset>
                      <div className={s.infoStrip}>
                        <Info size={17} />
                        <p>
                          {isLocal
                            ? <>Patients see times from each active director’s weekly hours and Google Calendar — set both, or no times are offered. <Link to="/admin/scheduling/hosts">Manage hosts <ArrowUpRight size={12} /></Link></>
                            : 'Availability comes from each active director’s own Practice Better schedule. Weekly hours, time off and closures set here apply only to the portal engine.'}
                        </p>
                      </div>
                    </div>
                  </section>
                  <section className={s.card}>
                    <CardHeading kicker="PRACTICE BETTER ROUTING" title="Where should sessions be recorded?" description="Choose which consultant receives the appointment in Practice Better." />
                    <div className={s.cardBody}>
                      <fieldset className={`${s.radioGrid} ${s.compactChoices}`}>
                        <legend className={s.srOnly}>Practice Better routing</legend>
                        {ROUTINGS.map(({ value, icon: Icon, title, text }) => {
                          const on = routing === value;
                          return (
                            <label key={value} className={s.choice} data-checked={on}>
                              <input type="radio" name="pb-routing" value={value} checked={on} onChange={() => set('pb_booking_mode', value)} />
                              <div className={s.routingTitle}><Icon size={18} /><strong>{title}</strong><span className={s.radioMark}>{on && <Check size={12} />}</span></div>
                              <p>{text}</p>
                            </label>
                          );
                        })}
                      </fieldset>
                      {routing === 'one_director' ? (
                        <Field id="pb-consultant" label="Practice Better consultant ID"
                          hint="The one consultant (asConsultantId) every session is recorded under. Leave blank to skip the Practice Better record.">
                          <input id="pb-consultant" placeholder="Optional" value={draft.shared_pb_consultant_id || ''}
                            onChange={(e) => set('shared_pb_consultant_id', e.target.value)} />
                        </Field>
                      ) : (
                        <div className={s.routingNote}>
                          <Check size={16} />
                          <p>Uses each director’s consultant ID from <Link to="/admin/scheduling/hosts">Hosts</Link>. A director without one is skipped — the portal booking still succeeds.</p>
                        </div>
                      )}
                      <p className={s.hint}>Service IDs for each session type are managed under <Link to="/admin/scheduling/events">Events <ArrowUpRight size={12} /></Link></p>
                    </div>
                  </section>
                </div>
              )}

              {tab === 'sms' && (
                <div className={s.stack}>
                  <section className={s.card}>
                    <CardHeading kicker="03 / PATIENT MESSAGES" title="Thoughtful reminders. Better prepared patients."
                      description="A gentle nudge to book, complete a health profile, and join the call."
                      action={<Toggle label="Automated SMS reminders" checked={!!sms.enabled} onChange={(v) => setSms({ enabled: v })} />} />
                    <div className={s.cardBody}>
                      {!sms.enabled && (
                        <div className={s.pausedNotice}><Info size={16} /><p>SMS reminders are off. Your message settings are kept for when you turn them back on.</p></div>
                      )}
                      <div className={`${s.fields} ${s.threeFields}`}>
                        <Field id="sms-quiet-start" label="Sending window starts" hint="Patient’s local time">
                          <AdminSelect id="sms-quiet-start" label="Sending window starts" value={String(sms.quiet_start_hour ?? 9)}
                            onChange={(v) => setSms({ quiet_start_hour: Number(v) })} options={START_HOURS.map((h) => ({ value: String(h), label: hourLabel(h) }))} />
                        </Field>
                        <Field id="sms-quiet-end" label="Sending window ends" hint="Patient’s local time" error={errors.quiet_end_hour}>
                          <AdminSelect id="sms-quiet-end" label="Sending window ends" value={String(sms.quiet_end_hour ?? 20)}
                            onChange={(v) => setSms({ quiet_end_hour: Number(v) })} options={END_HOURS.map((h) => ({ value: String(h), label: hourLabel(h) }))}
                            invalid={!!errors.quiet_end_hour} describedBy={errors.quiet_end_hour ? 'sms-quiet-end-error' : undefined} />
                        </Field>
                        <Field id="sms-cutoff" label="Stop booking nudges after" hint="Counted from signup" error={errors.booking_max_age_days}>
                          <div className={s.inputUnit}>
                            <input id="sms-cutoff" type="number" min={1} max={365} value={sms.booking_max_age_days ?? 14}
                              onChange={(e) => setSms({ booking_max_age_days: toNum(e.target.value) })} {...invalidProps('sms-cutoff', errors.booking_max_age_days)} />
                            <span>days</span>
                          </div>
                        </Field>
                      </div>
                      <p className={s.windowNote}><Info size={14} />Routine messages send within this window. The reminder just before a call always sends on time.</p>
                    </div>
                  </section>
                  <section className={s.card}>
                    <div className={s.messageHeader}>
                      <div><p className={s.kicker}>MESSAGE SEQUENCE</p><h3>The right message, at the right time.</h3></div>
                      <span className={s.messageCount}>{enabledCount} / {ITEMS.length} enabled</span>
                    </div>
                    <div className={s.sequenceBody}>
                      {REMINDER_GROUPS.map((group, gi) => (
                        <React.Fragment key={group.title}>
                          <div className={s.groupHeading}>
                            <span>{String(gi + 1).padStart(2, '0')}</span>
                            <div><h3>{group.title}</h3><p>{group.hint}</p></div>
                          </div>
                          {group.items.map(reminderEditor)}
                        </React.Fragment>
                      ))}
                      <p className={s.sequenceNote}>
                        <Info size={14} />
                        <span><code>{'{link}'}</code> becomes a one-click portal sign-in link, valid for six hours. <code>{'{time}'}</code> and <code>{'{join}'}</code> (the session time and Meet link) work only in the pre-call reminder.</span>
                      </p>
                    </div>
                  </section>
                </div>
              )}

              {tab === 'checkout' && (
                <div className={s.stack}>
                  <section className={s.card}>
                    <CardHeading kicker="04 / CHECKOUT" title="Make a good start more accessible." description="Control the promotional price offered to new patients at checkout." />
                    <div className={s.cardBody}>
                      <div className={s.promoSetting}>
                        <div><h3>Promotional pricing</h3><p>Charge the reduced price for the strategy session at /checkout.</p></div>
                        <Toggle label="Promotional pricing" checked={promo} onChange={(v) => set('checkout_promo_enabled', v)} />
                      </div>
                      <div className={s.pricePreview}>
                        <div>
                          <span className={s.kicker}>PATIENT CHECKOUT PREVIEW</span>
                          <h3>Diabetes Reversal Strategy Session</h3>
                          <p>A one-time payment for the 30-minute session and its three resources.</p>
                        </div>
                        <div className={s.price}>
                          <div>{promo && <del>${REGULAR_PRICE}</del>}<strong>${promo ? PROMO_PRICE : REGULAR_PRICE}<small>.00</small></strong></div>
                          <span className={s.priceBadge} data-promo={promo}>{promo ? 'PROMO PRICE' : 'REGULAR PRICE'}</span>
                        </div>
                      </div>
                      <div className={s.pricingDetails}>
                        <div><span>Regular price</span><strong>${REGULAR_PRICE}.00</strong></div>
                        <div><span>Promotional price</span><strong>${PROMO_PRICE}.00</strong></div>
                        <div><span>Payment</span><strong>One time · USD</strong></div>
                      </div>
                      <div className={s.infoStrip}>
                        <Info size={17} />
                        <p>While on, /checkout shows and charges the promotional price from the moment you save. Anyone already on the payment step keeps the price they started with.</p>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>

            <div className={s.saveBar}>
              <div className={s.saveStatus} role={hasErrors ? 'alert' : 'status'}>
                <span className={s.stateIcon} data-dirty={dirty} data-error={hasErrors}>
                  {hasErrors ? <X size={14} /> : dirty ? <span /> : <Check size={14} />}
                </span>
                <div>
                  <strong>{hasErrors ? 'A few details need attention' : dirty ? 'You have unsaved changes' : 'All changes saved'}</strong>
                  <small>{notice || (dirty ? 'Save when everything looks right.' : 'Your preferences are up to date.')}</small>
                </div>
              </div>
              <div className={s.saveActions}>
                <button type="button" className={s.secondary} disabled={!dirty || saving} onClick={discard}>Discard</button>
                <button type="submit" className={s.primary} disabled={!dirty || saving}><Save size={15} />{saving ? 'Saving…' : 'Save changes'}</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
