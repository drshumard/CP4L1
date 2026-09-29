import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, Headphones, Info, Pencil, Plus, Search, WandSparkles } from 'lucide-react';
import { adminApi } from '../api';
import { todayYmd } from '../format';
import { confirmDialog } from '../confirm';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AdminSelect } from '../workspace-ui';
import s from './team.module.css';

const NONE = '__none__'; // "Unassigned" — Radix Select can't take '' as an item value

// Patient Care Coordinators join a director's calls for the day as guests (the attendee-only handoff): bulk-fill the
// rota, adjust single days, and keep the coordinator list. Design: prototype coordinators/page.tsx.

const RANGE_LABEL = { day: '1 day', week: '7 days', month: '30 days' };
const MAX_RANGE = 93; // days — the rota API's cap
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const daySpan = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000) + 1;
const shortDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const dayName = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
const teamInitials = (name = '') => name.replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// FastAPI 422s carry a list of problems, not a string.
const errorText = (e, fallback) => {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  return Array.isArray(d) && d.length ? d.map((x) => x?.msg || String(x)).join(' · ') : fallback;
};

export default function Coordinators() {
  const [pccs, setPccs] = useState([]);
  const [pccsLoaded, setPccsLoaded] = useState(false);

  // Add / edit sheet
  const [form, setForm] = useState(null); // { pcc_id, name, email, active }
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [query, setQuery] = useState('');

  // Bulk assign
  const [bulkStart, setBulkStart] = useState(todayYmd());
  const [bulkRange, setBulkRange] = useState('week');
  const [bulkMode, setBulkMode] = useState('round_robin');
  const [bulkPccId, setBulkPccId] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');

  // Rota views
  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(todayYmd());
  const [customStart, setCustomStart] = useState(todayYmd());
  const [customEnd, setCustomEnd] = useState(addDays(todayYmd(), 6));
  const [data, setData] = useState({ dates: [], directors: [], assignments: [] });
  const [loadingRota, setLoadingRota] = useState(true);
  const [reloadKey, setReloadKey] = useState(0); // a bulk assign over the range already on screen still refetches
  const rotaReq = useRef(0);

  const range = useMemo(() => {
    if (view === 'day') return { start: anchor, end: anchor };
    if (view === 'week') return { start: anchor, end: addDays(anchor, 6) };
    return { start: customStart, end: customEnd };
  }, [view, anchor, customStart, customEnd]);

  const loadPccs = useCallback(async () => {
    try { setPccs((await adminApi.get('/admin/pccs')).data.pccs || []); }
    catch { toast.error('Failed to load coordinators'); }
    finally { setPccsLoaded(true); }
  }, []);

  const loadRota = useCallback(async (start, end) => {
    const req = ++rotaReq.current; // quick prev/next clicks: only the latest response lands
    setLoadingRota(true);
    try {
      const res = await adminApi.get('/admin/pcc-assignments', { start, end });
      if (req !== rotaReq.current) return;
      setData({ dates: res.data.dates || [], directors: res.data.directors || [], assignments: res.data.assignments || [] });
    } catch (e) {
      if (req === rotaReq.current) toast.error(errorText(e, 'Failed to load rota'));
    } finally {
      if (req === rotaReq.current) setLoadingRota(false);
    }
  }, []);

  useEffect(() => { loadPccs(); }, [loadPccs]);
  useEffect(() => {
    if (range.start && range.end && range.start <= range.end) loadRota(range.start, range.end);
  }, [range, loadRota, reloadKey]);

  const cellMap = useMemo(() => {
    const m = {};
    for (const a of data.assignments) m[`${a.date}|${a.director_id}`] = a;
    return m;
  }, [data.assignments]);
  const cell = (dateStr, dirId) => cellMap[`${dateStr}|${dirId}`] || {};
  const cellWorks = (dateStr, dirId) => cell(dateStr, dirId).works === true;

  const openNew = () => { setForm({ pcc_id: null, name: '', email: '', active: true }); setFormError(''); setOpen(true); };
  const openEdit = (p) => { setForm({ pcc_id: p.pcc_id, name: p.name || '', email: p.email || '', active: p.active !== false }); setFormError(''); setOpen(true); };

  const saveForm = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name || !EMAIL_RE.test(email)) { setFormError('Enter a name and a valid email address.'); return; }
    setSaving(true);
    setFormError('');
    try {
      // active: the sheet's switch replaces the old Deactivate / Activate menu (DELETE /admin/pccs/{id} only set active: false).
      if (form.pcc_id) await adminApi.put(`/admin/pccs/${form.pcc_id}`, { name, email, active: form.active });
      else await adminApi.post('/admin/pccs', { name, email, active: form.active });
      toast.success(form.pcc_id ? 'Coordinator updated' : 'Coordinator added');
      setOpen(false);
      loadPccs();
    } catch (err) {
      setFormError(errorText(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const assign = async (dateStr, dirId, pccId) => {
    // Show the choice straight away — the save also re-invites that day's bookings, which takes a moment.
    const pcc = pccs.find((p) => p.pcc_id === pccId);
    setData((d) => ({ ...d, assignments: d.assignments.map((a) => (a.date === dateStr && a.director_id === dirId ? { ...a, pcc_id: pccId || null, pcc_name: pcc?.name || null } : a)) }));
    try {
      const res = await adminApi.put('/admin/pcc-assignments', { date: dateStr, director_id: dirId, pcc_id: pccId || null });
      const n = res.data?.bookings_updated ?? 0;
      toast.success(`${pccId ? 'Assigned' : 'Cleared'} · ${n} booking${n === 1 ? '' : 's'} updated`);
    } catch (err) {
      toast.error(errorText(err, 'Could not save'));
    }
    loadRota(range.start, range.end);
  };

  const bulkAssign = async () => {
    if (bulkMode === 'single' && !bulkPccId) { setBulkError('Choose a coordinator first.'); return; }
    setBulkError('');
    const ok = await confirmDialog({
      title: 'Bulk-assign coordinators?',
      message: `This sets coordinators for ${RANGE_LABEL[bulkRange]} from ${shortDate(bulkStart)} (${bulkMode === 'round_robin' ? 'round-robin across all active coordinators' : 'one coordinator for every director'}), replacing any existing assignments in that range.`,
      confirmLabel: 'Assign',
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const res = await adminApi.post('/admin/pcc-assignments/bulk', {
        start_date: bulkStart, range: bulkRange, mode: bulkMode, pcc_id: bulkMode === 'single' ? bulkPccId : null,
      });
      const d = res.data || {};
      toast.success(`Assigned ${d.assignments_set} director-days through ${d.end_date ? shortDate(d.end_date) : bulkStart} · calendar invites updating in the background`);
      if (bulkRange === 'month') { setView('custom'); setCustomStart(bulkStart); setCustomEnd(addDays(bulkStart, 29)); }
      else { setView(bulkRange); setAnchor(bulkStart); }
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(errorText(err, 'Bulk assign failed'));
    } finally {
      setBulkBusy(false);
    }
  };

  const activePccs = pccs.filter((p) => p.active !== false);
  const q = query.trim().toLowerCase();
  const rows = pccs.filter((p) => `${p.name || ''} ${p.email || ''}`.toLowerCase().includes(q));

  // Rota navigation: the date field is the range's first day; the arrows step by the range's length.
  const span = view === 'day' ? 1 : view === 'week' ? 7 : Math.max(1, daySpan(customStart, customEnd));
  const shift = (n) => {
    if (view === 'custom') { setCustomStart((d) => addDays(d, n * span)); setCustomEnd((d) => addDays(d, n * span)); }
    else setAnchor((a) => addDays(a, n * span));
  };
  const setRangeStart = (v) => {
    if (!v) return;
    if (view !== 'custom') { setAnchor(v); return; }
    setCustomStart(v);
    if (customEnd < v || customEnd > addDays(v, MAX_RANGE - 1)) setCustomEnd(addDays(v, 6));
  };
  const chooseView = (v) => {
    if (v === 'custom' && view !== 'custom') {
      setCustomStart(anchor);
      if (customEnd < anchor || customEnd > addDays(anchor, MAX_RANGE - 1)) setCustomEnd(addDays(anchor, 6));
    }
    setView(v);
  };

  // Week / custom: only the dates some director works (no all-off Sat/Sun columns). A single day always shows.
  const cols = view === 'day' ? data.dates : data.dates.filter((d) => data.directors.some((dir) => cellWorks(d, dir.director_id)));
  const workCells = data.assignments.filter((a) => a.works);
  const covered = workCells.filter((a) => a.pcc_id).length;
  const rangeText = `${shortDate(range.start)}${range.end !== range.start ? ` – ${shortDate(range.end)}` : ''}`;

  // Per-cell coordinator picker (the admin dropdown, not the browser's). Inactive coordinators only appear where
  // they're still assigned.
  const cellSelect = (dateStr, dir) => {
    const a = cell(dateStr, dir.director_id);
    const value = a.pcc_id || '';
    const listed = pccs.some((p) => p.pcc_id === value);
    const options = [
      { value: NONE, label: 'Unassigned' },
      ...(value && !listed ? [{ value, label: a.pcc_name || 'Assigned' }] : []),
      ...pccs.filter((p) => p.active !== false || p.pcc_id === value).map((p) => (
        { value: p.pcc_id, label: `${p.name}${p.active === false ? ' (inactive)' : ''}`, disabled: p.active === false })),
    ];
    return (
      <AdminSelect
        value={value || NONE}
        onChange={(v) => assign(dateStr, dir.director_id, v === NONE ? '' : v)}
        options={options}
        label={`Coordinator for ${dir.name} on ${shortDate(dateStr)}`}
        disabled={!activePccs.length && !value}
        className={value ? `${s.rotaSelect} ${s.rotaAssigned}` : s.rotaSelect}
      />
    );
  };
  const cellContent = (dateStr, dir) => (cellWorks(dateStr, dir.director_id) ? cellSelect(dateStr, dir) : <span className={s.off}>Off</span>);

  let rotaEmpty = null;
  if (loadingRota && !data.dates.length) rotaEmpty = 'Loading the rota…';
  else if (!data.directors.length) rotaEmpty = 'No active directors. Add one on the Hosts tab to start planning coverage.';
  else if (!cols.length) rotaEmpty = 'No director works in this range.';

  return (
    <div className={s.page}>
      {/* Bulk assign */}
      <section className={s.card} aria-labelledby="bulk-heading">
        <div className={s.header}>
          <div>
            <span className={s.kicker}>PLAN TOGETHER</span>
            <h2 className={s.title} id="bulk-heading">A little support for every call</h2>
            <p className={s.description}>Assign a patient care coordinator to each director’s day, so every handover feels seamless.</p>
          </div>
          <span className={s.headerIcon}><Headphones size={20} /></span>
        </div>
        <div className={s.bulk}>
          <label className={s.field}>Start date
            <input type="date" value={bulkStart} onChange={(e) => setBulkStart(e.target.value || todayYmd())} />
          </label>
          <div className={s.field}>
            <span>Cover a</span>
            <div className={s.segmented} role="group" aria-label="Assignment duration">
              {[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([value, label]) => (
                <button type="button" key={value} aria-pressed={bulkRange === value} onClick={() => setBulkRange(value)}>{label}</button>
              ))}
            </div>
          </div>
          <div className={s.field}>
            <span>Assign coordinators</span>
            <div className={s.segmented} role="group" aria-label="Assignment method">
              <button type="button" aria-pressed={bulkMode === 'round_robin'} onClick={() => setBulkMode('round_robin')}>Round-robin</button>
              <button type="button" aria-pressed={bulkMode === 'single'} onClick={() => setBulkMode('single')}>One coordinator</button>
            </div>
          </div>
          <button type="button" className={s.button} disabled={bulkBusy || !activePccs.length} onClick={bulkAssign}>
            <WandSparkles size={15} />{bulkBusy ? 'Assigning…' : 'Assign coverage'}
          </button>
          {bulkMode === 'single' && (
            <label className={`${s.field} ${s.coordinatorChoice}`}>Coordinator
              <AdminSelect value={bulkPccId} onChange={(v) => { setBulkPccId(v); setBulkError(''); }} label="Coordinator" placeholder="Choose coordinator"
                options={activePccs.map((p) => ({ value: p.pcc_id, label: `${p.name} · ${p.email}` }))} />
            </label>
          )}
        </div>
        {bulkError && <p className={s.bulkError} role="alert">{bulkError}</p>}
        <div className={s.note}>
          <Info size={14} />
          <span>{RANGE_LABEL[bulkRange]} from {bulkStart ? shortDate(bulkStart) : 'your start date'}. Replaces existing assignments in the range; calendar invites for existing bookings update in the background.</span>
        </div>
      </section>

      {/* Rota */}
      <section className={s.card} aria-labelledby="rota-heading">
        <div className={s.header}>
          <div>
            <span className={s.kicker}>THE COORDINATOR ROTA</span>
            <h2 className={s.title} id="rota-heading">Director coverage</h2>
            <p className={s.description}>{rangeText}{workCells.length > 0 && <span className={s.coverageCount}>{covered}/{workCells.length} covered</span>}</p>
          </div>
          <div className={s.rotaToolbar}>
            <div className={s.segmented} role="group" aria-label="Rota view">
              {[['day', 'Day'], ['week', 'Week'], ['custom', 'Custom']].map(([value, label]) => (
                <button type="button" key={value} aria-pressed={view === value} onClick={() => chooseView(value)}>{label}</button>
              ))}
            </div>
            <div className={s.rotaDate}>
              <button type="button" className={s.iconButton} aria-label="Previous rota period" onClick={() => shift(-1)}><ChevronLeft size={15} /></button>
              <input type="date" aria-label="Rota start date" value={view === 'custom' ? customStart : anchor} onChange={(e) => setRangeStart(e.target.value)} />
              <button type="button" className={s.iconButton} aria-label="Next rota period" onClick={() => shift(1)}><ChevronRight size={15} /></button>
            </div>
          </div>
        </div>
        {view === 'custom' && (
          <div className={s.customRange}>
            <label className={s.field}>Until
              <input
                type="date" value={customEnd} min={customStart} max={addDays(customStart, MAX_RANGE - 1)}
                onChange={(e) => { const v = e.target.value; if (v && v >= customStart && v <= addDays(customStart, MAX_RANGE - 1)) setCustomEnd(v); }}
              />
            </label>
            <span>Choose up to {MAX_RANGE} days. Scroll across to view the full range.</span>
          </div>
        )}
        {pccsLoaded && !activePccs.length && (
          <div className={`${s.inlineNotice} ${s.cardNotice}`}><Info size={15} /><span>Add a coordinator below before assigning the rota.</span></div>
        )}

        {rotaEmpty ? (
          <div className={s.empty}>{rotaEmpty}</div>
        ) : (
          <div className={loadingRota ? s.rotaBusy : undefined}>
            <div className={s.rotaScroll}>
              <table className={s.rota} style={{ minWidth: Math.max(500, 170 + cols.length * 142) }}>
                <thead>
                  <tr><th>Director</th>{cols.map((d) => <th key={d}>{dayName(d)}<small>{shortDate(d)}</small></th>)}</tr>
                </thead>
                <tbody>
                  {data.directors.map((dir) => (
                    <tr key={dir.director_id}>
                      <td><span className={s.rotaHost}><span className={s.avatar}>{teamInitials(dir.name)}</span><span>{dir.name}</span></span></td>
                      {cols.map((d) => <td key={d}>{cellContent(d, dir)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={s.rotaMobile}>
              {cols.map((d) => (
                <section className={s.rotaDay} key={d}>
                  <h3>{dayName(d)}, {shortDate(d)}</h3>
                  {data.directors.map((dir) => (
                    <label key={dir.director_id}><span>{dir.name}</span>{cellContent(d, dir)}</label>
                  ))}
                </section>
              ))}
            </div>
          </div>
        )}
        <div className={s.legend}>
          <span><i />Assigned</span>
          <span><i />Unassigned · Off</span>
          <span className={s.rotaLocal}>Changes update that day’s calendar invites</span>
        </div>
      </section>

      {/* Coordinator list */}
      <section className={s.card} aria-labelledby="coordinators-heading">
        <div className={s.header}>
          <div>
            <span className={s.kicker}>THE SUPPORT TEAM</span>
            <h2 id="coordinators-heading" className={s.title}>Coordinators</h2>
            <p className={s.description}>{activePccs.length} active team member{activePccs.length === 1 ? '' : 's'} ready to support your patients.</p>
          </div>
          <button type="button" className={s.button} onClick={openNew}><Plus size={15} />Add coordinator</button>
        </div>
        <div className={s.toolbar}>
          <div className={s.search}>
            <Search size={16} />
            <input type="search" aria-label="Search coordinators" placeholder="Search name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <span className={s.count}>{rows.length} coordinator{rows.length === 1 ? '' : 's'}</span>
        </div>
        {rows.length > 0 && (
          <>
            <div className={s.desktop}>
              <table className={s.table}>
                <thead><tr><th>Name</th><th>Email</th><th>Status</th><th><span className="sr-only">Edit</span></th></tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.pcc_id}>
                      <td><button type="button" className={s.person} onClick={() => openEdit(p)}><span className={s.avatar}>{teamInitials(p.name)}</span><strong>{p.name}</strong></button></td>
                      <td><span className={s.coordinatorEmail}>{p.email}</span></td>
                      <td><span className={s.badge} data-active={p.active !== false}><i />{p.active !== false ? 'Active' : 'Inactive'}</span></td>
                      <td><button type="button" className={s.iconButton} aria-label={`Edit coordinator ${p.name}`} onClick={() => openEdit(p)}><Pencil size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={s.mobileList}>
              {rows.map((p) => (
                <article className={s.mobileRow} key={p.pcc_id}>
                  <div className={s.mobileTop}>
                    <button type="button" className={s.person} onClick={() => openEdit(p)}><span className={s.avatar}>{teamInitials(p.name)}</span><span><strong>{p.name}</strong><small>{p.email}</small></span></button>
                    <button type="button" className={s.iconButton} aria-label={`Edit coordinator ${p.name}`} onClick={() => openEdit(p)}><Pencil size={14} /></button>
                  </div>
                  <div className={s.mobileMeta}><span className={s.badge} data-active={p.active !== false}><i />{p.active !== false ? 'Active' : 'Inactive'}</span></div>
                </article>
              ))}
            </div>
          </>
        )}
        {!rows.length && (
          <div className={s.empty}>
            <Search size={22} />
            <h3>{!pccsLoaded ? 'Loading coordinators…' : q ? 'No coordinators found' : 'No coordinators yet'}</h3>
            {pccsLoaded && <p>{q ? 'Try another name or email address.' : 'Add one to start covering directors’ calls.'}</p>}
            {q && <button type="button" className={s.secondary} onClick={() => setQuery('')}>Clear search</button>}
          </div>
        )}
        <div className={s.note}>
          <Headphones size={14} />
          <span>Coordinators join a director’s calls for the day as guests, so the director can hand the patient over and leave the call early — the meeting keeps running. Set Host Management off on consult meetings so the call can’t be ended accidentally. Inactive coordinators stay on the list but aren’t used for new coverage.</span>
        </div>
      </section>

      {/* Add / edit sheet */}
      <Sheet open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        <SheetContent className={s.sheet}>
          <SheetHeader className={s.sheetHeader}>
            <span className={s.kicker}>SUPPORT TEAM</span>
            <SheetTitle>{form?.pcc_id ? 'Edit coordinator' : 'Add coordinator'}</SheetTitle>
            <SheetDescription>Patient Care Coordinators can be assigned to cover a director’s calls on the rota.</SheetDescription>
          </SheetHeader>
          {form && (
            <form className={s.form} onSubmit={saveForm} noValidate>
              <label className={s.field}>Name
                <input autoFocus maxLength={80} value={form.name} placeholder="Jane Coordinator" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className={s.field}>Email address
                <input type="email" value={form.email} placeholder="jane@drshumard.com" onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </label>
              <label className={s.statusToggle}>
                <span><strong>Active coordinator</strong><small>Include this person in new coverage assignments.</small></span>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
              </label>
              {!form.active && (
                <div className={s.inlineNotice}><Info size={15} /><span>Existing assignments stay on the rota. Reassign their days to keep your directors covered.</span></div>
              )}
              {formError && <p className={s.error} role="alert">{formError}</p>}
              <div className={s.actions}>
                <button type="button" className={s.secondary} disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className={s.button} disabled={saving}><Check size={15} />{saving ? 'Saving…' : form.pcc_id ? 'Save coordinator' : 'Add coordinator'}</button>
              </div>
              <p className={s.micro}>Their Google calendar and timezone — for hosting sessions — are on Hosts → PCCs.</p>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
