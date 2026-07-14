import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Wand2, ChevronLeft, ChevronRight, MoreHorizontalIcon, ChevronDownIcon } from 'lucide-react';
import { adminApi } from '../api';
import { confirmDialog } from '../confirm';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

const HEADER_GRADIENT = 'linear-gradient(to top, #F8F8F8, #F8F8F899, #00000000)';
const HEAD = 'h-14 px-6 text-center align-middle text-[13px] font-semibold text-foreground';
const CELL = 'px-6 py-2 text-sm text-center';
const EYEBROW = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const NONE = '__none__'; // sentinel: Radix Select forbids an empty-string value
// Default toggle "on" (bg-accent, 96% grey) is invisible on white — use the dark primary so the
// selected segment clearly reads as chosen, matching the admin's dark action buttons.
const TG_ON = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground';

const todayLocal = () => new Date().toISOString().slice(0, 10);
const RANGE_LABEL = { day: '1 day', week: '7 days', month: '30 days' };
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const colHeader = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtDateLabel = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function DatePicker({ value, onChange, className }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('justify-between font-normal', !value && 'text-muted-foreground', className)}>
          {value ? fmtDateLabel(value) : 'Pick a date'}
          <ChevronDownIcon className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar mode="single" selected={value ? new Date(value + 'T12:00:00') : undefined} defaultMonth={value ? new Date(value + 'T12:00:00') : undefined} onSelect={(d) => d && onChange(toYMD(d))} />
      </PopoverContent>
    </Popover>
  );
}

export default function Coordinators() {
  const [pccs, setPccs] = useState([]);

  // Add / edit drawer
  const [form, setForm] = useState(null); // { pcc_id, name, email }
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Bulk assign
  const [bulkStart, setBulkStart] = useState(todayLocal());
  const [bulkRange, setBulkRange] = useState('week');
  const [bulkMode, setBulkMode] = useState('round_robin');
  const [bulkPccId, setBulkPccId] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  // Rota views
  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(todayLocal());
  const [customStart, setCustomStart] = useState(todayLocal());
  const [customEnd, setCustomEnd] = useState(addDays(todayLocal(), 6));
  const [data, setData] = useState({ dates: [], directors: [], assignments: [] });
  const [loadingRota, setLoadingRota] = useState(true);

  const range = useMemo(() => {
    if (view === 'day') return { start: anchor, end: anchor };
    if (view === 'week') return { start: anchor, end: addDays(anchor, 6) };
    return { start: customStart, end: customEnd };
  }, [view, anchor, customStart, customEnd]);

  const loadPccs = useCallback(async () => {
    try { setPccs((await adminApi.get('/admin/pccs')).data.pccs || []); }
    catch { toast.error('Failed to load coordinators'); }
  }, []);

  const loadRota = useCallback(async (start, end) => {
    setLoadingRota(true);
    try {
      const res = await adminApi.get('/admin/pcc-assignments', { start, end });
      setData({ dates: res.data.dates || [], directors: res.data.directors || [], assignments: res.data.assignments || [] });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load rota');
    } finally {
      setLoadingRota(false);
    }
  }, []);

  useEffect(() => { loadPccs(); }, [loadPccs]);
  useEffect(() => {
    if (range.start && range.end && range.start <= range.end) loadRota(range.start, range.end);
  }, [range, loadRota]);

  const cellMap = useMemo(() => {
    const m = {};
    for (const a of data.assignments) m[`${a.date}|${a.director_id}`] = a;
    return m;
  }, [data.assignments]);
  const cellPcc = (dateStr, dirId) => (cellMap[`${dateStr}|${dirId}`] || {}).pcc_id || '';
  const cellWorks = (dateStr, dirId) => (cellMap[`${dateStr}|${dirId}`] || {}).works === true;

  const openNew = () => { setForm({ pcc_id: null, name: '', email: '' }); setOpen(true); };
  const openEdit = (p) => { setForm({ pcc_id: p.pcc_id, name: p.name || '', email: p.email || '' }); setOpen(true); };

  const saveForm = async () => {
    if (!form.name.trim() || !form.email.trim()) { toast.error('Name and email required'); return; }
    setSaving(true);
    try {
      if (form.pcc_id) await adminApi.put(`/admin/pccs/${form.pcc_id}`, { name: form.name.trim(), email: form.email.trim() });
      else await adminApi.post('/admin/pccs', { name: form.name.trim(), email: form.email.trim() });
      toast.success(form.pcc_id ? 'Coordinator updated' : 'Coordinator added');
      setOpen(false); loadPccs();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const togglePcc = async (p) => {
    try {
      if (p.active !== false) await adminApi.del(`/admin/pccs/${p.pcc_id}`);
      else await adminApi.put(`/admin/pccs/${p.pcc_id}`, { active: true });
      loadPccs();
    } catch { toast.error('Update failed'); }
  };

  const assign = async (dateStr, dirId, pccId) => {
    try {
      const res = await adminApi.put('/admin/pcc-assignments', { date: dateStr, director_id: dirId, pcc_id: pccId || null });
      const n = res.data?.bookings_updated ?? 0;
      toast.success(`${pccId ? 'Assigned' : 'Cleared'} · ${n} booking${n === 1 ? '' : 's'} updated`);
      loadRota(range.start, range.end);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not save');
      loadRota(range.start, range.end);
    }
  };

  const bulkAssign = async () => {
    if (bulkMode === 'single' && !bulkPccId) return toast.error('Choose a coordinator first');
    const ok = await confirmDialog({
      title: 'Bulk-assign coordinators?',
      message: `This sets coordinators for ${RANGE_LABEL[bulkRange]} from ${bulkStart} (${bulkMode === 'round_robin' ? 'round-robin across all active coordinators' : 'one coordinator for every director'}), replacing any existing assignments in that range.`,
      confirmLabel: 'Assign',
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const res = await adminApi.post('/admin/pcc-assignments/bulk', {
        start_date: bulkStart, range: bulkRange, mode: bulkMode, pcc_id: bulkMode === 'single' ? bulkPccId : null,
      });
      const d = res.data || {};
      toast.success(`Assigned ${d.assignments_set} director-days through ${d.end_date} · calendar invites updating in the background`);
      if (bulkRange === 'month') { setView('custom'); setCustomStart(bulkStart); setCustomEnd(addDays(bulkStart, 29)); }
      else { setView(bulkRange); setAnchor(bulkStart); }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Bulk assign failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const activePccs = pccs.filter((p) => p.active !== false);
  const shift = (n) => setAnchor((a) => addDays(a, n));
  const rangeLabel = view === 'day' ? colHeader(range.start) : `${colHeader(range.start)} - ${colHeader(range.end)}`;
  // Only show dates where at least one director actually works (no all-off Sat/Sun columns).
  const visibleDates = data.dates.filter((d) => data.directors.some((dir) => cellWorks(d, dir.director_id)));

  // Per-cell coordinator picker (rota). Name only keeps the grid columns narrow.
  const cellSelect = (dateStr, dirId, dirName) => (
    <Select value={cellPcc(dateStr, dirId) || NONE} onValueChange={(v) => assign(dateStr, dirId, v === NONE ? '' : v)} disabled={activePccs.length === 0}>
      <SelectTrigger className="h-8 w-full min-w-[150px]" aria-label={`Coordinator for ${dirName}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}><span className="text-muted-foreground">Unassigned</span></SelectItem>
        {activePccs.map((p) => <SelectItem key={p.pcc_id} value={p.pcc_id}>{p.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Patient Care Coordinators are added as guests to a director&apos;s calls for the day, so the director can hand the patient over and leave the call early (the meeting keeps running). Set Host Management off on consult meetings so the call can&apos;t be ended accidentally.
      </p>

      {/* Bulk assign */}
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Wand2 className="size-4 text-muted-foreground" />
          <span className={EYEBROW}>Bulk assign</span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">Fill the rota automatically from a start date for a whole day, week, or month - instead of setting each director by hand.</p>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex flex-col items-start gap-1.5">
            <Label>Start date</Label>
            <DatePicker value={bulkStart} onChange={(v) => setBulkStart(v || todayLocal())} className="w-[150px]" />
          </div>
          <div className="space-y-1.5">
            <Label>Timeline</Label>
            <ToggleGroup type="single" value={bulkRange} onValueChange={(v) => v && setBulkRange(v)} variant="outline" className="justify-start">
              <ToggleGroupItem value="day" className={TG_ON}>Day</ToggleGroupItem>
              <ToggleGroupItem value="week" className={TG_ON}>Week</ToggleGroupItem>
              <ToggleGroupItem value="month" className={TG_ON}>Month</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-1.5">
            <Label>Coordinators</Label>
            <ToggleGroup type="single" value={bulkMode} onValueChange={(v) => v && setBulkMode(v)} variant="outline" className="justify-start">
              <ToggleGroupItem value="round_robin" className={TG_ON}>Round-robin all</ToggleGroupItem>
              <ToggleGroupItem value="single" className={TG_ON}>One coordinator</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {bulkMode === 'single' && (
            <div className="space-y-1.5" style={{ minWidth: 240 }}>
              <Label>Which coordinator</Label>
              <Select value={bulkPccId || undefined} onValueChange={setBulkPccId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose..." /></SelectTrigger>
                <SelectContent>
                  {activePccs.map((p) => <SelectItem key={p.pcc_id} value={p.pcc_id}>{p.name} · {p.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={bulkAssign} disabled={bulkBusy || activePccs.length === 0}>
            {bulkBusy ? 'Assigning...' : 'Assign'}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{RANGE_LABEL[bulkRange]} from {bulkStart}. Replaces existing assignments in the range; calendar invites for existing bookings update in the background.</p>
      </section>

      {/* Rota */}
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={EYEBROW}>Rota</p>
            <p className="mt-1 text-sm text-muted-foreground">Who covers each director&apos;s calls · <span className="font-medium text-foreground">{rangeLabel}</span></p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v)} variant="outline" size="sm" className="justify-start">
              <ToggleGroupItem value="day" className={TG_ON}>Day</ToggleGroupItem>
              <ToggleGroupItem value="week" className={TG_ON}>Week</ToggleGroupItem>
              <ToggleGroupItem value="custom" className={TG_ON}>Custom</ToggleGroupItem>
            </ToggleGroup>
            {view !== 'custom' ? (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="size-9" onClick={() => shift(view === 'week' ? -7 : -1)} aria-label="Previous"><ChevronLeft className="size-4" /></Button>
                <DatePicker value={anchor} onChange={(v) => setAnchor(v || todayLocal())} className="w-[170px]" />
                <Button variant="outline" size="icon" className="size-9" onClick={() => shift(view === 'week' ? 7 : 1)} aria-label="Next"><ChevronRight className="size-4" /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <DatePicker value={customStart} onChange={(v) => setCustomStart(v || todayLocal())} className="w-[160px]" />
                <span className="text-sm text-muted-foreground">to</span>
                <DatePicker value={customEnd} onChange={(v) => setCustomEnd(v || todayLocal())} className="w-[160px]" />
              </div>
            )}
          </div>
        </div>

        {activePccs.length === 0 && <p className="mb-3 text-xs text-muted-foreground">Add a coordinator below before assigning the rota.</p>}

        {loadingRota ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : data.directors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active directors. Add a director first.</p>
        ) : view === 'day' ? (
          <div className="divide-y rounded-lg border">
            {data.directors.map((dir) => (
              <div key={dir.director_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-[160px]">
                  <div className="font-medium text-foreground">{dir.name}</div>
                  {dir.timezone && <div className="text-xs text-muted-foreground">{dir.timezone}</div>}
                </div>
                <div className="min-w-[220px] flex-1">
                  {cellWorks(range.start, dir.director_id)
                    ? cellSelect(range.start, dir.director_id, dir.name)
                    : <span className="text-sm text-muted-foreground">Off · not scheduled this day</span>}
                </div>
              </div>
            ))}
          </div>
        ) : visibleDates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No director works in this range.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full caption-bottom border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b bg-card px-3 py-2.5 text-left text-xs font-semibold text-foreground" style={{ minWidth: 160 }}>Director</th>
                  {visibleDates.map((d) => (
                    <th key={d} className="whitespace-nowrap border-b px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground" style={{ minWidth: 150 }}>{colHeader(d)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.directors.map((dir) => (
                  <tr key={dir.director_id} className="border-b last:border-0">
                    <td className="sticky left-0 z-10 border-b bg-card px-3 py-1.5 font-medium text-foreground" style={{ minWidth: 160 }}>{dir.name}</td>
                    {visibleDates.map((d) => (
                      <td key={d} className="border-b px-1.5 py-1.5 align-middle">
                        {cellWorks(d, dir.director_id)
                          ? cellSelect(d, dir.director_id, dir.name)
                          : <span className="px-2 text-xs text-muted-foreground">Off</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Coordinator list */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className={EYEBROW}>Coordinators</p>
          <Button size="sm" onClick={openNew}><Plus className="size-4" /> Add coordinator</Button>
        </div>
        <div className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b hover:bg-transparent" style={{ backgroundImage: HEADER_GRADIENT }}>
                <TableHead className={HEAD}>Name</TableHead>
                <TableHead className={HEAD}>Email</TableHead>
                <TableHead className={HEAD}>Status</TableHead>
                <TableHead className={HEAD}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pccs.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No coordinators yet.</TableCell></TableRow>
              ) : pccs.map((p) => {
                const active = p.active !== false;
                return (
                  <TableRow key={p.pcc_id} className="cursor-pointer" onClick={() => openEdit(p)}>
                    <TableCell className={`${CELL} font-medium text-foreground`}>{p.name}</TableCell>
                    <TableCell className={`${CELL} text-muted-foreground`}>{p.email}</TableCell>
                    <TableCell className={`${CELL} text-center`}>
                      <span className={`font-semibold ${active ? 'text-emerald-700' : 'text-red-700'}`}>{active ? 'Active' : 'Inactive'}</span>
                    </TableCell>
                    <TableCell className={`${CELL} text-center`} onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontalIcon />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(p)}>Edit</DropdownMenuItem>
                          {active
                            ? <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => togglePcc(p)}>Deactivate</DropdownMenuItem>
                            : <DropdownMenuItem onClick={() => togglePcc(p)}>Activate</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Add / edit drawer */}
      <Drawer open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        <DrawerContent>
          <div className="mx-auto flex w-full max-w-lg flex-col">
            <DrawerHeader className="text-left">
              <DrawerTitle>{form?.pcc_id ? 'Edit coordinator' : 'Add coordinator'}</DrawerTitle>
              <DrawerDescription>Patient Care Coordinators can be assigned to cover a director&apos;s calls on the rota.</DrawerDescription>
            </DrawerHeader>
            {form && (
              <div className="space-y-4 px-4 pb-2">
                <div className="space-y-1.5">
                  <Label htmlFor="c-name">Name</Label>
                  <Input id="c-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Coordinator" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-email">Email</Label>
                  <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@clinic.com" />
                </div>
              </div>
            )}
            <DrawerFooter className="flex-row justify-end gap-2">
              <DrawerClose asChild><Button variant="outline">Cancel</Button></DrawerClose>
              <Button onClick={saveForm} disabled={saving}>{saving ? 'Saving...' : 'Save coordinator'}</Button>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
