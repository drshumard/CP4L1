import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { BarChart3, RefreshCw, Calendar, ChevronDown, Users, TrendingUp, Clock } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const EYEBROW = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

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
  const [autoRefresh, setAutoRefresh] = useState(true);

  const startDateRef = useRef(startDate);
  const endDateRef = useRef(endDate);
  useEffect(() => { startDateRef.current = startDate; endDateRef.current = endDate; }, [startDate, endDate]);

  const formatDateForAPI = (date) => (date ? date.toISOString().split('T')[0] : '');

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
      else if (error.response?.status === 401) { localStorage.clear(); navigate('/login'); }
      else { toast.error('Failed to load analytics', { id: 'analytics-error' }); }
    } finally {
      setLoading(false);
      setAnalyticsLoading(false);
    }
  }, [navigate]);

  useEffect(() => { const { start, end } = getDefaultDates(); fetchAnalytics(start, end); }, [fetchAnalytics]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const interval = setInterval(() => fetchAnalytics(startDateRef.current, endDateRef.current), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAnalytics]);

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

  const stepDistribution = [
    { label: 'Refunded', count: analytics?.step_distribution?.refunded || 0, color: 'bg-rose-500' },
    { label: 'Step 1', count: analytics?.step_distribution?.step_1 || 0, color: 'bg-slate-300' },
    { label: 'Step 2', count: analytics?.step_distribution?.step_2 || 0, color: 'bg-slate-400' },
    { label: 'Step 3', count: analytics?.step_distribution?.step_3 || 0, color: 'bg-slate-500' },
    { label: 'Complete', count: analytics?.step_distribution?.step_4 || 0, color: 'bg-emerald-500' },
  ];
  const maxStepCount = Math.max(...stepDistribution.map((s) => s.count), 1);

  if (loading) {
    return <div className="py-16 text-center text-muted-foreground">Loading analytics...</div>;
  }

  const kpis = [
    { label: 'Total users', value: analytics?.total_users || 0, sub: 'all signups' },
    { label: 'Day-1 ready', value: `${analytics?.total_users ? Math.round((analytics?.day1_ready || 0) / analytics.total_users * 100) : 0}%`, sub: `${analytics?.day1_ready || 0} of ${analytics?.total_users || 0}` },
    { label: 'Activation rate', value: `${analytics?.completion_stats?.completion_rate || 0}%`, sub: `${analytics?.completion_stats?.completed || 0} completed`, accent: 'text-emerald-600' },
    { label: 'Refund rate', value: `${analytics?.completion_stats?.refund_rate || 0}%`, sub: `${analytics?.completion_stats?.refunded || 0} refunded`, accent: 'text-rose-600' },
    { label: 'Avg time to activate', value: analytics?.step_transition_times?.total_journey?.avg_formatted || '—', sub: 'booking → activation' },
  ];

  const funnel = [
    { label: 'Started', data: analytics?.funnel_data?.started, color: 'bg-slate-300' },
    { label: 'Booked consultation', data: analytics?.funnel_data?.completed_booking, color: 'bg-slate-400' },
    { label: 'Submitted intake', data: analytics?.funnel_data?.completed_intake, color: 'bg-slate-500' },
    { label: 'Activated portal', data: analytics?.funnel_data?.activated_portal, color: 'bg-emerald-500' },
  ];

  const transitions = [
    { label: 'Booking → Intake form', data: analytics?.step_transition_times?.booking_to_intake },
    { label: 'Intake → Completion', data: analytics?.step_transition_times?.intake_to_completion },
    { label: 'Completion → Activated', data: analytics?.step_transition_times?.completion_to_activated },
    { label: 'Total journey', data: analytics?.step_transition_times?.total_journey, highlight: true },
  ];

  const today = [
    { label: 'New signups', value: analytics?.realtime_stats?.today?.signups || 0 },
    { label: 'Logins', value: analytics?.realtime_stats?.today?.logins || 0 },
    { label: 'Bookings', value: analytics?.realtime_stats?.today?.bookings || 0 },
    { label: 'Forms submitted', value: analytics?.realtime_stats?.today?.form_submissions || 0 },
  ];

  return (
    <div className="p-5 sm:p-8 max-w-7xl 2xl:max-w-[1680px] mx-auto w-full space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <BarChart3 className="size-4" /> Patient journey & activation metrics
          </p>
          {analytics?.filters_applied?.start_date && (
            <p className="mt-1 text-xs text-muted-foreground">{analytics.filters_applied.start_date} to {analytics.filters_applied.end_date || 'now'}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {analyticsLoading && <RefreshCw className="size-4 animate-spin text-muted-foreground" />}
          <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Calendar className="size-4" /> {getDisplayLabel()} <ChevronDown className="size-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto min-w-[200px] p-1">
              {DATE_PRESETS.filter((p) => p.label !== 'Custom').map((preset) => (
                <button key={preset.label} type="button" onClick={() => handlePresetSelect(preset)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent ${selectedPreset === preset.label ? 'text-foreground' : 'text-muted-foreground'}`}>
                  <span>{preset.label}</span>
                  {selectedPreset === preset.label && <span className="size-1.5 rounded-full bg-primary" />}
                </button>
              ))}
              <div className="mt-1 border-t pt-1">
                <button type="button" onClick={() => setSelectedPreset('Custom')}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent ${selectedPreset === 'Custom' ? 'text-foreground' : 'text-muted-foreground'}`}>
                  <span>Custom range</span>
                  <ChevronDown className={`size-3.5 transition-transform ${selectedPreset === 'Custom' ? 'rotate-180' : ''}`} />
                </button>
                {selectedPreset === 'Custom' && (
                  <div className="mt-1 border-t p-2">
                    <DatePicker selected={startDate} onChange={handleCustomDateChange} startDate={startDate} endDate={endDate}
                      selectsRange inline monthsShown={1} maxDate={new Date()} calendarClassName="!border-0 !shadow-none" />
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <span className="flex items-center gap-1.5">Live {autoRefresh && <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />}</span>
          </label>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-5 shadow-sm">
            <p className={EYEBROW}>{k.label}</p>
            <p className={`mt-2 text-3xl font-semibold tabular-nums ${k.accent || 'text-foreground'}`}>{k.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Step distribution */}
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Users className="size-4 text-muted-foreground" /> Step distribution</h3>
        <div className="mt-4 space-y-3">
          {stepDistribution.map((step, index) => {
            const percentage = analytics?.total_users ? Math.round((step.count / analytics.total_users) * 100) : 0;
            const barWidth = maxStepCount > 0 ? Math.round((step.count / maxStepCount) * 100) : 0;
            return (
              <div key={step.label} className="flex items-center gap-4">
                <div className="w-20 flex-shrink-0 text-sm font-medium text-foreground">{step.label}</div>
                <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-muted">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${barWidth}%` }} transition={{ duration: 0.6, delay: index * 0.08 }}
                    className={`flex h-full items-center rounded-lg ${step.color}`}>
                    {barWidth > 15 && <span className="px-3 text-sm font-medium text-white">{step.count}</span>}
                  </motion.div>
                  {barWidth <= 15 && step.count > 0 && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm font-medium text-foreground">{step.count}</span>}
                </div>
                <div className="w-12 flex-shrink-0 text-right text-sm tabular-nums text-muted-foreground">{percentage}%</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Funnel + transition times */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><TrendingUp className="size-4 text-muted-foreground" /> Completion funnel</h3>
          <div className="mt-4 space-y-1">
            {funnel.map((stage, i) => (
              <div key={stage.label} className={`flex items-center justify-between py-2 ${i ? 'border-t' : ''}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`size-2.5 rounded-full ${stage.color}`} />
                  <span className="text-sm text-foreground">{stage.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium tabular-nums">{stage.data?.count || 0}</span>
                  <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{stage.data?.percentage || 0}%</span>
                  {stage.data?.drop_off > 0 ? <span className="text-xs font-medium text-rose-600">-{stage.data.drop_off}</span> : <span className="w-6" />}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Clock className="size-4 text-muted-foreground" /> Average time between steps</h3>
          <div className="mt-4 space-y-1">
            {transitions.map((t, i) => (
              <div key={t.label} className={`flex items-center justify-between py-2 ${i ? 'border-t' : ''}`}>
                <span className={`text-sm ${t.highlight ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{t.label}</span>
                <div className="flex items-center gap-2">
                  {t.data?.avg_formatted ? (
                    <>
                      <span className={`text-sm tabular-nums ${t.highlight ? 'font-semibold text-foreground' : 'font-medium'}`}>{t.data.avg_formatted}</span>
                      <span className="text-xs text-muted-foreground">({t.data.count})</span>
                    </>
                  ) : <span className="text-sm text-muted-foreground">No data</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Today */}
      <section>
        <h3 className={`${EYEBROW} mb-3`}>Today</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {today.map((m) => (
            <div key={m.label} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className={EYEBROW}>Live</span>
                <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
              </div>
              <div className="text-2xl font-semibold tabular-nums text-foreground">{m.value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{m.label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminAnalytics;
