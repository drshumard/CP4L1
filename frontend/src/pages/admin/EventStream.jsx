import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Activity, Clock3, Download, FileText, Filter, ListChecks, LogIn, Mail, MessageSquareText, Settings2, UserPlus, X,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { adminApi } from './api';
import { fmtDate, fmtDateTime, fmtTime } from './format';
import { eventFamily, humanizeEvent } from './events';
import { AdminSelect, NoResults, SearchBox, TablePager, useLastRecord } from './workspace-ui';
import s from './workspace.module.css';

// Analytics → Event stream: the activity log (was its own page, /admin/logs). Design: the event stream on
// shumard-checkout-portal/app/admin/analytics/page.tsx. Server-paged; `refreshKey` bumps re-fetch it.

const ALL = '__all__';
const PER_PAGE = [25, 50, 100, 200, 500];
const FAMILY_ICON = { sms: MessageSquareText, email: Mail, settings: Settings2, step: ListChecks, schedule: Clock3, login: LogIn, signup: UserPlus, other: Activity };

function statusTone(st) {
  const v = String(st || '').toLowerCase();
  if (['success', 'sent', 'synced', 'complete', 'completed', 'active'].includes(v)) return 'success';
  if (['error', 'failed', 'failure', 'cancelled', 'canceled'].includes(v)) return 'failed';
  if (['pending', 'skipped', 'queued', 'processing'].includes(v)) return 'review';
  return 'none';
}
const cap = (v) => (v ? String(v).charAt(0).toUpperCase() + String(v).slice(1) : '—');
const device = (log) => (log.device_info ? [log.device_info.device_type, [log.device_info.browser, log.device_info.os].filter(Boolean).join(' / ')].filter(Boolean).join(' · ') : '');
const place = (log) => {
  const l = log.location_info;
  if (l?.city && l?.country) return [l.city, l.region, l.country].filter(Boolean).join(', ');
  return log.ip_address ? `IP ${log.ip_address}` : '';
};
const actor = (log) => log.actor_name || log.actor_email || '';

function EventIcon({ type }) {
  const Icon = FAMILY_ICON[eventFamily(type)] || Activity;
  return <span className={s.logIcon}><Icon size={15} /></span>;
}

function StatusChip({ value }) {
  return <span className={s.logStatus} data-tone={statusTone(value)}>{cap(value)}</span>;
}

function EventCell({ log }) {
  return (
    <div className={s.eventCell}>
      <EventIcon type={log.event_type} />
      <div><strong>{humanizeEvent(log.event_type)}</strong><span>{log.event_type}</span></div>
    </div>
  );
}

function EventSheet({ log: current, onClose }) {
  const log = useLastRecord(current);
  const details = log?.details && typeof log.details === 'object' ? Object.entries(log.details) : [];
  return (
    <Sheet open={!!current} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className={s.detailSheet}>
        <SheetHeader>
          <SheetTitle>Event details</SheetTitle>
          <SheetDescription className={s.sheetDescription}>Everything recorded for this activity.</SheetDescription>
        </SheetHeader>
        {log && (
          <>
            <div className={s.eventSheetHeader}>
              <EventIcon type={log.event_type} />
              <div><span>{log.event_type}</span><h3>{humanizeEvent(log.event_type)}</h3></div>
            </div>
            <dl className={s.detailList}>
              <div><dt>Status</dt><dd><StatusChip value={log.status} /></dd></div>
              <div><dt>Timestamp</dt><dd>{log.timestamp ? `${fmtDate(log.timestamp)} at ${fmtTime(log.timestamp)}` : '—'}</dd></div>
              <div><dt>User</dt><dd>{log.user_email || '—'}{log.user_id && <small className={s.ddSub}>{log.user_id}</small>}</dd></div>
              <div><dt>Actor</dt><dd>{actor(log) || '—'}{log.actor_name && log.actor_email && <small className={s.ddSub}>{log.actor_email}</small>}</dd></div>
              <div><dt>Category</dt><dd>{log.category === 'admin' ? 'Admin' : 'Patient'}</dd></div>
              <div><dt>Device</dt><dd>{device(log) || '—'}</dd></div>
              <div><dt>Location</dt><dd>{place(log) || '—'}{log.ip_address && log.location_info?.city && <small className={s.ddSub}>IP {log.ip_address}</small>}</dd></div>
            </dl>
            <section className={s.sheetSection} aria-labelledby="event-details">
              <div className={s.sheetSectionHead}><h3 id="event-details">Details</h3></div>
              {details.length ? (
                <dl className={s.kvList}>
                  {details.map(([k, v]) => (
                    <div key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd>{v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></div>
                  ))}
                </dl>
              ) : <p className={s.detailNote}>No details recorded.</p>}
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function EventStream({ refreshKey }) {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [category, setCategory] = useState('all');   // all | patient | admin
  const [eventType, setEventType] = useState('');
  const [email, setEmail] = useState('');
  const [debouncedEmail, setDebouncedEmail] = useState('');
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);

  // Filters shared by the table and the CSV export.
  const params = useCallback((overrides = {}) => {
    const p = { page, per_page: perPage, ...overrides };
    if (category !== 'all') p.category = category;
    if (eventType) p.event_type = eventType;
    if (debouncedEmail) p.user_email = debouncedEmail;
    return p;
  }, [page, perPage, category, eventType, debouncedEmail]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminApi.get('/admin/activity-logs', params())
      .then((r) => {
        if (cancelled) return;
        setLogs(r.data.logs || []);
        setEventTypes(r.data.event_types || []);
        setTotal(r.data.pagination?.total_count || 0);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error.response?.status === 401 || error.response?.status === 403) { toast.error('Unauthorized access'); navigate('/login'); }
        else toast.error('Failed to fetch activity logs');
      })
      .finally(() => { if (!cancelled) { setLoading(false); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [params, refreshKey, navigate]);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedEmail(email.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [email]);

  const changeCategory = (v) => { setCategory(v); setPage(1); };
  const changeEventType = (v) => { setEventType(v === ALL ? '' : v); setPage(1); };
  const changePerPage = (v) => { setPerPage(parseInt(v, 10)); setPage(1); };
  const clear = () => { setEventType(''); setEmail(''); setPage(1); };

  const exportCsv = async () => {
    try {
      const r = await adminApi.get('/admin/activity-logs', params({ page: 1, per_page: 500 }));
      const rows = r.data.logs || [];
      const csv = [
        ['Timestamp', 'Category', 'Event Type', 'Actor', 'User Email', 'User ID', 'Device', 'Location', 'IP Address', 'Status', 'Details'],
        ...rows.map((log) => [
          log.timestamp, log.category || 'patient', log.event_type, log.actor_email || log.actor_name || 'N/A', log.user_email || 'N/A', log.user_id || 'N/A',
          log.device_info ? `${log.device_info.device_type || ''} / ${log.device_info.browser || ''} / ${log.device_info.os || ''}` : 'N/A',
          log.location_info?.city && log.location_info?.country ? `${log.location_info.city}, ${log.location_info.country}` : 'N/A',
          log.ip_address || 'N/A', log.status,
          JSON.stringify(log.details || {}).replace(/,/g, ';'),
        ]),
      ].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
      const url = window.URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity_logs_${new Date().toISOString()}.csv`;
      a.click();
      toast.success(`Exported ${rows.length} logs`);
    } catch {
      toast.error('Failed to export logs');
    }
  };

  const typeOptions = [{ value: ALL, label: 'All event types' }, ...eventTypes.map((t) => ({ value: t, label: humanizeEvent(t) }))];

  return (
    <>
      <Tabs value={category} onValueChange={changeCategory} className={`${s.surface} ${s.analyticsSurface}`} id="event-stream">
        <div className={s.analyticsToolbar}>
          <div>
            <span className={s.analyticsKicker}>EVENT STREAM</span>
            <h2>Recent activity<span className={s.peopleCount}>{total.toLocaleString()} {total === 1 ? 'event' : 'events'}</span></h2>
          </div>
          <TabsList className={s.lyraTabs} aria-label="Activity scope">
            <TabsTrigger value="all">All activity</TabsTrigger>
            <TabsTrigger value="patient">Patient</TabsTrigger>
            <TabsTrigger value="admin">Admin</TabsTrigger>
          </TabsList>
        </div>

        <div className={s.analyticsFilters}>
          <span className={s.filterLabel}><Filter size={14} />Filters</span>
          <div className={s.analyticsEventFilter}><AdminSelect label="Event type" value={eventType || ALL} onChange={changeEventType} options={typeOptions} /></div>
          <SearchBox value={email} onChange={setEmail} label="Filter by user email" />
          <div className={s.analyticsPerPage}><AdminSelect label="Rows per page" value={String(perPage)} onChange={changePerPage} options={PER_PAGE.map((n) => ({ value: String(n), label: `${n} rows` }))} /></div>
          {(eventType || email) && <button type="button" className={s.resetButton} onClick={clear}><X size={13} />Clear</button>}
          <button type="button" className={`${s.smallButton} ${s.exportButton}`} onClick={exportCsv}><Download size={14} />Export CSV</button>
        </div>

        <TabsContent value={category} className="mt-0" aria-busy={loading}>
          {!loaded ? (
            <p className={s.loadingRow} role="status">Loading activity…</p>
          ) : logs.length ? (
            <div className={s.tableArea} data-busy={loading}>
              <div className={s.desktopTable}>
                <Table className={`${s.table} ${s.analyticsTable}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead><TableHead>Timestamp</TableHead><TableHead>User</TableHead><TableHead>Actor</TableHead>
                      <TableHead>Context</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Details</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log, i) => (
                      <TableRow key={`${log.timestamp}-${i}`} className={s.logRow} onClick={() => setSelected(log)}>
                        <TableCell><EventCell log={log} /></TableCell>
                        <TableCell><span className={s.monoDate}>{fmtDate(log.timestamp)}</span><span className={s.monoTime}>{fmtTime(log.timestamp)}</span></TableCell>
                        <TableCell><span className={s.userCell}>{log.user_email || '—'}</span></TableCell>
                        <TableCell>{actor(log) || '—'}</TableCell>
                        <TableCell><span className={s.contextCell}>{device(log) || '—'}</span>{place(log) && <small>{place(log)}</small>}</TableCell>
                        <TableCell><StatusChip value={log.status} /></TableCell>
                        <TableCell>
                          <button type="button" className={s.iconButton} aria-label={`View ${humanizeEvent(log.event_type)} details`} onClick={(e) => { e.stopPropagation(); setSelected(log); }}><FileText size={17} /></button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className={s.mobileList}>
                {logs.map((log, i) => (
                  <button type="button" key={`${log.timestamp}-${i}`} className={s.analyticsMobileRow} onClick={() => setSelected(log)}>
                    <div className={s.analyticsMobileTop}><EventCell log={log} /><StatusChip value={log.status} /></div>
                    <span className={s.userCell}>{log.user_email || '—'}</span>
                    <div><span className={s.monoCell}>{fmtDateTime(log.timestamp)}</span><span>{actor(log)}</span></div>
                  </button>
                ))}
              </div>
            </div>
          ) : (eventType || debouncedEmail) ? (
            <NoResults reset={clear} />
          ) : (
            <p className={s.loadingRow}>No activity recorded yet.</p>
          )}
          <TablePager page={page} count={total} pageSize={perPage} onChange={setPage} />
        </TabsContent>
      </Tabs>

      <EventSheet log={selected} onClose={() => setSelected(null)} />
    </>
  );
}
