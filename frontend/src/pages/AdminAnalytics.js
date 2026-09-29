import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginPath } from '@/lib/staffApps';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { toast } from 'sonner';
import { Calendar, CheckCircle2, ChevronDown, RefreshCw, Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import EventStream from './admin/EventStream';
import { fmtDate } from './admin/format';
import s from './admin/workspace.module.css';

// Admin → Analytics: the patient-journey metrics and, below them, the event stream (the activity log, which
// used to be its own page). Design: shumard-checkout-portal/app/admin/analytics/page.tsx — its overview strip
// carries the journey KPIs here, and the funnel / timing / no-show sections follow in the same geometry.

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DATE_PRESETS = [
  { label: 'Today', getValue: () => { const today = new Date(); return { start: today, end: today }; } },
  { label: 'Yesterday', getValue: () => { const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); return { start: yesterday, end: yesterday }; } },
  { label: 'Last 7 Days', getValue: () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 6); return { start, end }; } },
  { label: 'Last 30 Days', getValue: () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 29); return { start, end }; } },
  { label: 'This Month', getValue: () => { const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), 1); return { start, end: now }; } },
  { label: 'Last Month', getValue: () => { const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth() - 1, 1); const end = new Date(now.getFullYear(), now.getMonth(), 0); return { start, end }; } },
  { label: 'All Time', getValue: () => ({ start: null, end: null }) },
  { label: 'Custom', getValue: () => null },
];

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

function InsightCard({ kicker, title, children }) {
  return (
    <section className={s.insightCard}>
      <div className={s.insightHead}><div><span className={s.analyticsKicker}>{kicker}</span><h2>{title}</h2></div></div>
      <div className={s.insightRows}>{children}</div>
    </section>
  );
}

const AdminAnalytics = () => {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const getDefaultDates = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    return { start, end };
  };

  const defaultDates = getDefaultDates();
  const [startDate, setStartDate] = useState(defaultDates.start);
  const [endDate, setEndDate] = useState(defaultDates.end);
  const [selectedPreset, setSelectedPreset] = useState('Last 7 Days');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [streamKey, setStreamKey] = useState(0);   // bump to re-fetch the event stream

  const startDateRef = useRef(startDate);
  const endDateRef = useRef(endDate);
  useEffect(() => { startDateRef.current = startDate; endDateRef.current = endDate; }, [startDate, endDate]);

  // The picked calendar day as-is (the API reads it as a Pacific date). toISOString() would send the UTC date — a day
  // early for a date picked under BST, a day late for a US evening's "Today".
  const formatDateForAPI = (date) => (date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '');

  const fetchAnalytics = useCallback(async (start, end) => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await axios.get(`${API}/admin/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { start_date: start ? formatDateForAPI(start) : undefined, end_date: end ? formatDateForAPI(end) : undefined },
      });
      setAnalytics(res.data);
    } catch (error) {
      if (error.response?.status === 403) { toast.error('Admin access required', { id: 'admin-access-required' }); navigate('/'); }
      else if (error.response?.status === 401) { localStorage.clear(); navigate(loginPath()); }
      else { toast.error('Failed to load analytics', { id: 'analytics-error' }); }
    } finally {
      setLoading(false);
      setAnalyticsLoading(false);
    }
  }, [navigate]);

  useEffect(() => { const { start, end } = getDefaultDates(); fetchAnalytics(start, end); }, [fetchAnalytics]);

  // The metrics refresh themselves every 30s; the event stream refreshes with "Refresh data" (rows don't jump mid-read).
  useEffect(() => {
    const interval = setInterval(() => fetchAnalytics(startDateRef.current, endDateRef.current), 30000);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  const refreshAll = () => {
    setAnalyticsLoading(true);
    fetchAnalytics(startDateRef.current, endDateRef.current);
    setStreamKey((k) => k + 1);
  };

  const handlePresetSelect = (preset) => {
    setSelectedPreset(preset.label);
    if (preset.label === 'Custom') return;
    const range = preset.getValue();
    if (range) {
      setStartDate(range.start);
      setEndDate(range.end);
      setAnalyticsLoading(true);
      fetchAnalytics(range.start, range.end);
    }
    setShowDatePicker(false);
  };

  const handleCustomDateChange = (dates) => {
    const [start, end] = dates;
    setStartDate(start);
    setEndDate(end);
    setSelectedPreset('Custom');
    if (start && end) {
      setAnalyticsLoading(true);
      fetchAnalytics(start, end);
      setShowDatePicker(false);
    }
  };

  const getDisplayLabel = () => {
    if (selectedPreset === 'All Time') return 'All Time';
    if (selectedPreset === 'Custom' && startDate && endDate) {
      return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (startDate && endDate && startDate.toDateString() === endDate.toDateString()) {
      return startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    if (startDate && endDate) {
      return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    return selectedPreset;
  };

  if (loading) {
    return <p className={s.loadingRow} role="status">Loading analytics…</p>;
  }

  const a = analytics || {};
  const totalUsers = a.total_users || 0;
  const steps = [
    { label: 'Refund', title: 'Refunded', count: a.step_distribution?.refunded || 0 },
    { label: 'Step 1', title: 'Step 1', count: a.step_distribution?.step_1 || 0 },
    { label: 'Step 2', title: 'Step 2', count: a.step_distribution?.step_2 || 0 },
    { label: 'Step 3', title: 'Step 3', count: a.step_distribution?.step_3 || 0 },
    { label: 'Done', title: 'Complete', count: a.step_distribution?.step_4 || 0 },
  ];
  const maxStep = Math.max(...steps.map((x) => x.count), 1);

  const funnel = [
    { label: 'Started', data: a.funnel_data?.started },
    { label: 'Booked consultation', data: a.funnel_data?.completed_booking },
    { label: 'Submitted intake', data: a.funnel_data?.completed_intake },
    { label: 'Activated portal', data: a.funnel_data?.activated_portal },
  ];
  const transitions = [
    { label: 'Booking → Intake form', data: a.step_transition_times?.booking_to_intake },
    { label: 'Intake → Completion', data: a.step_transition_times?.intake_to_completion },
    { label: 'Completion → Activated', data: a.step_transition_times?.completion_to_activated },
    { label: 'Total journey · booking → activation', data: a.step_transition_times?.total_journey, strong: true },
  ];
  const today = [
    { label: 'New signups', value: a.realtime_stats?.today?.signups || 0 },
    { label: 'Logins', value: a.realtime_stats?.today?.logins || 0 },
    { label: 'Bookings', value: a.realtime_stats?.today?.bookings || 0 },
    { label: 'Forms submitted', value: a.realtime_stats?.today?.form_submissions || 0 },
  ];
  const noShows = a.booking_stats?.by_session || [];

  return (
    <div className={s.analyticsLyra}>
      <div className={s.heading}>
        <div>
          <h1>Analytics</h1>
          <p>Track patient activity and the events that keep onboarding moving.</p>
        </div>
        <div className={s.headingActions}>
          <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
            <PopoverTrigger asChild>
              <button type="button" className={`${s.secondaryButton} ${s.rangeButton}`}>
                <Calendar size={16} />{getDisplayLabel()}<ChevronDown size={15} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className={s.rangeMenu}>
              {DATE_PRESETS.filter((p) => p.label !== 'Custom').map((preset) => (
                <button key={preset.label} type="button" onClick={() => handlePresetSelect(preset)} aria-current={selectedPreset === preset.label ? 'true' : undefined}>
                  <span>{preset.label}</span>{selectedPreset === preset.label && <i />}
                </button>
              ))}
              <div className={s.rangeCustom}>
                <button type="button" onClick={() => setSelectedPreset('Custom')} aria-current={selectedPreset === 'Custom' ? 'true' : undefined}>
                  <span>Custom range</span><ChevronDown size={14} style={{ transform: selectedPreset === 'Custom' ? 'rotate(180deg)' : 'none' }} />
                </button>
                {selectedPreset === 'Custom' && (
                  <DatePicker selected={startDate} onChange={handleCustomDateChange} startDate={startDate} endDate={endDate}
                    selectsRange inline monthsShown={1} maxDate={new Date()} calendarClassName="!border-0 !shadow-none" />
                )}
              </div>
            </PopoverContent>
          </Popover>
          <button type="button" className={s.secondaryButton} onClick={refreshAll} disabled={analyticsLoading}>
            <RefreshCw size={16} className={analyticsLoading ? 'animate-spin' : ''} />Refresh data
          </button>
        </div>
      </div>

      <section className={s.analyticsOverview} aria-label="Journey overview">
        <div className={s.analyticsHeroMetric}>
          <span>TOTAL USERS · {getDisplayLabel().toUpperCase()}</span>
          <strong>{totalUsers.toLocaleString()}</strong>
          <p><Sparkles size={15} /> {pct(a.day1_ready || 0, totalUsers)}% Day-1 ready ({a.day1_ready || 0} of {totalUsers})</p>
        </div>
        <div className={s.analyticsMetrics}>
          <div><span>Activation rate</span><strong>{a.completion_stats?.completion_rate || 0}%</strong><small><CheckCircle2 size={13} /> {a.completion_stats?.completed || 0} completed</small></div>
          <div><span>Refund rate</span><strong>{a.completion_stats?.refund_rate || 0}%</strong><small>{a.completion_stats?.refunded || 0} refunded</small></div>
          <div><span>No-show rate</span><strong>{a.booking_stats?.no_show_rate || 0}%</strong><small>{a.booking_stats?.no_shows || 0} of {a.booking_stats?.past_sessions || 0} sessions</small></div>
        </div>
        <div className={s.activityChart} aria-label="Users by journey step">
          <div className={s.chartHeading}><div><span>JOURNEY</span><strong>Where users are now</strong></div><span>{pct(steps[4].count, totalUsers)}% complete</span></div>
          <div className={`${s.bars} ${s.journeyBars}`}>
            {steps.map((st) => (
              <div key={st.label} title={`${st.title}: ${st.count} (${pct(st.count, totalUsers)}%)`}>
                <b>{st.count}</b>
                <i style={{ height: `${Math.round((st.count / maxStep) * 100)}%` }} />
                <span>{st.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className={s.insightGrid}>
        <InsightCard kicker="FUNNEL" title="Completion funnel">
          {funnel.map((f) => (
            <div key={f.label} className={s.insightRow}>
              <span>{f.label}</span>
              <b>{f.data?.count || 0}</b>
              <em>{f.data?.percentage || 0}%</em>
              <small>{f.data?.drop_off > 0 ? `−${f.data.drop_off}` : ''}</small>
            </div>
          ))}
        </InsightCard>
        <InsightCard kicker="TIMING" title="Average time between steps">
          {transitions.map((t) => (
            <div key={t.label} className={s.insightRow} data-strong={t.strong || undefined}>
              <span>{t.label}</span>
              <b>{t.data?.avg_formatted || 'No data'}</b>
              <em>{t.data?.avg_formatted ? `(${t.data.count})` : ''}</em>
            </div>
          ))}
        </InsightCard>
      </div>

      {noShows.length > 0 && (
        <InsightCard kicker="NO-SHOWS" title="No-shows by event">
          {noShows.map((x) => (
            <div key={x.session_id} className={s.insightRow}>
              <span>{x.title}</span>
              <em>{x.no_shows} of {x.past_sessions}</em>
              <b data-alert={x.no_shows > 0 || undefined}>{x.no_show_rate}%</b>
            </div>
          ))}
        </InsightCard>
      )}

      <section className={s.todayStrip} aria-label="Today">
        <div><span className={s.analyticsKicker}>TODAY</span><p>{fmtDate(new Date())}</p></div>
        {today.map((m) => <div key={m.label}><strong>{m.value}</strong><p>{m.label}</p></div>)}
      </section>

      <EventStream refreshKey={streamKey} />
    </div>
  );
};

export default AdminAnalytics;
