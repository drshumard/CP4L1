import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Trash2, Eye, Globe, Lock } from 'lucide-react';
import { adminApi, authHeaders } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

const EYEBROW = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function NumField({ label, value, onChange, min, max, suffix, help }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} className="w-24" aria-label={suffix ? `${label} (${suffix})` : label} />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

export default function Events() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    adminApi.get('/admin/settings').then((res) => setS(res.data))
      .catch((e) => toast.error(e?.response?.status === 403 ? 'Admin access required' : 'Failed to load settings'));
  }, []);

  if (!s) return <div className="py-12 text-center text-muted-foreground">Loading...</div>;

  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const closures = s.clinic_closures || [];
  const setClosures = (next) => set('clinic_closures', next);
  const sessions = s.sessions || [];
  const setSessions = (next) => set('sessions', next);
  const updateSession = (i, k, v) => setSessions(sessions.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  const addSession = () => setSessions([...sessions, { id: newId(), title: '', description: '', duration_minutes: 30, portal_visible: false, pb_service_id: '' }]);
  const removeSession = (i) => setSessions(sessions.filter((_, idx) => idx !== i));

  const save = async () => {
    for (const sess of sessions) {
      if (!(sess.title || '').trim()) { toast.error('Each session needs a name'); return; }
    }
    setSaving(true);
    try {
      const payload = {
        sessions: sessions.map((x) => ({
          id: x.id, title: (x.title || '').trim(), description: x.description || '',
          duration_minutes: Number(x.duration_minutes) || 30, portal_visible: !!x.portal_visible,
          pb_service_id: (x.pb_service_id || '').trim(),
        })),
        slot_minutes: Number(s.slot_minutes), min_notice_minutes: Number(s.min_notice_minutes),
        max_advance_days: Number(s.max_advance_days), buffer_minutes: Number(s.buffer_minutes),
        availability_days: Number(s.availability_days),
        clinic_closures: closures.filter((c) => c.start_utc && c.end_utc)
          .map((c) => ({ start_utc: c.start_utc, end_utc: c.end_utc, reason: c.reason || '' })),
      };
      const res = await adminApi.put('/admin/settings', payload);
      setS(res.data);
      toast.success('Events & availability saved');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const base = process.env.REACT_APP_BACKEND_URL + '/api/booking/availability';
      const res = await axios.get(base, { params: { start_date: today, days: 14 }, headers: authHeaders() });
      setPreview(res.data);
    } catch { toast.error('Preview failed'); } finally { setPreviewing(false); }
  };

  return (
    <div className="space-y-6">
      {/* Sessions */}
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className={EYEBROW}>Sessions</p>
          <Button size="sm" onClick={addSession}><Plus className="size-4" /> Add session</Button>
        </div>
        <div className="mt-4 space-y-3">
          {sessions.length === 0 && <p className="text-sm text-muted-foreground">No sessions yet. Add one to start taking bookings.</p>}
          {sessions.map((sess, i) => (
            <div key={sess.id || i} className="rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${sess.portal_visible ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                  {sess.portal_visible ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
                  {sess.portal_visible ? 'Bookable on portal' : 'Manual only'}
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch id={`pv-${i}`} checked={!!sess.portal_visible} onCheckedChange={(v) => updateSession(i, 'portal_visible', v)} />
                    <Label htmlFor={`pv-${i}`} className="cursor-pointer text-xs font-normal text-muted-foreground">Show on portal</Label>
                  </div>
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Remove session" onClick={() => removeSession(i)}><Trash2 className="size-4" /></Button>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor={`title-${i}`}>Name</Label>
                  <Input id={`title-${i}`} value={sess.title || ''} onChange={(e) => updateSession(i, 'title', e.target.value)} placeholder="Strategy Session" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`dur-${i}`}>Duration (minutes)</Label>
                  <Input id={`dur-${i}`} type="number" min={5} max={240} value={sess.duration_minutes ?? 30} onChange={(e) => updateSession(i, 'duration_minutes', e.target.value)} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor={`desc-${i}`}>Description</Label>
                  <Textarea id={`desc-${i}`} rows={2} value={sess.description || ''} onChange={(e) => updateSession(i, 'description', e.target.value)} placeholder="Shown on the Google event and in patient emails" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`svc-${i}`}>Practice Better service ID</Label>
                  <Input id={`svc-${i}`} value={sess.pb_service_id || ''} onChange={(e) => updateSession(i, 'pb_service_id', e.target.value)} placeholder="Optional" />
                  <p className="text-xs text-muted-foreground">PB service this session records under.</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Booking rules */}
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <p className={EYEBROW}>Booking rules</p>
        <p className="mt-1 text-sm text-muted-foreground">How the patient calendar offers and limits online slots.</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumField label="Slot length" value={s.slot_minutes} onChange={(v) => set('slot_minutes', v)} min={5} max={240} suffix="min" help="How often a start time is offered" />
          <NumField label="Minimum notice" value={s.min_notice_minutes} onChange={(v) => set('min_notice_minutes', v)} min={0} suffix="min" help="Earliest bookable lead time" />
          <NumField label="Max advance" value={s.max_advance_days} onChange={(v) => set('max_advance_days', v)} min={1} max={365} suffix="days" />
          <NumField label="Buffer after call" value={s.buffer_minutes} onChange={(v) => set('buffer_minutes', v)} min={0} suffix="min" />
          <NumField label="Patient booking window" value={s.availability_days} onChange={(v) => set('availability_days', v)} min={1} max={90} suffix="days" help="Days shown on the patient calendar" />
        </div>
      </section>

      {/* Clinic closures */}
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className={EYEBROW}>Clinic closures</p>
            <p className="mt-1 text-sm text-muted-foreground">Org-wide blocks (holidays) that close every director.</p>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setClosures([...closures, { start_utc: '', end_utc: '', reason: '' }])}>
            <Plus className="size-3.5" /> Add closure
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {closures.length === 0 && <p className="text-xs text-muted-foreground">No closures.</p>}
          {closures.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input type="datetime-local" value={isoToLocalInput(c.start_utc)} className="w-[205px]"
                onChange={(e) => setClosures(closures.map((x, idx) => idx === i ? { ...x, start_utc: localInputToIso(e.target.value) } : x))} />
              <span className="text-muted-foreground">to</span>
              <Input type="datetime-local" value={isoToLocalInput(c.end_utc)} className="w-[205px]"
                onChange={(e) => setClosures(closures.map((x, idx) => idx === i ? { ...x, end_utc: localInputToIso(e.target.value) } : x))} />
              <Input value={c.reason || ''} placeholder="Reason" className="min-w-[120px] flex-1"
                onChange={(e) => setClosures(closures.map((x, idx) => idx === i ? { ...x, reason: e.target.value } : x))} />
              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Remove closure" onClick={() => setClosures(closures.filter((_, idx) => idx !== i))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save events & availability'}</Button>
        <Button variant="outline" onClick={runPreview} disabled={previewing}><Eye className="size-4" /> {previewing ? 'Loading...' : 'Preview next 14 days'}</Button>
      </div>

      {preview && (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <p className={EYEBROW}>Preview</p>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">Reflects the currently active engine. Switch the engine to &quot;local&quot; under Settings to preview the portal&apos;s own availability.</p>
          {(preview.dates_with_availability || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No available times in the next 14 days.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-foreground">
                <span className="font-semibold">{(preview.dates_with_availability || []).length}</span> day(s) with availability ·{' '}
                <span className="font-semibold">{(preview.slots || []).length}</span> slot(s)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(preview.slots || []).slice(0, 24).map((slot, i) => (
                  <span key={i} className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                    {new Date(slot.start_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                ))}
                {(preview.slots || []).length > 24 && <span className="self-center text-xs text-muted-foreground">+{preview.slots.length - 24} more</span>}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
