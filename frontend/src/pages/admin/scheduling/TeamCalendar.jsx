import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  Check, ChevronLeft, ChevronRight, ChevronDownIcon, RefreshCw, Users, Video, ExternalLink, TriangleAlert, MapPin, Settings2, X,
} from 'lucide-react';
import { adminApi } from '../api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const EYEBROW = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const TG_ON = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground';

const CLINIC_TZ = 'America/Los_Angeles';
const HOUR_PX = 56;
const GUTTER_PX = 76;
const LS_KEY = 'teamcal.prefs.v1';
const REFETCH_MS = 120_000;

// Host palette companions for the backend HOST_COLOR_PALETTE (600-level hexes):
// tint (50) for filter chips/badges, card (100) for event blocks, text (700) for type on tints.
// Blocks are borderless soft fills — solid host color with white text marks our own bookings.
const PALETTE = {
  '#2563eb': { tint: '#eff6ff', card: '#dbeafe', text: '#1d4ed8' },
  '#7c3aed': { tint: '#f5f3ff', card: '#ede9fe', text: '#6d28d9' },
  '#059669': { tint: '#ecfdf5', card: '#d1fae5', text: '#047857' },
  '#d97706': { tint: '#fffbeb', card: '#fef3c7', text: '#b45309' },
  '#0e7490': { tint: '#ecfeff', card: '#cffafe', text: '#155e75' },
  '#e11d48': { tint: '#fff1f2', card: '#ffe4e6', text: '#be123c' },
  '#4f46e5': { tint: '#eef2ff', card: '#e0e7ff', text: '#4338ca' },
  '#c026d3': { tint: '#fdf4ff', card: '#fae8ff', text: '#a21caf' },
  '#0d9488': { tint: '#f0fdfa', card: '#ccfbf1', text: '#0f766e' },
  '#ea580c': { tint: '#fff7ed', card: '#ffedd5', text: '#c2410c' },
};
const paletteFor = (hex) => PALETTE[hex] || { tint: '#f5f5f4', card: '#e7e5e4', text: '#525252' };
const BUSY_BG = 'repeating-linear-gradient(45deg, rgba(15,23,42,0.07) 0 4px, transparent 4px 9px), #f1f5f9';

const ROLE_ORDER = ['director', 'pcc', 'hc', 'va'];
const ROLE_LABEL = { director: 'Directors', pcc: 'PCCs', hc: 'HCs', va: 'VA' };

// Hour gridlines: solid hairline each hour, faint tone each half hour.
const COL_BG = {
  backgroundImage:
    'repeating-linear-gradient(to bottom, #ececea 0 1px, transparent 1px 56px),' +
    'repeating-linear-gradient(to bottom, transparent 0 28px, rgba(0,0,0,0.03) 28px 29px, transparent 29px 56px)',
};

// ---------------------------------------------------------------- timezone math (no deps)
// All payload times are UTC instants; the grid renders wall-clock in the selected IANA zone.

const _fmtCache = {};
function tzFormatter(tz) {
  if (!_fmtCache[tz]) {
    _fmtCache[tz] = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
  }
  return _fmtCache[tz];
}

/** {ymd: 'YYYY-MM-DD', minutes: minute-of-day} of a Date, seen from tz. */
function zoned(date, tz) {
  const parts = {};
  for (const p of tzFormatter(tz).formatToParts(date)) parts[p.type] = p.value;
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** UTC instant of midnight of ymd in tz (two-pass offset correction, DST-safe). */
function zonedMidnightUtc(ymd, tz) {
  const [y, m, d] = ymd.split('-').map(Number);
  let guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (let i = 0; i < 2; i++) {
    const z = zoned(new Date(guess), tz);
    const [zy, zm, zd] = z.ymd.split('-').map(Number);
    const diff = (Date.UTC(zy, zm - 1, zd) - Date.UTC(y, m - 1, d)) / 60000 + z.minutes;
    guess -= diff * 60000;
  }
  return new Date(guess);
}

const addDaysYmd = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
};
const todayYmd = (tz) => zoned(new Date(), tz).ymd;
const weekdayIdx = (ymd) => (new Date(ymd + 'T12:00:00Z').getUTCDay() + 6) % 7; // 0=Mon (matches weekly_rules)
const mondayOf = (ymd) => addDaysYmd(ymd, -weekdayIdx(ymd));
const fmtYmd = (ymd, opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(new Date(ymd + 'T12:00:00Z'));
const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const _timeCache = {};
function fmtTime(date, tz) {
  if (!_timeCache[tz]) _timeCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  return _timeCache[tz].format(date);
}
const hourLabel = (h) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);
const hhmmToMin = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Merged availability windows for one weekday from a host-rule set.
function workBands(rules, wd) {
  const work = [];
  for (const r of rules || []) {
    if (r.day_of_week !== wd) continue;
    const a = hhmmToMin(r.start);
    const b = hhmmToMin(r.end);
    if (a !== null && b !== null && b > a) work.push([a, b]);
  }
  work.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const [a, b] of work) {
    if (merged.length && a <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], b);
    } else merged.push([a, b]);
  }
  return merged;
}

// Complement of a host-rule set over [0, 1440) for one weekday → shaded "off" bands.
function offBandsFromRules(rules, wd) {
  const off = [];
  let cursor = 0;
  for (const [a, b] of workBands(rules, wd)) {
    if (a > cursor) off.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < 1440) off.push([cursor, 1440]);
  return off;
}

// ---------------------------------------------------------------- overlap layout
// Google-style column packing: overlapping segments in a column split it side-by-side.
function layoutDay(segments) {
  const evs = [...segments].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const clusters = [];
  let cluster = null;
  let clusterEnd = -1;
  for (const ev of evs) {
    if (!cluster || ev.startMin >= clusterEnd) {
      cluster = [];
      clusters.push(cluster);
      clusterEnd = ev.endMin;
    } else {
      clusterEnd = Math.max(clusterEnd, ev.endMin);
    }
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.endMin);
  }
  for (const cl of clusters) {
    const colEnds = [];
    for (const ev of cl) {
      let c = colEnds.findIndex((end) => end <= ev.startMin);
      if (c === -1) { c = colEnds.length; colEnds.push(0); }
      colEnds[c] = ev.endMin;
      ev.col = c;
    }
    for (const ev of cl) ev.cols = colEnds.length;
  }
  return evs;
}


function DatePicker({ value, onChange, className }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('justify-between font-normal', !value && 'text-muted-foreground', className)}>
          {value ? fmtYmd(value, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pick a date'}
          <ChevronDownIcon className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar mode="single" selected={value ? new Date(value + 'T12:00:00') : undefined}
          defaultMonth={value ? new Date(value + 'T12:00:00') : undefined}
          onSelect={(d) => d && onChange(toYMD(d))} />
      </PopoverContent>
    </Popover>
  );
}

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch { return {}; }
}

export default function TeamCalendar() {
  const navigate = useNavigate();
  const prefs = useRef(loadPrefs());
  const localTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const [view, setView] = useState(prefs.current.view === 'day' ? 'day' : 'week');
  const [showWeekends, setShowWeekends] = useState(prefs.current.weekends !== false);
  const [tzMode, setTzMode] = useState(prefs.current.tz === 'local' ? 'local' : 'clinic');
  const tz = tzMode === 'local' ? localTz : CLINIC_TZ;
  const [anchor, setAnchor] = useState(() => todayYmd(tzMode === 'local' ? localTz : CLINIC_TZ));
  // Host visibility: explicit map wins; unmapped hosts default to "directors on".
  const [hostSel, setHostSel] = useState(prefs.current.hosts || {});

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [sel, setSel] = useState(null); // selected event segment for the details popover
  const [, setTick] = useState(0);      // re-render for the now line + "updated Xs ago"
  const scrollRef = useRef(null);
  const didScroll = useRef(false);
  const popRef = useRef(null);
  const fetchedIdsRef = useRef(null); // host ids the current data was fetched for (null = backend default)

  const savePrefs = useCallback((patch) => {
    prefs.current = { ...prefs.current, ...patch };
    try { localStorage.setItem(LS_KEY, JSON.stringify(prefs.current)); } catch { /* ignore */ }
  }, []);

  // The fetch window is ALWAYS the anchor's full week — Day/Week toggling and moving within
  // the week are pure client-side re-renders (no refetch, no flash), and both views share
  // the same backend cache entry.
  const weekStart = mondayOf(anchor);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysYmd(weekStart, i)), [weekStart]);
  // Weekends are hidden client-side only — the fetch window stays the full week, so the
  // toggle (like Day ⇄ Week) never refetches.
  const displayDays = useMemo(() => (showWeekends ? weekDays : weekDays.slice(0, 5)), [weekDays, showWeekends]);
  const today = todayYmd(tz);

  const load = useCallback(async ({ silent = false, force = false, ids } = {}) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const params = {
        start: zonedMidnightUtc(weekStart, tz).toISOString(),
        end: zonedMidnightUtc(addDaysYmd(weekStart, 7), tz).toISOString(),
      };
      // Explicit ids win; otherwise re-fetch whatever the current data covers. First load
      // omits the param → backend default (active directors) — the selection-sync effect
      // reconciles any stored preference right after the roster arrives.
      const useIds = ids !== undefined ? ids : fetchedIdsRef.current;
      if (useIds) params.hosts = useIds;
      if (force) params.refresh = 1;
      const res = await adminApi.get('/admin/calendar/events', params);
      setData(res.data);
      fetchedIdsRef.current = useIds ?? (res.data.hosts || [])
        .filter((h) => h.active !== false && h.role === 'director')
        .map((h) => h.host_id).sort().join(',');
      setFetchedAt(Date.now());
      if (!silent) setSel(null);
    } catch (e) {
      if (!silent) toast.error(e?.response?.status === 403 ? 'Admin access required' : (e?.response?.data?.detail || 'Failed to load calendars'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [weekStart, tz]);

  useEffect(() => { load(); }, [load]);

  // Keep it fresh without being asked: background refetch + on window focus; tick for the now line.
  useEffect(() => {
    const iv = setInterval(() => load({ silent: true }), REFETCH_MS);
    const onFocus = () => load({ silent: true });
    const tick = setInterval(() => setTick((t) => t + 1), 30_000);
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(iv); clearInterval(tick); window.removeEventListener('focus', onFocus); };
  }, [load]);

  // Land the viewport on the working morning once; view toggles keep the scroll position.
  useEffect(() => {
    if (!didScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_PX + 2;
      didScroll.current = true;
    }
  });

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setSel(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hosts = data?.hosts || [];
  const hostById = useMemo(() => new Map(hosts.map((h) => [h.host_id, h])), [hosts]);
  const isVisible = useCallback((h) => (hostSel[h.host_id] ?? (h.role === 'director' && h.active !== false)), [hostSel]);
  const visibleHosts = useMemo(() => hosts.filter(isVisible), [hosts, isVisible]);
  const visibleIds = useMemo(() => new Set(visibleHosts.map((h) => h.host_id)), [visibleHosts]);
  const hostsKey = useMemo(() => [...visibleIds].sort().join(','), [visibleIds]);
  const toggleHost = (h) => {
    const next = { ...hostSel, [h.host_id]: !isVisible(h) };
    setHostSel(next);
    savePrefs({ hosts: next });
    setSel(null);
  };
  const resetHosts = () => { setHostSel({}); savePrefs({ hosts: {} }); setSel(null); };
  const clearHosts = () => {
    const m = {};
    for (const h of hosts) m[h.host_id] = false;
    setHostSel(m);
    savePrefs({ hosts: m });
    setSel(null);
  };

  // Selection changed → silently fetch just the selected calendars (grid stays put; the
  // debounce coalesces rapid checkbox flips in the picker).
  useEffect(() => {
    if (!data) return;
    if (hostsKey === fetchedIdsRef.current) return;
    if (!hostsKey) { fetchedIdsRef.current = ''; return; } // nothing selected — nothing to read
    const t = setTimeout(() => load({ silent: true, ids: hostsKey }), 350);
    return () => clearTimeout(t);
  }, [hostsKey, data, load]);

  // ---- shape events into per-ymd timed segments + the window's all-day items (display tz)
  const { rawByYmd, allDayRaw } = useMemo(() => {
    const byYmd = Object.fromEntries(weekDays.map((d) => [d, []]));
    const allDay = [];
    const lastDay = weekDays[6];
    for (const ev of data?.events || []) {
      if (!visibleIds.has(ev.host_id)) continue;
      if (ev.all_day) {
        allDay.push(ev);
        continue;
      }
      const s = new Date(ev.start_utc);
      const e = new Date(ev.end_utc);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) continue;
      const zs = zoned(s, tz);
      const ze = zoned(e, tz);
      const endYmd = ze.minutes === 0 ? addDaysYmd(ze.ymd, -1) : ze.ymd; // exclusive end at midnight belongs to the prior day
      const endMinLast = ze.minutes === 0 ? 1440 : ze.minutes;
      let cur = zs.ymd < weekDays[0] ? weekDays[0] : zs.ymd; // clamp the walk to the window
      let guard = 0;
      while (cur <= endYmd && cur <= lastDay && guard < 10) {
        if (byYmd[cur]) {
          const startMin = cur === zs.ymd ? zs.minutes : 0;
          const endMin = cur === endYmd ? endMinLast : 1440;
          if (endMin > startMin) {
            byYmd[cur].push({ ev, startMin, endMin, clipStart: cur !== zs.ymd, clipEnd: cur !== endYmd, start: s, end: e });
          }
        }
        cur = addDaysYmd(cur, 1);
        guard += 1;
      }
    }
    return { rawByYmd: byYmd, allDayRaw: allDay };
  }, [data, weekDays, tz, visibleIds]);

  // ---- columns: week → one per day (hosts merged); day → one per host (the inspo style)
  const shadingEnabled = visibleHosts.some((h) => (h.weekly_rules || []).length > 0);
  const { cols, allDayItems, allDayLaneCount } = useMemo(() => {
    let out;
    if (view === 'week') {
      out = displayDays.map((ymd, i) => {
        const wd = weekdayIdx(ymd);
        // Availability windows join the cascade as synthetic segments, so they lay out
        // exactly like the hand-made "Availability" calendar events the team is used to.
        const availSegs = visibleHosts.flatMap((h) =>
          ((h.weekly_rules || []).length ? workBands(h.weekly_rules, wd) : []).map(([a, b]) => ({
            ev: { id: `avail-${h.host_id}-${ymd}-${a}`, host_id: h.host_id, kind: 'availability' },
            startMin: a, endMin: b,
          })));
        return {
          key: ymd, colIdx: i, ymd, kind: 'day',
          segs: layoutDay([...availSegs, ...(rawByYmd[ymd] || [])]),
          offBands: shadingEnabled
            ? offBandsFromRules(visibleHosts.flatMap((h) => h.weekly_rules || []), wd)
            : [],
        };
      });
    } else {
      const daySegs = rawByYmd[anchor] || [];
      const wd = weekdayIdx(anchor);
      out = visibleHosts.map((h, i) => ({
        key: h.host_id, colIdx: i, ymd: anchor, kind: 'host', host: h,
        segs: layoutDay([
          ...((h.weekly_rules || []).length ? workBands(h.weekly_rules, wd) : []).map(([a, b]) => ({
            ev: { id: `avail-${h.host_id}-${anchor}-${a}`, host_id: h.host_id, kind: 'availability' },
            startMin: a, endMin: b,
          })),
          ...daySegs.filter((s) => s.ev.host_id === h.host_id),
        ]),
        offBands: (h.weekly_rules || []).length ? offBandsFromRules(h.weekly_rules, wd) : [],
      }));
    }
    for (const col of out) for (const s of col.segs) s.colIdx = col.colIdx;

    // All-day pills: week → spans across day columns, greedy lane packing;
    // day → one pill per covering event in its host's column, stacked.
    const items = [];
    if (view === 'week') {
      const sorted = [];
      for (const ev of allDayRaw) {
        const endEx = ev.end_utc;
        const first = displayDays.findIndex((d) => d >= ev.start_utc && d < endEx);
        if (first === -1) continue;
        let span = 0;
        while (first + span < displayDays.length && displayDays[first + span] < endEx) span += 1;
        sorted.push({ ev, colIdx: first, span, clipStart: ev.start_utc < displayDays[first], clipEnd: endEx > addDaysYmd(displayDays[first + span - 1], 1) });
      }
      sorted.sort((a, b) => a.colIdx - b.colIdx || b.span - a.span);
      const lanes = [];
      for (const item of sorted) {
        let lane = lanes.findIndex((endIdx) => endIdx <= item.colIdx);
        if (lane === -1) { lane = lanes.length; lanes.push(0); }
        item.lane = lane;
        lanes[lane] = item.colIdx + item.span;
        items.push(item);
      }
      return { cols: out, allDayItems: items, allDayLaneCount: lanes.length };
    }
    const perCol = {};
    for (const ev of allDayRaw) {
      if (!(ev.start_utc <= anchor && anchor < ev.end_utc)) continue;
      const hostCol = out.findIndex((c) => c.host?.host_id === ev.host_id);
      if (hostCol === -1) continue;
      const lane = (perCol[hostCol] = (perCol[hostCol] ?? -1) + 1);
      items.push({ ev, colIdx: hostCol, span: 1, lane, clipStart: ev.start_utc < anchor, clipEnd: ev.end_utc > addDaysYmd(anchor, 1) });
    }
    return { cols: out, allDayItems: items, allDayLaneCount: Math.max(0, ...items.map((i) => i.lane + 1)) };
  }, [view, displayDays, anchor, rawByYmd, allDayRaw, visibleHosts, shadingEnabled]);

  const now = zoned(new Date(), tz);

  const rangeLabel = useMemo(() => {
    if (view === 'day') return fmtYmd(anchor, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const d0 = displayDays[0];
    const dN = displayDays[displayDays.length - 1];
    const sameMonth = d0.slice(0, 7) === dN.slice(0, 7);
    const left = fmtYmd(d0, { month: 'short', day: 'numeric' });
    const right = sameMonth ? fmtYmd(dN, { day: 'numeric' }) : fmtYmd(dN, { month: 'short', day: 'numeric' });
    return `${left} – ${right}, ${fmtYmd(dN, { year: 'numeric' })}`;
  }, [view, anchor, displayDays]);

  // Recomputed every render — the 30s tick keeps it honest between refetches.
  const updatedAgo = (() => {
    if (!fetchedAt) return null;
    const s = Math.max(0, Math.round((Date.now() - fetchedAt) / 1000));
    return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
  })();

  const shift = (n) => { setAnchor(addDaysYmd(anchor, n)); setSel(null); };
  const nCols = Math.max(1, cols.length);
  const gridCols = { gridTemplateColumns: `${GUTTER_PX}px repeat(${nCols}, minmax(0, 1fr))` };
  const minWidth = view === 'week' ? 960 : Math.max(560, GUTTER_PX + nCols * 150);

  const openSeg = (e, seg) => { e.stopPropagation(); setSel({ kind: 'timed', seg }); };
  const openAllDay = (e, item) => { e.stopPropagation(); setSel({ kind: 'allday', seg: { ev: item.ev, colIdx: item.colIdx, startMin: 0 } }); };

  // Popover placement: to the right of the event's column, flipped left near the edge.
  const popStyle = useMemo(() => {
    if (!sel) return null;
    const ci = sel.seg.colIdx;
    const top = sel.kind === 'allday' ? 8 : Math.min(Math.max((sel.seg.startMin / 60) * HOUR_PX - 6, 6), 24 * HOUR_PX - 260);
    if (nCols === 1) return { left: GUTTER_PX + 20, top };
    return ci <= nCols - 3
      ? { left: `calc(${GUTTER_PX}px + (100% - ${GUTTER_PX}px) / ${nCols} * ${ci + 1} + 6px)`, top }
      : { left: `calc(${GUTTER_PX}px + (100% - ${GUTTER_PX}px) / ${nCols} * ${ci} - 290px)`, top };
  }, [sel, nCols]);

  const selHost = sel ? hostById.get(sel.seg.ev.host_id) : null;
  const selPal = selHost ? paletteFor(selHost.color) : null;

  const initialLoading = loading && !data;
  const erroredHosts = visibleHosts.filter((h) => h.error);

  return (
    <div className="space-y-3">
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        {/* Header + controls */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={EYEBROW}>Team Calendar</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every host&apos;s real calendar · <span className="font-medium text-foreground">{rangeLabel}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Users className="size-4" />
                  Hosts
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">{visibleHosts.length}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Filter hosts..." />
                  <CommandList>
                    <CommandEmpty>No hosts found.</CommandEmpty>
                    {ROLE_ORDER.map((role) => {
                      const group = hosts.filter((h) => h.role === role);
                      if (!group.length) return null;
                      return (
                        <CommandGroup key={role} heading={ROLE_LABEL[role]}>
                          {group.map((h) => {
                            const on = isVisible(h);
                            return (
                              <CommandItem key={h.host_id} value={`${h.name} ${h.host_id}`} onSelect={() => toggleHost(h)}>
                                <span className={cn(
                                  'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                                )}>
                                  {on && <Check className="size-3" />}
                                </span>
                                <span className="size-[7px] shrink-0 rounded-full" style={{ background: h.color }} />
                                <span className="truncate">{h.name}</span>
                                {h.error && on && <TriangleAlert className="size-3 shrink-0 text-amber-600" />}
                                {h.active === false && (
                                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Inactive</span>
                                )}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      );
                    })}
                  </CommandList>
                  <div className="flex items-center justify-between border-t p-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={resetHosts}>Active directors</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearHosts}>Clear</Button>
                  </div>
                </Command>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" onClick={() => { setAnchor(todayYmd(tz)); setSel(null); }}>Today</Button>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-9" onClick={() => shift(view === 'week' ? -7 : -1)} aria-label="Previous">
                <ChevronLeft className="size-4" />
              </Button>
              <DatePicker value={anchor} onChange={(v) => { setAnchor(v || todayYmd(tz)); setSel(null); }} className="w-[170px]" />
              <Button variant="outline" size="icon" className="size-9" onClick={() => shift(view === 'week' ? 7 : 1)} aria-label="Next">
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <ToggleGroup type="single" value={view} onValueChange={(v) => { if (v) { setView(v); savePrefs({ view: v }); setSel(null); } }} variant="outline" size="sm">
              <ToggleGroupItem value="day" className={TG_ON}>Day</ToggleGroupItem>
              <ToggleGroupItem value="week" className={TG_ON}>Week</ToggleGroupItem>
            </ToggleGroup>
            {localTz !== CLINIC_TZ && (
              <ToggleGroup type="single" value={tzMode} onValueChange={(v) => { if (v) { setTzMode(v); savePrefs({ tz: v }); setSel(null); } }} variant="outline" size="sm">
                <ToggleGroupItem value="clinic" className={TG_ON}>Clinic (PT)</ToggleGroupItem>
                <ToggleGroupItem value="local" className={TG_ON}>My time</ToggleGroupItem>
              </ToggleGroup>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-9" aria-label="Calendar display options">
                  <Settings2 className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                  checked={showWeekends}
                  onCheckedChange={(v) => { setShowWeekends(!!v); savePrefs({ weekends: !!v }); setSel(null); }}
                >
                  Show weekends
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => load({ force: true })} disabled={loading || refreshing}>
              <RefreshCw className={`size-4 ${loading || refreshing ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            {updatedAgo && <span className="text-xs text-muted-foreground">Updated {updatedAgo}</span>}
          </div>
        </div>

        {erroredHosts.length > 0 && (
          <p className="mb-1 mt-1 text-xs font-medium text-amber-700">
            <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" />
            Couldn&apos;t read {erroredHosts.map((h) => h.name).join(', ')} — showing everyone else.
          </p>
        )}

        {/* Grid (full-bleed inside the card) */}
        <div className="-mx-5 -mb-5 mt-4 overflow-hidden rounded-b-xl border-t">
          {initialLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : visibleHosts.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No hosts selected. Pick hosts from the Hosts menu above — active or inactive.</div>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth }}>
                {/* Column headers: days (week) or hosts (day) */}
                <div className="grid border-b" style={{ ...gridCols, backgroundImage: 'linear-gradient(to top, #F8F8F8, #F8F8F899, #00000000)' }}>
                  <div />
                  {cols.map((col) => (
                    <div key={col.key} className="truncate border-l border-border/50 px-1.5 py-2 text-center text-xs font-semibold">
                      {col.kind === 'day' ? (
                        <>
                          <span className={col.ymd === today ? 'text-foreground' : 'text-muted-foreground'}>{fmtYmd(col.ymd, { weekday: 'short' })}</span>{' '}
                          <span className={cn(
                            'ml-0.5 inline-flex h-[21px] min-w-[21px] items-center justify-center rounded-full px-1 tabular-nums',
                            col.ymd === today ? 'bg-primary text-primary-foreground' : 'text-foreground',
                          )}>
                            {Number(col.ymd.slice(8, 10))}
                          </span>
                        </>
                      ) : (
                        <span className="inline-flex max-w-full items-center gap-1.5 text-foreground">
                          <span className="size-[7px] shrink-0 rounded-full" style={{ background: col.host.color }} />
                          <span className="truncate">{col.host.name}</span>
                          {col.host.active === false && <span className="shrink-0 font-medium text-muted-foreground">· inactive</span>}
                          {col.host.error && <TriangleAlert className="size-3 shrink-0 text-amber-600" />}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* All-day lane */}
                {allDayLaneCount > 0 && (
                  <div className="grid border-b bg-card" style={gridCols}>
                    <div className="py-1.5 pr-2 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">all-day</div>
                    <div className="relative border-l border-border/50" style={{ gridColumn: `2 / span ${nCols}`, height: allDayLaneCount * 26 + 6 }}>
                      {allDayItems.map((item) => {
                        const h = hostById.get(item.ev.host_id);
                        const pal = paletteFor(h?.color);
                        const busy = item.ev.busy_only;
                        return (
                          <button
                            key={`${item.ev.host_id}-${item.ev.id}-${item.colIdx}`}
                            type="button"
                            onClick={(e) => openAllDay(e, item)}
                            className="absolute overflow-hidden truncate rounded-md px-2 py-0.5 text-left text-[11px] font-semibold hover:translate-y-0"
                            style={{
                              top: item.lane * 26 + 3,
                              left: `calc(100% / ${nCols} * ${item.colIdx} + 3px)`,
                              width: `calc(100% / ${nCols} * ${item.span} - 6px)`,
                              background: busy ? BUSY_BG : pal.card,
                              color: busy ? '#475569' : pal.text,
                            }}
                          >
                            {item.clipStart && '‹ '}{busy ? 'Busy' : item.ev.title}{item.clipEnd && ' ›'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Time grid */}
                <div ref={scrollRef} className="max-h-[max(640px,calc(100dvh-360px))] overflow-y-auto">
                  <div className="relative grid" style={gridCols} onClick={() => setSel(null)}>
                    {/* Hour gutter */}
                    <div className="relative" style={{ height: 24 * HOUR_PX }}>
                      {Array.from({ length: 23 }, (_, i) => (
                        <span key={i} className="absolute right-2 -translate-y-1/2 text-[10px] font-medium tabular-nums text-muted-foreground/80" style={{ top: (i + 1) * HOUR_PX }}>
                          {hourLabel(i + 1)}
                        </span>
                      ))}
                    </div>

                    {cols.map((col) => (
                      <div key={col.key} className="relative border-l border-border/50" style={{ height: 24 * HOUR_PX, ...COL_BG }}>
                        {/* Off-hours shading */}
                        {col.offBands.map(([a, b]) => (
                          <div key={`${a}-${b}`} className="pointer-events-none absolute inset-x-0" style={{ top: (a / 60) * HOUR_PX, height: ((b - a) / 60) * HOUR_PX, background: 'rgba(0,0,0,0.026)' }} />
                        ))}

                        {/* Events — borderless soft cards; solid host color marks our bookings */}
                        {col.segs.map((seg, i) => {
                          const h = hostById.get(seg.ev.host_id);
                          const pal = paletteFor(h?.color);
                          const isBooking = seg.ev.kind === 'booking';
                          const busy = seg.ev.busy_only;
                          const top = (seg.startMin / 60) * HOUR_PX;
                          const height = Math.max(20, ((seg.endMin - seg.startMin) / 60) * HOUR_PX - 2);
                          const selected = sel?.seg === seg;
                          // Both views share the cluster/column packing. Week view renders it the
                          // way Google Calendar does (measured from their live DOM): step = 100/n,
                          // each card 1.7 steps wide so it tucks under only its right neighbor
                          // (never the whole stack), z rises left→right, and selection is a pure
                          // z-lift — a fronted card can never blanket the cards to its right.
                          // Day view (per-host columns) keeps the exact side-by-side split.
                          const step = 100 / seg.cols;
                          const gcalOverlap = col.kind === 'day';
                          const width = gcalOverlap ? Math.min(step * 1.7, 100 - seg.col * step) : step;
                          const leftPct = seg.col * step;
                          // Availability pseudo-events: same cascade geometry as real events,
                          // solid tint + dashed border, never clickable (clicks fall through).
                          if (seg.ev.kind === 'availability') {
                            return (
                              <div
                                key={`${seg.ev.id}-${i}`}
                                className="pointer-events-none absolute overflow-hidden rounded-lg px-2 py-[3px] leading-[1.3]"
                                style={{
                                  top, height, zIndex: 1 + seg.col,
                                  left: `calc(${leftPct}% + 3px)`, width: `calc(${width}% - 6px)`,
                                  background: pal.tint, color: pal.text,
                                  border: `1.5px dashed ${(h?.color || '#525252')}66`,
                                  boxShadow: '0 0 0 1px #fff',
                                }}
                              >
                                <span className="block truncate text-[11px] font-semibold">{h?.name}</span>
                                {height >= 38 && <span className="block truncate text-[10px] font-medium opacity-75">Availability</span>}
                              </div>
                            );
                          }
                          const style = {
                            top, height,
                            left: `calc(${leftPct}% + 3px)`,
                            width: `calc(${width}% - 6px)`,
                            zIndex: selected ? 15 : 1 + seg.col,
                            ...(isBooking
                              ? { background: h?.color || '#525252', color: '#fff' }
                              : busy
                                ? { background: BUSY_BG, color: '#475569' }
                                : { background: pal.card, color: pal.text }),
                            ...(selected
                              // Ring drawn INSET so it never bleeds onto back-to-back events above/below.
                              ? { boxShadow: 'inset 0 0 0 1px #fff, inset 0 0 0 2px hsl(0 0% 9%), 0 0 0 1px #fff' }
                              : { boxShadow: '0 0 0 1px #fff' }), // hairline so stacked cards read as separate
                          };
                          const label = busy ? 'Busy' : seg.ev.title || '(no title)';
                          return (
                            <button
                              key={`${seg.ev.id}-${i}`}
                              type="button"
                              onClick={(e) => openSeg(e, seg)}
                              className="absolute overflow-hidden rounded-lg px-2 py-[3px] text-left leading-[1.3] hover:translate-y-0"
                              style={style}
                            >
                              <span className="block truncate text-[11px] font-semibold">
                                {seg.clipStart && '‹ '}{label}{seg.clipEnd && ' ›'}
                              </span>
                              {height >= 38 && (
                                <span className={cn('block truncate text-[10px] font-medium tabular-nums', isBooking ? 'text-white/85' : 'opacity-75')}>
                                  {fmtTime(seg.start, tz)} – {fmtTime(seg.end, tz)}
                                </span>
                              )}
                            </button>
                          );
                        })}

                        {/* Now line */}
                        {col.ymd === today && (
                          <div className="pointer-events-none absolute inset-x-0 z-[12]" style={{ top: (now.minutes / 60) * HOUR_PX }}>
                            <div className="relative h-[2px] bg-[#e11d48]">
                              <span className="absolute -left-[3px] -top-[3px] size-2 rounded-full bg-[#e11d48]" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Details popover */}
                    {sel && popStyle && selHost && (
                      <div
                        ref={popRef}
                        className="absolute z-20 w-[284px] rounded-[10px] border bg-card p-3.5"
                        style={{ ...popStyle, boxShadow: '0 12px 32px rgba(15,23,42,0.16)' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-[5px] px-2 py-0.5 text-[10.5px] font-semibold"
                            style={sel.seg.ev.busy_only
                              ? { background: '#f1f5f9', color: '#475569' }
                              : { background: selPal.tint, color: selPal.text }}
                          >
                            <span className="size-1.5 rounded-full" style={{ background: sel.seg.ev.busy_only ? '#94a3b8' : selHost.color }} />
                            {sel.seg.ev.kind === 'booking' ? 'Booking' : sel.seg.ev.busy_only ? 'Private' : 'Google Calendar'}
                          </span>
                          {sel.seg.ev.kind === 'booking' && sel.seg.ev.booking?.source && (
                            <span className="text-[10.5px] font-medium text-muted-foreground">via {sel.seg.ev.booking.source}</span>
                          )}
                          <button type="button" className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={() => setSel(null)} aria-label="Close">
                            <X className="size-3.5" />
                          </button>
                        </div>
                        <p className="text-[13px] font-semibold leading-snug text-foreground">
                          {sel.seg.ev.busy_only ? 'Busy' : sel.seg.ev.title || '(no title)'}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                          {sel.kind === 'allday'
                            ? `${fmtYmd(sel.seg.ev.start_utc, { weekday: 'short', month: 'short', day: 'numeric' })} · all-day`
                            : `${fmtYmd(zoned(sel.seg.start, tz).ymd, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(sel.seg.start, tz)} – ${fmtTime(sel.seg.end, tz)}`}
                        </p>
                        <div className="my-2.5 h-px bg-border/70" />
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Host</span>
                            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                              <span className="size-[7px] rounded-full" style={{ background: selHost.color }} />
                              {selHost.name}
                            </span>
                          </div>
                          {sel.seg.ev.kind === 'booking' && (
                            <>
                              {sel.seg.ev.booking?.patient_name && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-muted-foreground">Patient</span>
                                  <span className="truncate font-medium text-foreground">{sel.seg.ev.booking.patient_name}</span>
                                </div>
                              )}
                              {sel.seg.ev.booking?.session_title && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-muted-foreground">Session</span>
                                  <span className="truncate font-medium text-foreground">{sel.seg.ev.booking.session_title}</span>
                                </div>
                              )}
                            </>
                          )}
                          {sel.seg.ev.kind === 'gcal' && sel.seg.ev.location && sel.seg.ev.location !== sel.seg.ev.meet_link && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground"><MapPin className="mr-0.5 inline size-3 align-[-2px]" />Location</span>
                              <span className="truncate font-medium text-foreground" title={sel.seg.ev.location}>{sel.seg.ev.location}</span>
                            </div>
                          )}
                        </div>
                        {sel.seg.ev.kind === 'booking' ? (
                          <div className="mt-3 flex gap-2">
                            {sel.seg.ev.booking?.meet_link && (
                              <Button size="sm" className="h-8 flex-1" asChild>
                                <a href={sel.seg.ev.booking.meet_link} target="_blank" rel="noreferrer"><Video className="size-3.5" /> Join Meet</a>
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => navigate('/admin/scheduling/bookings')}>
                              View booking
                            </Button>
                          </div>
                        ) : (!sel.seg.ev.busy_only && (sel.seg.ev.meet_link || sel.seg.ev.html_link) && (
                          <div className="mt-3 flex gap-2">
                            {sel.seg.ev.meet_link && (
                              <Button size="sm" className="h-8 flex-1" asChild>
                                <a href={sel.seg.ev.meet_link} target="_blank" rel="noreferrer"><Video className="size-3.5" /> Join</a>
                              </Button>
                            )}
                            {sel.seg.ev.html_link && (
                              <Button size="sm" variant="outline" className="h-8 flex-1" asChild>
                                <a href={sel.seg.ev.html_link} target="_blank" rel="noreferrer">Google Cal <ExternalLink className="size-3" /></a>
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
