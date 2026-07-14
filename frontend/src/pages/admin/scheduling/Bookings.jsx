import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Search, RefreshCw, Video, MoreHorizontalIcon, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { adminApi } from '../api';
import { fmtDateTime } from '../format';
import CadSelect from '../CadSelect';
import { RescheduleModal, cancelBooking } from '../bookingActions';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ManualBookingDrawer from './ManualBookingDrawer';

const PAGE_SIZE = 50;
const HEADER_GRADIENT = 'linear-gradient(to top, #F8F8F8, #F8F8F899, #00000000)';
const HEAD = 'h-14 px-6 text-center align-middle text-[13px] font-semibold text-foreground';
const CELL = 'px-6 py-2 text-sm text-center';

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
  const [status, setStatus] = useState('');
  const [pbStatus, setPbStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [rescheduleFor, setRescheduleFor] = useState(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (search.trim()) params.search = search.trim();
      if (status) params.status = status;
      if (pbStatus) params.pb_status = pbStatus;
      const res = await adminApi.get('/admin/bookings', params);
      setRows(res.data.bookings || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.total_pages || 1);
    } catch (e) {
      toast.error(e?.response?.status === 403 ? 'Admin access required' : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [page, search, status, pbStatus]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder="Search name or email..." className="pl-8" />
        </div>
        <CadSelect value={status} onChange={(v) => { setPage(1); setStatus(v); }} style={{ width: 168 }} ariaLabel="Filter by status"
          options={[{ value: '', label: 'All statuses' }, { value: 'confirmed', label: 'Confirmed' }, { value: 'cancelled', label: 'Cancelled' }]} />
        <CadSelect value={pbStatus} onChange={(v) => { setPage(1); setPbStatus(v); }} style={{ width: 190 }} ariaLabel="Filter by PB sync"
          options={[{ value: '', label: 'Any PB sync' }, { value: 'synced', label: 'PB synced' }, { value: 'pending', label: 'PB pending' }, { value: 'cancel_pending', label: 'PB cancel pending' }]} />
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
        <Button size="sm" className="ml-auto" onClick={() => setNewOpen(true)}>
          <Plus className="size-4" /> New booking
        </Button>
        <span className="text-sm text-muted-foreground">{total} booking{total === 1 ? '' : 's'}</span>
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
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No bookings found.</TableCell></TableRow>
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
