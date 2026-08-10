import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Search, RefreshCw, Video, MoreHorizontalIcon, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { adminApi } from '../api';
import { fmtDateTime } from '../format';
import CadSelect from '../CadSelect';
import { RescheduleModal, cancelBooking } from '../bookingActions';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ManualBookingDrawer from './ManualBookingDrawer';

const PAGE_SIZE = 50;
const HEADER_GRADIENT = 'linear-gradient(to top, #F8F8F8, #F8F8F899, #00000000)';
const HEAD = 'h-14 px-6 text-center align-middle text-[13px] font-semibold text-foreground';
const CELL = 'px-6 py-2 text-sm text-center';
// Selected segment must read as chosen on white — same override as Coordinators.
const TG_ON = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground';

// Upcoming + earliest-first: a booking you just made is at the top of page 1,
// not buried behind every further-future booking (the old latest-first default).
const DEFAULT_VIEW = { time: 'upcoming', sort: 'soonest', status: '', pb_status: '', director_id: '' };

const SORT_OPTIONS = [
  { value: 'soonest', label: 'Earliest first' },
  { value: 'latest', label: 'Latest first' },
  { value: 'booked', label: 'Recently booked' },
];

const fmtWhen = (iso) => fmtDateTime(iso);

// Bold, color-coded status text (washed green/amber/red) — no badge cards.
const statusColor = (s) => {
  const v = String(s || '').toLowerCase();
  if (['confirmed', 'synced', 'complete', 'completed', 'success', 'active', 'sent'].includes(v)) return 'text-emerald-700';
  if (['pending', 'skipped', 'cancel_pending', 'processing', 'queued'].includes(v)) return 'text-amber-700';
  if (['cancelled', 'canceled', 'failed', 'error'].includes(v)) return 'text-red-700';
  return 'text-muted-foreground';
};
const titleize = (s) => String(s || '—').replace(/_/g, ' ');

export default function Bookings() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [view, setView] = useState(null); // null until saved prefs arrive
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rescheduleFor, setRescheduleFor] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const saveTimer = useRef(null);

  // Saved per-admin view + host filter options, once on mount.
  useEffect(() => {
    adminApi.get('/admin/prefs')
      .then((r) => setView({ ...DEFAULT_VIEW, ...(r.data?.bookings_view || {}) }))
      .catch(() => setView(DEFAULT_VIEW));
    Promise.all([
      adminApi.get('/admin/directors').then((r) => (r.data.directors || []).filter((d) => d.active !== false)).catch(() => []),
      adminApi.get('/admin/pccs').then((r) => (r.data.pccs || []).filter((p) => p.active !== false)).catch(() => []),
    ]).then(([dirs, pccs]) => setHosts([
      ...dirs.map((d) => ({ value: d.director_id, label: d.name })),
      ...pccs.map((p) => ({ value: p.pcc_id, label: `${p.name} (PCC)` })),
    ]));
    return () => clearTimeout(saveTimer.current);
  }, []);

  const setViewAndSave = (patch) => {
    setPage(1);
    setView((v) => {
      const next = { ...v, ...patch };
      clearTimeout(saveTimer.current);
      // Fire-and-forget: a failed pref save never blocks the actual filtering.
      saveTimer.current = setTimeout(() => adminApi.put('/admin/prefs', { bookings_view: next }).catch(() => {}), 600);
      return next;
    });
  };

  const load = useCallback(async () => {
    if (!view) return;
    setLoading(true);
    try {
      const params = { page, page_size: PAGE_SIZE, sort: view.sort };
      if (search.trim()) params.search = search.trim();
      if (view.status) params.status = view.status;
      if (view.pb_status) params.pb_status = view.pb_status;
      if (view.director_id) params.director_id = view.director_id;
      if (view.time === 'upcoming') params.date_from = new Date().toISOString();
      if (view.time === 'past') params.date_to = new Date().toISOString();
      const res = await adminApi.get('/admin/bookings', params);
      setRows(res.data.bookings || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.total_pages || 1);
    } catch (e) {
      toast.error(e?.response?.status === 403 ? 'Admin access required' : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [page, search, view]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const filtered = view && (search.trim() || Object.keys(DEFAULT_VIEW).some((k) => view[k] !== DEFAULT_VIEW[k]));
  const resetView = () => { setSearch(''); setViewAndSave({ ...DEFAULT_VIEW }); };

  if (!view) return <div className="py-12 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-3">
      {/* Toolbar — two deliberate rows: actions stay pinned on top, filters get their
          own line so nothing important wraps away on smaller laptops. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              placeholder="Search name or email..." className="pl-8" />
          </div>
          <span className="ml-auto text-sm text-muted-foreground">{total} booking{total === 1 ? '' : 's'}</span>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="size-4" /> New booking
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" value={view.time} onValueChange={(v) => v && setViewAndSave({ time: v })} variant="outline" size="sm">
            <ToggleGroupItem value="upcoming" className={TG_ON}>Upcoming</ToggleGroupItem>
            <ToggleGroupItem value="past" className={TG_ON}>Past</ToggleGroupItem>
            <ToggleGroupItem value="all" className={TG_ON}>All</ToggleGroupItem>
          </ToggleGroup>
          <CadSelect value={view.sort} onChange={(v) => setViewAndSave({ sort: v })} style={{ width: 160 }} ariaLabel="Sort order"
            options={SORT_OPTIONS} />
          <CadSelect value={view.director_id} onChange={(v) => setViewAndSave({ director_id: v })} style={{ width: 170 }} ariaLabel="Filter by host"
            options={[{ value: '', label: 'All hosts' }, ...hosts]} />
          <CadSelect value={view.status} onChange={(v) => setViewAndSave({ status: v })} style={{ width: 150 }} ariaLabel="Filter by status"
            options={[{ value: '', label: 'All statuses' }, { value: 'confirmed', label: 'Confirmed' }, { value: 'cancelled', label: 'Cancelled' }]} />
          <CadSelect value={view.pb_status} onChange={(v) => setViewAndSave({ pb_status: v })} style={{ width: 172 }} ariaLabel="Filter by PB sync"
            options={[{ value: '', label: 'Any PB sync' }, { value: 'synced', label: 'PB synced' }, { value: 'pending', label: 'PB pending' }, { value: 'cancel_pending', label: 'PB cancel pending' }]} />
          {filtered && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={resetView}>
              <X className="size-3.5" /> Reset
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b hover:bg-transparent" style={{ backgroundImage: HEADER_GRADIENT }}>
              <TableHead className={HEAD}>When</TableHead>
              <TableHead className={HEAD}>Patient</TableHead>
              <TableHead className={HEAD}>Director</TableHead>
              <TableHead className={HEAD}>Status</TableHead>
              <TableHead className={HEAD}>Practice Better</TableHead>
              <TableHead className={HEAD}>Meet</TableHead>
              <TableHead className={HEAD}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                {filtered ? 'No bookings match these filters.' : 'No bookings found.'}
              </TableCell></TableRow>
            ) : rows.map((b) => {
              const name = [b.patient?.first_name, b.patient?.last_name].filter(Boolean).join(' ') || '—';
              return (
                <TableRow key={b.booking_id}>
                  <TableCell className="px-6 py-2 text-xs whitespace-nowrap text-center text-muted-foreground">{fmtWhen(b.slot_start_utc)}</TableCell>
                  <TableCell className={CELL}>
                    <div className="font-medium text-foreground">{name}</div>
                    <div className="text-xs text-muted-foreground">{b.patient?.email}</div>
                  </TableCell>
                  <TableCell className={`${CELL} text-foreground`}>{b.director_name || b.director_id || '—'}</TableCell>
                  <TableCell className={`${CELL} text-center`}>
                    <span className={`font-semibold capitalize ${statusColor(b.status)}`}>{b.status || '—'}</span>
                  </TableCell>
                  <TableCell className={`${CELL} text-center`}>
                    <span className={`font-semibold capitalize ${statusColor(b.pb_status)}`}>{titleize(b.pb_status)}</span>
                  </TableCell>
                  <TableCell className={`${CELL} text-center`}>
                    {b.meet_link ? (
                      <a href={b.meet_link} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
                        <Video className="size-3.5" /> Join
                      </a>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={`${CELL} text-center`}>
                    {b.status === 'confirmed' ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontalIcon />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setRescheduleFor(b)}>Reschedule</DropdownMenuItem>
                          {b.meet_link && (
                            <DropdownMenuItem onClick={() => { try { navigator.clipboard?.writeText(b.meet_link); toast.success('Meet link copied'); } catch { /* noop */ } }}>Copy meet link</DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive focus:text-destructive"
                            onClick={() => cancelBooking(b, { onDone: load })}>Cancel</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="size-4" /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {rescheduleFor && (
        <RescheduleModal booking={rescheduleFor} onClose={() => setRescheduleFor(null)} onDone={load} />
      )}
      <ManualBookingDrawer open={newOpen} onOpenChange={setNewOpen} onCreated={load} />
    </div>
  );
}
