import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { RefreshCw, Download, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDateTime } from './admin/format';
import { humanizeEvent } from './admin/events';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const HEADER_GRADIENT = 'linear-gradient(to top, #F8F8F8, #F8F8F899, #00000000)';
const HEAD = 'h-12 px-4 text-left align-middle text-[13px] font-semibold text-foreground';
const CELL = 'px-4 py-2.5 text-sm align-top';
const ALL = '__all__';
const TG_ON = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground';

const statusColor = (s) => {
  const v = String(s || '').toLowerCase();
  if (['success', 'sent', 'synced', 'complete', 'completed', 'active'].includes(v)) return 'text-emerald-600';
  if (['error', 'failed', 'cancelled', 'canceled'].includes(v)) return 'text-red-600';
  if (['pending', 'skipped', 'queued', 'processing'].includes(v)) return 'text-amber-600';
  return 'text-muted-foreground';
};

const ActivityLogs = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1, per_page: 50, total_count: 0, total_pages: 0, has_next: false, has_prev: false,
  });
  const [filters, setFilters] = useState({ event_type: '', user_email: '' });
  const [category, setCategory] = useState('all'); // all | patient | admin

  useEffect(() => { fetchLogs(1); /* eslint-disable-next-line */ }, []);

  const fetchLogs = async (page = pagination.page, cat = category) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('per_page', pagination.per_page);
      if (cat && cat !== 'all') params.append('category', cat);
      if (filters.event_type) params.append('event_type', filters.event_type);
      if (filters.user_email) params.append('user_email', filters.user_email);
      const response = await axios.get(`${API}/admin/activity-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLogs(response.data.logs);
      setEventTypes(response.data.event_types);
      setPagination((prev) => ({ ...prev, ...response.data.pagination }));
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        toast.error('Unauthorized access');
        navigate('/login');
      } else {
        toast.error('Failed to fetch activity logs');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const handlePerPageChange = (value) => setPagination((prev) => ({ ...prev, per_page: parseInt(value, 10), page: 1 }));
  const applyFilters = () => fetchLogs(1);
  const clearFilters = () => {
    setFilters({ event_type: '', user_email: '' });
    setPagination((prev) => ({ ...prev, page: 1 }));
    setTimeout(() => fetchLogs(1), 100);
  };
  const goToPage = (page) => { if (page >= 1 && page <= pagination.total_pages) fetchLogs(page); };

  const exportLogs = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams();
      params.append('page', 1);
      params.append('per_page', 500);
      if (category && category !== 'all') params.append('category', category);
      if (filters.event_type) params.append('event_type', filters.event_type);
      if (filters.user_email) params.append('user_email', filters.user_email);
      const response = await axios.get(`${API}/admin/activity-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rows = response.data.logs;
      const csvContent = [
        ['Timestamp', 'Category', 'Event Type', 'Actor', 'User Email', 'User ID', 'Device', 'Location', 'IP Address', 'Status', 'Details'],
        ...rows.map((log) => [
          log.timestamp, log.category || 'patient', log.event_type, log.actor_email || log.actor_name || 'N/A', log.user_email || 'N/A', log.user_id || 'N/A',
          log.device_info ? `${log.device_info.device_type || ''} / ${log.device_info.browser || ''} / ${log.device_info.os || ''}` : 'N/A',
          log.location_info?.city && log.location_info?.country ? `${log.location_info.city}, ${log.location_info.country}` : 'N/A',
          log.ip_address || 'N/A', log.status,
          JSON.stringify(log.details || {}).replace(/,/g, ';'),
        ]),
      ].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity_logs_${new Date().toISOString()}.csv`;
      a.click();
      toast.success(`Exported ${rows.length} logs`);
    } catch (error) {
      toast.error('Failed to export logs');
    }
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, pagination.page - Math.floor(maxVisible / 2));
    const end = Math.min(pagination.total_pages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i += 1) pages.push(i);
    return pages;
  };

  return (
    <div className="p-5 sm:p-8 max-w-7xl 2xl:max-w-[1680px] mx-auto w-full">
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{pagination.total_count.toLocaleString()} total log{pagination.total_count === 1 ? '' : 's'}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchLogs(pagination.page)} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={exportLogs}><Download className="size-4" /> Export CSV</Button>
        </div>
      </div>

      {/* Patient vs admin activity */}
      <div className="mb-4">
        <ToggleGroup type="single" value={category} variant="outline" className="justify-start"
          onValueChange={(v) => { if (v) { setCategory(v); fetchLogs(1, v); } }}>
          <ToggleGroupItem value="all" className={TG_ON}>All activity</ToggleGroupItem>
          <ToggleGroupItem value="patient" className={TG_ON}>Patient</ToggleGroupItem>
          <ToggleGroupItem value="admin" className={TG_ON}>Admin activity</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="space-y-1.5">
          <Label>Event type</Label>
          <Select value={filters.event_type || ALL} onValueChange={(v) => handleFilterChange('event_type', v === ALL ? '' : v)}>
            <SelectTrigger className="w-[220px]" aria-label="Event type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All events</SelectItem>
              {eventTypes.map((t) => <SelectItem key={t} value={t}>{humanizeEvent(t)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="al-email">User email</Label>
          <Input id="al-email" type="email" placeholder="Filter by email" value={filters.user_email}
            onChange={(e) => handleFilterChange('user_email', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()} className="w-[220px]" />
        </div>
        <div className="space-y-1.5">
          <Label>Per page</Label>
          <Select value={String(pagination.per_page)} onValueChange={handlePerPageChange}>
            <SelectTrigger className="w-[100px]" aria-label="Rows per page"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200, 500].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={applyFilters}>Apply</Button>
        <Button variant="outline" onClick={clearFilters}>Clear</Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden" tabIndex={0} role="region" aria-label="Activity log">
        <Table>
          <TableHeader>
            <TableRow className="border-b hover:bg-transparent" style={{ backgroundImage: HEADER_GRADIENT }}>
              <TableHead className={HEAD}>Timestamp</TableHead>
              <TableHead className={HEAD}>Event Type</TableHead>
              <TableHead className={HEAD}>Actor</TableHead>
              <TableHead className={HEAD}>User</TableHead>
              <TableHead className={HEAD}>Device</TableHead>
              <TableHead className={HEAD}>Location</TableHead>
              <TableHead className={HEAD}>Status</TableHead>
              <TableHead className={HEAD}>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && logs.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No activity logs found.</TableCell></TableRow>
            ) : logs.map((log, index) => (
              <TableRow key={index}>
                <TableCell className={`${CELL} whitespace-nowrap text-xs text-muted-foreground`}>{fmtDateTime(log.timestamp)}</TableCell>
                <TableCell className={`${CELL} font-medium text-foreground`} title={log.event_type}>{humanizeEvent(log.event_type)}</TableCell>
                <TableCell className={CELL}>
                  {log.actor_name || log.actor_email
                    ? <span className="font-medium text-foreground" title={log.actor_email || ''}>{log.actor_name || log.actor_email}</span>
                    : <span className="text-muted-foreground/60">-</span>}
                </TableCell>
                <TableCell className={`${CELL} text-muted-foreground`}>{log.user_email || <span className="text-muted-foreground/60">N/A</span>}</TableCell>
                <TableCell className={CELL}>
                  {log.device_info ? (
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{log.device_info.device_type || 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground">{log.device_info.browser} / {log.device_info.os}</span>
                    </div>
                  ) : <span className="text-muted-foreground/60">-</span>}
                </TableCell>
                <TableCell className={CELL}>
                  {log.location_info || log.ip_address ? (
                    <div className="flex flex-col">
                      {log.location_info?.city && log.location_info?.country ? (
                        <>
                          <span className="flex items-center gap-1.5 font-medium text-foreground">
                            <MapPin className="size-3.5 text-muted-foreground" />
                            {log.location_info.city}, {log.location_info.country}
                          </span>
                          {log.location_info.region && <span className="text-xs text-muted-foreground">{log.location_info.region}</span>}
                        </>
                      ) : log.ip_address ? <span className="text-xs text-muted-foreground">IP: {log.ip_address}</span> : null}
                      {log.ip_address && log.location_info?.city && <span className="mt-0.5 text-xs text-muted-foreground/70">{log.ip_address}</span>}
                    </div>
                  ) : <span className="text-muted-foreground/60">-</span>}
                </TableCell>
                <TableCell className={CELL}>
                  <span className={`font-semibold capitalize ${statusColor(log.status)}`}>{log.status}</span>
                </TableCell>
                <TableCell className={`${CELL} text-muted-foreground`}>
                  <div className="max-w-xs truncate" title={JSON.stringify(log.details, null, 2)}>
                    {log.details && Object.keys(log.details).length > 0 ? (
                      Object.entries(log.details).slice(0, 2).map(([key, value]) => (
                        <div key={key} className="text-xs">
                          <span className="text-muted-foreground">{key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}</span>{' '}
                          <span className="font-medium text-foreground">{String(value)}</span>
                        </div>
                      ))
                    ) : <span className="text-muted-foreground/60">No details</span>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="mt-3 flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((pagination.page - 1) * pagination.per_page) + 1} - {Math.min(pagination.page * pagination.per_page, pagination.total_count)} of {pagination.total_count.toLocaleString()}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => goToPage(pagination.page - 1)} disabled={!pagination.has_prev || loading}>
              <ChevronLeft className="size-4" /> Previous
            </Button>
            {getPageNumbers().map((pageNum) => (
              <Button key={pageNum} variant={pageNum === pagination.page ? 'default' : 'outline'} size="sm"
                className="w-9" onClick={() => goToPage(pageNum)} disabled={loading}>
                {pageNum}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => goToPage(pagination.page + 1)} disabled={!pagination.has_next || loading}>
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityLogs;
