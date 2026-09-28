import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Ban, CalendarClock, Copy, FileText, Filter, MailCheck, MoreHorizontal, RefreshCw, RotateCcw, UserX, Video, X,
} from 'lucide-react';
import { adminApi } from '../api';
import { fmtDate, fmtDateTime, fmtTime } from '../format';
import { RescheduleModal, cancelBooking, markNoShow, resendBookingEmail } from '../bookingActions';
import { AdminSelect, NoResults, Person, SearchBox, Status, TablePager, initials, keepSheetOpen, useLastRecord } from '../workspace-ui';
import s from '../workspace.module.css';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// Scheduling → Bookings: the authoritative bookings ledger. Design: shumard-checkout-portal/app/admin/scheduling/page.tsx
// (booking ledger, booking details sheet — the overview strip is left out, per the user). Server-paged; each admin's view is saved (/admin/prefs).

const PAGE_SIZE = 50;
const ALL = '__all__';   // Radix Select can't use '' as an item value
// Upcoming + earliest-first: a booking you just made is at the top of page 1,
// not buried behind every further-future booking (the old latest-first default).
const DEFAULT_VIEW = { time: 'upcoming', sort: 'soonest', status: '', pb_status: '', director_id: '' };
const SORT_OPTIONS = [
  { value: 'soonest', label: 'Earliest first' },
  { value: 'latest', label: 'Latest first' },
  { value: 'booked', label: 'Recently booked' },
];
const STATUS_OPTIONS = [{ value: ALL, label: 'All statuses' }, { value: 'confirmed', label: 'Confirmed' }, { value: 'no_show', label: 'No-show' }, { value: 'cancelled', label: 'Cancelled' }];
const PB_OPTIONS = [{ value: ALL, label: 'Any PB sync' }, { value: 'synced', label: 'PB synced' }, { value: 'pending', label: 'PB pending' }, { value: 'cancel_pending', label: 'PB cancel pending' }];

const titleize = (v) => (v ? String(v).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '—');
const STATUS_TONE = { confirmed: 'green', no_show: 'amber', cancelled: 'red', canceled: 'red' };
const PB_TONE = { synced: 'green', pending: 'blue', skipped: 'amber', cancel_pending: 'amber', cancelled: 'red' };
const patientName = (b) => [b.patient?.first_name, b.patient?.last_name].filter(Boolean).join(' ');
const hostName = (b) => b.director_name || b.director_id || '—';
const isPast = (b) => new Date(b.slot_start_utc) <= new Date();
const copyMeet = (b) => { try { navigator.clipboard?.writeText(b.meet_link); toast.success('Meet link copied'); } catch { /* noop */ } };

function BookingStatus({ b }) {
  return <Status value={titleize(b.status)} tone={STATUS_TONE[b.status] || 'blue'} />;
}
function PbStatus({ b }) {
  return b.pb_status ? <Status value={titleize(b.pb_status)} tone={PB_TONE[b.pb_status] || 'blue'} /> : <span className={s.monoTime}>—</span>;
}
function DateStack({ iso }) {
  return <span className={s.dateStack}><span>{fmtDate(iso)}</span><small>{fmtTime(iso)}</small></span>;
}
function Host({ b }) {
  const name = hostName(b);
  return <span className={s.hostCell}><span className={s.hostInitial}>{initials(name)}</span>{name}</span>;
}
function Patient({ b, onView }) {
  const name = patientName(b);
  if (!name && !b.patient?.email) return <span className={s.monoTime}>No patient</span>;
  return <Person name={name || b.patient.email} email={name ? b.patient?.email : undefined} onClick={(e) => { e?.stopPropagation?.(); onView(b); }} />;
}

// The actions a booking allows right now (shared by the row menu and the details sheet).
function actionsFor(b, { onReschedule, done }) {
  if (b.status === 'confirmed') {
    return [
      { key: 'reschedule', icon: CalendarClock, label: 'Reschedule', run: () => onReschedule(b) },
      b.meet_link && { key: 'copy', icon: Copy, label: 'Copy meet link', run: () => copyMeet(b) },
      !isPast(b) && { key: 'resend', icon: MailCheck, label: 'Resend confirmation email', run: () => resendBookingEmail(b, { onDone: done }) },
      isPast(b) && { key: 'noshow', icon: UserX, label: 'Mark as no-show', run: () => markNoShow(b, { onDone: done }) },
      { key: 'cancel', icon: Ban, label: 'Cancel booking', danger: true, run: () => cancelBooking(b, { onDone: done }) },
    ].filter(Boolean);
  }
  if (b.status === 'no_show') return [{ key: 'undo', icon: RotateCcw, label: 'Undo no-show', run: () => markNoShow(b, { undo: true, onDone: done }) }];
  return [];
}

// modal={false}: "Booking details" opens a sheet, and a modal menu handing off to a dialog leaves the page unclickable.
function RowMenu({ b, onView, onReschedule, done }) {
  const actions = actionsFor(b, { onReschedule, done });
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={s.iconButton} aria-label={`Actions for ${patientName(b) || 'booking'}`} onClick={(e) => e.stopPropagation()}><MoreHorizontal size={19} /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={s.menu}>
        <DropdownMenuItem onSelect={() => onView(b)}><FileText size={16} />Booking details</DropdownMenuItem>
        {actions.length > 0 && <DropdownMenuSeparator />}
        {actions.map((a) => (
          <DropdownMenuItem key={a.key} onSelect={a.run} className={a.danger ? 'text-destructive focus:text-destructive' : undefined}><a.icon size={16} />{a.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BookingSheet({ booking, onClose, onReschedule, done }) {
  const b = useLastRecord(booking);
  // Any change closes the sheet (it would otherwise show the booking as it was before).
  const actions = b ? actionsFor(b, { onReschedule: (bk) => { onClose(); onReschedule(bk); }, done: () => { onClose(); done(); } }) : [];
  const tz = b?.patient_timezone;
  return (
    <Sheet open={!!booking} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className={s.detailSheet} onInteractOutside={keepSheetOpen} onEscapeKeyDown={keepSheetOpen}>
        <SheetHeader>
          <SheetTitle>Booking details</SheetTitle>
          <SheetDescription className={s.sheetDescription}>Appointment and patient information.</SheetDescription>
        </SheetHeader>
        {b && (
          <>
            {patientName(b) || b.patient?.email ? <Person name={patientName(b) || b.patient.email} email={patientName(b) ? b.patient?.email : undefined} /> : <p className={s.detailNote}>No patient on this booking.</p>}
            <dl className={s.detailList}>
              <div><dt>Session</dt><dd>{b.session_title || '—'}{b.duration_minutes ? ` · ${b.duration_minutes} min` : ''}</dd></div>
              <div><dt>Date &amp; time</dt><dd>{fmtDate(b.slot_start_utc)} at {fmtTime(b.slot_start_utc)}{tz && <small className={s.ddSub}>Patient’s time: {fmtDateTime(b.slot_start_utc, { tz })} ({tz})</small>}</dd></div>
              <div><dt>Host</dt><dd>{hostName(b)}</dd></div>
              <div><dt>Booking status</dt><dd><BookingStatus b={b} /></dd></div>
              <div><dt>Practice Better</dt><dd><PbStatus b={b} /></dd></div>
              {b.meet_link && <div><dt>Google Meet</dt><dd><a href={b.meet_link} target="_blank" rel="noreferrer" className={s.textLink}><Video size={13} />Join meeting</a></dd></div>}
              {b.patient?.phone && <div><dt>Phone</dt><dd>{b.patient.phone}</dd></div>}
              {b.source && <div><dt>Booked via</dt><dd>{titleize(b.source)}{b.created_at && <small className={s.ddSub}>{fmtDateTime(b.created_at)}</small>}</dd></div>}
              {b.notes && <div><dt>Internal notes</dt><dd>{b.notes}</dd></div>}
            </dl>
            {actions.length > 0 && (
              <div className={s.sheetActions}>
                {actions.map((a) => (
                  <button key={a.key} type="button" className={s.secondaryButton} data-danger={a.danger ? '' : undefined} onClick={a.run}><a.icon size={15} />{a.label}</button>
                ))}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function Bookings() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [view, setView] = useState(null); // null until saved prefs arrive
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [rescheduleFor, setRescheduleFor] = useState(null);
  const [selected, setSelected] = useState(null);
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
    } catch (e) {
      toast.error(e?.response?.status === 403 ? 'Admin access required' : 'Failed to load bookings');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [page, search, view]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const refresh = () => { load(); };
  const filtered = view && (search.trim() || Object.keys(DEFAULT_VIEW).some((k) => view[k] !== DEFAULT_VIEW[k]));
  const resetView = () => { setSearch(''); setViewAndSave({ ...DEFAULT_VIEW }); };
  const pick = (key) => (v) => setViewAndSave({ [key]: v === ALL ? '' : v });

  if (!view) return <p className={s.loadingRow} role="status">Loading bookings…</p>;

  return (
    <>
      <Tabs value={view.time} onValueChange={(v) => setViewAndSave({ time: v })} className={`${s.surface} ${s.analyticsSurface}`}>
        <div className={s.analyticsToolbar}>
          <div>
            <span className={s.analyticsKicker}>BOOKING LEDGER</span>
            <h2>Sessions<span className={s.peopleCount}>{total.toLocaleString()} {total === 1 ? 'booking' : 'bookings'}</span></h2>
          </div>
          <div className={s.ledgerTools}>
            <button type="button" className={s.iconButton} aria-label="Refresh bookings" onClick={refresh}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
            <TabsList className={s.lyraTabs} aria-label="Booking timeframe">
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
              <TabsTrigger value="all">All bookings</TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className={`${s.analyticsFilters} ${s.scheduleFilters}`}>
          <div className={s.scheduleSearch}>
            <SearchBox value={search} onChange={(v) => { setPage(1); setSearch(v); }} label="Search patient name or email" placeholder="Patient name or email" />
          </div>
          <span className={s.filterLabel}><Filter size={14} />Filters</span>
          <div className={s.filterSelect}><AdminSelect label="Host filter" value={view.director_id || ALL} onChange={pick('director_id')} options={[{ value: ALL, label: 'All hosts' }, ...hosts]} /></div>
          <div className={s.filterSelect}><AdminSelect label="Booking status filter" value={view.status || ALL} onChange={pick('status')} options={STATUS_OPTIONS} /></div>
          <div className={s.filterSelect}><AdminSelect label="Practice Better sync filter" value={view.pb_status || ALL} onChange={pick('pb_status')} options={PB_OPTIONS} /></div>
          <div className={s.filterSelect}><AdminSelect label="Booking sort order" value={view.sort} onChange={(v) => setViewAndSave({ sort: v })} options={SORT_OPTIONS} /></div>
          {filtered && <button type="button" className={s.resetButton} onClick={resetView}><X size={13} />Reset</button>}
        </div>

        <TabsContent value={view.time} className="mt-0" aria-busy={loading}>
          {!loaded ? (
            <p className={s.loadingRow} role="status">Loading bookings…</p>
          ) : rows.length ? (
            <div className={s.tableArea} data-busy={loading}>
              <div className={s.desktopTable}>
                <Table className={`${s.table} ${s.bookingsTable} ${s.scheduleTableLyra}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Session date</TableHead><TableHead>Patient</TableHead><TableHead>Host</TableHead><TableHead>Status</TableHead>
                      <TableHead>Practice Better</TableHead><TableHead>Meet</TableHead><TableHead><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((b) => (
                      <TableRow key={b.booking_id} className={s.clickableRow} onClick={() => setSelected(b)}>
                        <TableCell><DateStack iso={b.slot_start_utc} /></TableCell>
                        <TableCell><Patient b={b} onView={setSelected} /></TableCell>
                        <TableCell><Host b={b} /></TableCell>
                        <TableCell><BookingStatus b={b} /></TableCell>
                        <TableCell><PbStatus b={b} /></TableCell>
                        <TableCell>
                          {b.meet_link && b.status === 'confirmed'
                            ? <a className={s.joinButton} href={b.meet_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`Join the meeting with ${patientName(b) || 'the patient'}`}><Video size={15} />Join</a>
                            : <span className={s.monoTime}>—</span>}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}><RowMenu b={b} onView={setSelected} onReschedule={setRescheduleFor} done={refresh} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className={s.mobileList}>
                {rows.map((b) => (
                  <article className={s.scheduleMobileRow} key={b.booking_id}>
                    <div className={s.mobileRowTop}><Patient b={b} onView={setSelected} /><RowMenu b={b} onView={setSelected} onReschedule={setRescheduleFor} done={refresh} /></div>
                    <div className={s.mobileBookingDate}><DateStack iso={b.slot_start_utc} /></div>
                    <div className={s.mobileBookingBottom}><span className={s.hostCell}>{hostName(b)}</span><div><BookingStatus b={b} /><PbStatus b={b} /></div></div>
                  </article>
                ))}
              </div>
            </div>
          ) : filtered ? (
            <NoResults reset={resetView} />
          ) : (
            <p className={s.loadingRow}>No bookings yet.</p>
          )}
          <TablePager page={page} count={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </TabsContent>
      </Tabs>

      <BookingSheet booking={selected} onClose={() => setSelected(null)} onReschedule={setRescheduleFor} done={refresh} />
      {rescheduleFor && (
        <RescheduleModal booking={rescheduleFor} onClose={() => setRescheduleFor(null)} onDone={refresh} />
      )}
    </>
  );
}
