import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Upload, Info, ChevronRight, Send } from 'lucide-react';
import { adminApi } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';

const EYEBROW = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const TG_ON = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground';

// Fixed set of reminders (mirrors backend SMS_REMINDER_DEFAULTS.items). The editable fields
// (enabled / value / message) come from settings; this is just how each one is presented.
const REMINDER_GROUPS = [
  {
    title: 'Booking reminders',
    hint: 'Sent to someone who signed up but has not booked their consultation yet.',
    items: [
      { key: 'book_24h', label: 'First reminder', unit: 'hours after signup', short: 'after signup' },
      { key: 'book_72h', label: 'Second reminder', unit: 'hours after signup', short: 'after signup' },
    ],
  },
  {
    title: 'Forms reminders',
    hint: 'Sent to someone who booked but has not completed their health forms.',
    items: [
      { key: 'forms_24h', label: 'After booking', unit: 'hours after booking', short: 'after booking' },
      { key: 'forms_pre', label: 'Before appointment', unit: 'hours before appointment', short: 'before appt' },
    ],
  },
  {
    title: 'Appointment reminder',
    hint: 'Sent shortly before the appointment. Always sends — it ignores quiet hours.',
    items: [
      { key: 'precall', label: 'Pre-call reminder', unit: 'minutes before appointment', short: 'before appt', preCall: true },
    ],
  },
];

const PLACEHOLDERS = ['{first_name}', '{link}', '{time}', '{join}'];
const PLACEHOLDER_RE = /(\{first_name\}|\{link\}|\{time\}|\{join\})/g;
const PREVIEW_SAMPLE = {
  '{first_name}': 'Alex',
  '{link}': 'portal.drshumard.com/aB3xY9',
  '{time}': '2:30 PM',
  '{join}': ' Join here: meet.google.com/abc-defg-hij',
};

const segmentInfo = (msg = '') => {
  const chars = msg.length;
  const segments = chars <= 160 ? 1 : Math.ceil(chars / 153);
  return { chars, segments };
};
// {time}/{join} only resolve for the pre-call reminder; flag them anywhere else.
const disallowedUsed = (msg = '', allow = false) =>
  allow ? [] : ['{time}', '{join}'].filter((t) => msg.includes(t));

function renderPreview(msg, allow) {
  const parts = (msg || '').split(PLACEHOLDER_RE);
  return parts.map((part, i) => {
    if (part === '{time}' || part === '{join}') {
      return allow
        ? <span key={i} className="rounded bg-primary/15 px-1 text-primary">{PREVIEW_SAMPLE[part]}</span>
        : <span key={i} className="rounded bg-red-100 px-1 text-red-600">{part}</span>;
    }
    if (part === '{first_name}' || part === '{link}') {
      return <span key={i} className="rounded bg-primary/15 px-1 text-primary">{PREVIEW_SAMPLE[part]}</span>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function initialsOf(name, email) {
  const n = (name || '').trim();
  if (n) return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (email || '?').slice(0, 2).toUpperCase();
}

export default function SettingsTab() {
  const [profile, setProfile] = useState(null);
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [dirtyProfile, setDirtyProfile] = useState(false);
  const [dirtySettings, setDirtySettings] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [openMap, setOpenMap] = useState({});
  const [testNums, setTestNums] = useState({});
  const [testing, setTesting] = useState({});
  const fileRef = useRef(null);
  const taRefs = useRef({});          // reminder key -> textarea DOM node (for caret insertion)
  const focusedKeyRef = useRef(null); // which reminder message box last had focus

  useEffect(() => {
    adminApi.get('/user/me').then((r) => setProfile(r.data)).catch(() => toast.error('Failed to load your profile'));
    adminApi.get('/admin/settings').then((r) => setS(r.data))
      .catch((e) => toast.error(e?.response?.status === 403 ? 'Admin access required' : 'Failed to load settings'));
  }, []);

  if (!profile || !s) return <div className="py-12 text-center text-muted-foreground">Loading...</div>;

  const setP = (k, v) => { setProfile((p) => ({ ...p, [k]: v })); setDirtyProfile(true); };
  const set = (k, v) => { setS((p) => ({ ...p, [k]: v })); setDirtySettings(true); };
  const isLocal = s.booking_engine === 'local';

  const sms = s.sms_reminders || {};
  const smsItems = sms.items || {};
  const setSms = (patch) => { setS((p) => ({ ...p, sms_reminders: { ...(p.sms_reminders || {}), ...patch } })); setDirtySettings(true); };
  const setSmsItem = (key, patch) => {
    setS((p) => {
      const cur = p.sms_reminders || {};
      const items = cur.items || {};
      return { ...p, sms_reminders: { ...cur, items: { ...items, [key]: { ...(items[key] || {}), ...patch } } } };
    });
    setDirtySettings(true);
  };

  const insertPlaceholder = (token) => {
    const key = focusedKeyRef.current;
    if (!key) { toast.info('Click into a message box first, then tap a placeholder.'); return; }
    const node = taRefs.current[key];
    const cur = (smsItems[key] && smsItems[key].message) || '';
    const start = node ? node.selectionStart : cur.length;
    const end = node ? node.selectionEnd : cur.length;
    const next = cur.slice(0, start) + token + cur.slice(end);
    setSmsItem(key, { message: next });
    requestAnimationFrame(() => {
      if (node) { node.focus(); const pos = start + token.length; node.setSelectionRange(pos, pos); }
    });
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
      setProfile((p) => ({ ...p, avatar_url: r.data.avatar_url || '' }));
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

  const saveAll = async () => {
    setSaving(true);
    try {
      if (dirtyProfile) {
        const r = await adminApi.put('/user/me', {
          first_name: profile.first_name || '', last_name: profile.last_name || '',
          phone: profile.phone || '', avatar_url: profile.avatar_url || '',
        });
        setProfile(r.data);
        window.dispatchEvent(new Event('profile-updated'));
      }
      if (dirtySettings) {
        const r = await adminApi.put('/admin/settings', {
          booking_engine: s.booking_engine, shared_pb_consultant_id: s.shared_pb_consultant_id || '',
          pb_booking_mode: s.pb_booking_mode || 'one_director', sms_reminders: s.sms_reminders,
        });
        setS(r.data);
      }
      setDirtyProfile(false); setDirtySettings(false); setSavedOnce(true);
      toast.success('All changes saved');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const dirty = dirtyProfile || dirtySettings;
  const statusLabel = dirty ? 'Unsaved changes' : (savedOnce ? 'All changes saved' : 'No unsaved changes');

  return (
    <div className="max-w-4xl">
      <Tabs defaultValue="profile">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="engine">Booking engine</TabsTrigger>
          <TabsTrigger value="sms">SMS reminders</TabsTrigger>
        </TabsList>

        {/* ---------------- Profile ---------------- */}
        <TabsContent value="profile" className="mt-4">
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <p className={EYEBROW}>Your profile</p>
            <p className="mt-1 text-sm text-muted-foreground">Your name and photo appear across the admin. Visible to staff only.</p>
            <div className="mt-4 flex items-center gap-4">
              <Avatar className="size-16">
                <AvatarImage src={profile.avatar_url || undefined} alt={profile.name} />
                <AvatarFallback className="text-lg">{initialsOf(profile.name, profile.email)}</AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                <Button variant="outline" size="sm" disabled={uploadingPhoto} onClick={() => fileRef.current?.click()}><Upload className="size-4" /> {uploadingPhoto ? 'Uploading...' : 'Upload photo'}</Button>
                {profile.avatar_url && (
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setP('avatar_url', '')}>Remove</Button>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="p-fn">First name</Label><Input id="p-fn" value={profile.first_name || ''} onChange={(e) => setP('first_name', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="p-ln">Last name</Label><Input id="p-ln" value={profile.last_name || ''} onChange={(e) => setP('last_name', e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="p-ph">Phone</Label><Input id="p-ph" value={profile.phone || ''} onChange={(e) => setP('phone', e.target.value)} placeholder="Optional" /></div>
              <div className="space-y-1.5"><Label htmlFor="p-em">Email</Label><Input id="p-em" value={profile.email} disabled /></div>
            </div>
          </section>
        </TabsContent>

        {/* ---------------- Booking engine ---------------- */}
        <TabsContent value="engine" className="mt-4 space-y-6">
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <p className={EYEBROW}>Booking engine</p>
            <p className="mt-1 text-sm text-muted-foreground"><strong className="text-foreground">Practice Better</strong> is the legacy path. <strong className="text-foreground">Portal (local)</strong> activates portal-owned scheduling: local availability, round-robin directors, Google Meet links.</p>
            <div className="mt-3">
              <ToggleGroup type="single" value={s.booking_engine} onValueChange={(v) => v && set('booking_engine', v)} variant="outline" className="justify-start">
                <ToggleGroupItem value="pb" className={TG_ON}>Practice Better (legacy)</ToggleGroupItem>
                <ToggleGroupItem value="local" className={TG_ON}>Portal (local)</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {isLocal && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>Local engine is on. Make sure at least one active director with weekly rules and a Google calendar exists, or patients will see no availability.</span>
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <p className={EYEBROW}>Practice Better routing</p>
            <p className="mt-1 text-sm text-muted-foreground">Which Practice Better consultant a booked session is recorded under.</p>
            <div className="mt-3">
              <ToggleGroup type="single" value={s.pb_booking_mode || 'one_director'} onValueChange={(v) => v && set('pb_booking_mode', v)} variant="outline" className="justify-start">
                <ToggleGroupItem value="one_director" className={TG_ON}>One Director</ToggleGroupItem>
                <ToggleGroupItem value="per_director" className={TG_ON}>Per Director</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {(s.pb_booking_mode || 'one_director') === 'per_director' ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>Each booking is recorded under the <strong>assigned director&apos;s own</strong> consultant ID — set it per director on the <strong>Directors</strong> tab. A director with no PB ID is skipped (the booking still succeeds).</span>
              </div>
            ) : (
              <div className="mt-4 space-y-1.5">
                <Label htmlFor="pb-cid">Shared consultant ID (asConsultantId)</Label>
                <Input id="pb-cid" value={s.shared_pb_consultant_id || ''} onChange={(e) => set('shared_pb_consultant_id', e.target.value)} placeholder="Optional" />
                <p className="text-xs text-muted-foreground">The single PB consultant every session is recorded under. Leave blank to skip the PB clinical mirror.</p>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Each session&apos;s own Service ID is set under the Events tab.</p>
          </section>
        </TabsContent>

        {/* ---------------- SMS reminders ---------------- */}
        <TabsContent value="sms" className="mt-4">
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={EYEBROW}>SMS reminders</p>
                <p className="mt-1 text-sm text-muted-foreground">Automated text reminders to book, complete forms, and join the upcoming call. Every message and time below is editable here — no code changes needed.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                <Label htmlFor="sms-enabled" className="text-sm text-muted-foreground">{sms.enabled ? 'On' : 'Off'}</Label>
                <Switch id="sms-enabled" checked={!!sms.enabled} onCheckedChange={(v) => setSms({ enabled: v })} />
              </div>
            </div>

            {/* Global rules */}
            <div className="mt-4 grid gap-3.5 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="sms-qs">Quiet hours start</Label>
                <Input id="sms-qs" type="number" min={0} max={23} value={sms.quiet_start_hour ?? 9}
                  onChange={(e) => setSms({ quiet_start_hour: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sms-qe">Quiet hours end</Label>
                <Input id="sms-qe" type="number" min={1} max={24} value={sms.quiet_end_hour ?? 20}
                  onChange={(e) => setSms({ quiet_end_hour: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sms-age">Stop booking nudges after</Label>
                <div className="flex items-center gap-2">
                  <Input id="sms-age" type="number" min={1} max={365} value={sms.booking_max_age_days ?? 14}
                    onChange={(e) => setSms({ booking_max_age_days: Number(e.target.value) })} className="w-24" />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Reminders only send between the quiet hours (patient&apos;s local time; 0–23, e.g. 9 to 20 = 9am–8pm). The pre-call reminder always sends. Booking nudges stop for signups older than the cutoff.</p>

            {/* Placeholder bar */}
            <div className="mt-3 rounded-lg border bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Placeholders</span> — click a message box, then tap to insert. <code>{'{link}'}</code> becomes a one-click 6-hour login link. Use <code>{'{time}'}</code> / <code>{'{join}'}</code> only in the pre-call reminder.</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map((t) => (
                  <Badge key={t} variant="secondary" className="cursor-pointer font-mono font-normal hover:bg-accent"
                    onClick={() => insertPlaceholder(t)}>{t}</Badge>
                ))}
              </div>
            </div>

            {/* Reminder groups */}
            <div className="mt-5 space-y-6">
              {REMINDER_GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="text-sm font-semibold text-foreground">{group.title}</p>
                  <p className="text-xs text-muted-foreground">{group.hint}</p>
                  <div className="mt-3 space-y-2.5">
                    {group.items.map(({ key, label, unit, short, preCall }) => {
                      const it = smsItems[key] || {};
                      const msg = it.message || '';
                      const { chars, segments } = segmentInfo(msg);
                      const bad = disallowedUsed(msg, !!preCall);
                      const open = !!openMap[key];
                      return (
                        <Collapsible key={key} open={open} onOpenChange={(v) => setOpenMap((m) => ({ ...m, [key]: v }))}
                          className="rounded-lg border">
                          <div className="flex items-center justify-between gap-3 p-3">
                            <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left">
                              <ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
                              <span className="text-sm font-medium">{label}</span>
                              <Badge variant={it.enabled ? 'default' : 'secondary'} className="font-normal">{it.enabled ? 'On' : 'Off'}</Badge>
                              <span className="text-xs text-muted-foreground">· {it.value ?? 0}{preCall ? 'm' : 'h'} {short}</span>
                            </CollapsibleTrigger>
                            <Switch checked={!!it.enabled} onCheckedChange={(v) => setSmsItem(key, { enabled: v })} />
                          </div>
                          <CollapsibleContent>
                            <div className="grid gap-4 border-t p-3 md:grid-cols-[1fr_280px]">
                              {/* Editor */}
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <Label htmlFor={`sms-${key}-val`} className="text-sm text-muted-foreground">Send</Label>
                                  <Input id={`sms-${key}-val`} type="number" min={1} value={it.value ?? 0}
                                    onChange={(e) => setSmsItem(key, { value: Number(e.target.value) })} className="w-24" />
                                  <span className="text-sm text-muted-foreground">{unit}</span>
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor={`sms-${key}-msg`}>Message</Label>
                                  <Textarea id={`sms-${key}-msg`} rows={4} value={msg}
                                    ref={(el) => { taRefs.current[key] = el; }}
                                    onFocus={() => { focusedKeyRef.current = key; }}
                                    onChange={(e) => setSmsItem(key, { message: e.target.value })} />
                                  <p className="text-xs text-muted-foreground">{chars} characters · roughly {segments} SMS segment(s)</p>
                                  {bad.length > 0 && (
                                    <p className="text-xs text-red-600">{bad.join(' and ')} won&apos;t resolve here — {'{time}'} and {'{join}'} only work in the pre-call reminder.</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Input placeholder="Test number" value={testNums[key] || ''}
                                    onChange={(e) => setTestNums((n) => ({ ...n, [key]: e.target.value }))} className="h-8 max-w-[180px] text-sm" />
                                  <Button variant="outline" size="sm" disabled={!!testing[key]} onClick={() => sendTest(key)}>
                                    <Send className="size-3.5" /> {testing[key] ? 'Sending...' : 'Send test'}
                                  </Button>
                                </div>
                              </div>
                              {/* Live preview */}
                              <div>
                                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Preview</p>
                                <div className="whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted p-2.5 text-sm">
                                  {msg ? renderPreview(msg, !!preCall) : <span className="text-muted-foreground">Message is empty</span>}
                                </div>
                                <p className="mt-1.5 text-[11px] text-muted-foreground">Sample values shown. Tests use the last saved message.</p>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>
      </Tabs>

      {/* Sticky global save bar (all three tabs) */}
      <div className="sticky bottom-4 mt-6 flex justify-end">
        <div className="flex items-center gap-3.5 rounded-xl border bg-card px-4 py-2.5 shadow-lg">
          <span className={`text-sm ${dirty ? 'text-foreground' : 'text-muted-foreground'}`}>{statusLabel}</span>
          <Button onClick={saveAll} disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save changes'}</Button>
        </div>
      </div>
    </div>
  );
}
