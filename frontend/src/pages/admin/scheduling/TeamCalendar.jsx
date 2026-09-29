import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, ExternalLink, LockKeyhole, MapPin, RefreshCw,
  SlidersHorizontal, TriangleAlert, Users, Video,
} from 'lucide-react';
import { adminApi } from '../api';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminDisplayTz } from '../format';
import { tzAbbrev } from '../usTimezones';
import sc from './scheduling.module.css';
import c from './calendar.module.css';

const HOUR_PX = 70;    // the prototype's hour row
const GUTTER_PX = 58;
const LS_KEY = 'teamcal.prefs.v1';
const REFETCH_MS = 120_000;

// Host palette companions for the backend HOST_COLOR_PALETTE (600-level hexes):
// tint (50) for availability / all-day, card (100) for booked sessions, text (700) for type on tints.
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
const SOURCE_LABEL = { patient: 'patient portal', manual: 'manual booking', checkout: 'checkout' };
const LONG_DATE = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
const SHORT_DATE = { weekday: 'short', month: 'short', day: 'numeric' };

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

/** "Pacific Time" — the zone's generic name for the header line (falls back to the IANA id). */
function tzName(tz) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longGeneric' })
      .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || tz;
  } catch {
    return tz;
  }
}
const plural = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`;
// Sessions read in minutes ("90 minutes", as the prototype); only long whole-hour blocks switch to hours.
const durationLabel = (min, unit = 'minutes') => (min <= 120 || min % 60 ? `${min} ${unit}` : `${min / 60} hours`);

/** Header title in the prototype's long style: "September 21 – 27, 2026" / "September 28 – Oct 4, 2026". */
function rangeTitle(days) {
  const first = days[0];
  const last = days[days.length - 1];
  if (days.length === 1) return fmtYmd(first, LONG_DATE);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const left = fmtYmd(first, sameYear ? { month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric', year: 'numeric' });
  const right = fmtYmd(last, first.slice(0, 7) === last.slice(0, 7) ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
  return `${left} – ${right}, ${last.slice(0, 4)}`;
}

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
    // Availability lanes pack first and own the leftmost columns exclusively — real
    // bookings start to their right and never reuse an availability column, so an
    // availability block can never end up sandwiched between bookings.
    const avails = cl.filter((s) => s.ev?.kind === 'availability');
    const rest = cl.filter((s) => s.ev?.kind !== 'availability');
    const availEnds = [];
    for (const ev of avails) {
      let c = availEnds.findIndex((end) => end <= ev.startMin);
      if (c === -1) { c = availEnds.length; availEnds.push(0); }
      availEnds[c] = ev.endMin;
      ev.col = c;
    }
    const base = availEnds.length;
    const colEnds = [];
    for (const ev of rest) {
      let c = colEnds.findIndex((end) => end <= ev.startMin);
      if (c === -1) { c = colEnds.length; colEnds.push(0); }
      colEnds[c] = ev.endMin;
      ev.col = base + c;
    }
    const total = base + colEnds.length;
    for (const ev of cl) {
      ev.cols = total;
      // GCal's expansion step: grow rightward across columns with no overlapping event,
      // so a card whose time row is otherwise empty isn't stuck at its cluster's lane
      // width (the cluster's column count comes from its busiest hour, not this row).
      let span = 1;
      while (ev.col + span < total && !cl.some((o) =>
        o !== ev && o.col === ev.col + span && o.startMin < ev.endMin && o.endMin > ev.startMin)) span++;
      ev.span = span;
    }
  }
  return evs;
}

// Card text: the patient leads a booked session (its session title underneath); other events lead with their title.
function eventLabels(ev) {
  if (ev.busy_only) return { primary: 'Busy', detail: null };
  if (ev.kind === 'booking') {
    const b = ev.booking || {};
    return b.patient_name
      ? { primary: b.patient_name, detail: b.session_title || ev.title }
      : { primary: ev.title || 'Booked session', detail: null };
  }
  return { primary: ev.title || '(no title)', detail: ev.location && ev.location !== ev.meet_link ? ev.location : null };
}

// Booked sessions are tinted cards, other Google events white ones — both keep the host's colour on the left edge.
function eventTone(ev, host) {
  const color = host?.color || '#525252';
  const pal = paletteFor(host?.color);
  const edge = `${color}38 ${color}38 ${color}38 ${color}`;
  if (ev.busy_only) return { background: BUSY_BG, borderColor: edge, color: '#444' };
  if (ev.kind === 'booking') return { background: pal.card, borderColor: edge, color: pal.text };
  return { background: '#fff', borderColor: edge, color: pal.text };
}

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch { return {}; }
}

export default function TeamCalendar() {
  const navigate = useNavigate();
  const prefs = useRef(loadPrefs());
  const localTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  // The admin-wide display zone (profile-set, Pacific default). AdminLayout re-keys this
  // page when it changes, so reading it once per mount is safe.
  const displayTz = useMemo(() => getAdminDisplayTz(), []);

  const [view, setView] = useState(prefs.current.view === 'day' ? 'day' : 'week');
  const [showWeekends, setShowWeekends] = useState(prefs.current.weekends !== false);
  const [tzMode, setTzMode] = useState(prefs.current.tz === 'local' ? 'local' : 'clinic');
  const tz = tzMode === 'local' ? localTz : displayTz;
  const [anchor, setAnchor] = useState(() => todayYmd(tzMode === 'local' ? localTz : displayTz));
  // Host visibility: explicit map wins; unmapped hosts default to "directors on".
  const [hostSel, setHostSel] = useState(prefs.current.hosts || {});

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [sel, setSel] = useState(null); // the calendar entry open in the details sheet
  const [, setTick] = useState(0);      // re-render for the now line + "updated Xs ago"
  const scrollRef = useRef(null);
  const didScroll = useRef(false);
  const lastSel = useRef(null);
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
  const shownDays = useMemo(() => (view === 'week' ? displayDays : [anchor]), [view, displayDays, anchor]);
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

  // Land the viewport on the working morning once (just under the sticky headings); view toggles keep the scroll position.
  useEffect(() => {
    if (!didScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_PX;
      didScroll.current = true;
    }
  });

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

  // Phones get the prototype's agenda: each shown day's all-day items, then its sessions in time order.
  const agendaDays = useMemo(() => shownDays.map((ymd) => ({
    ymd,
    items: [
      ...allDayRaw.filter((ev) => ev.start_utc <= ymd && ymd < ev.end_utc)
        .map((ev) => ({ key: `ad-${ev.host_id}-${ev.id}`, ev, sel: { kind: 'allday', seg: { ev } } })),
      ...[...(rawByYmd[ymd] || [])].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
        .map((seg) => ({ key: `t-${seg.ev.host_id}-${seg.ev.id}`, ev: seg.ev, seg, sel: { kind: 'timed', seg } })),
    ],
  })), [shownDays, allDayRaw, rawByYmd]);

  // Header line: what's in view (each event once, even across days), split into our sessions and other calendar events.
  const inView = useMemo(() => {
    const seen = new Set();
    let sessions = 0;
    let other = 0;
    const add = (ev) => {
      const k = `${ev.host_id}|${ev.id}`;
      if (seen.has(k)) return;
      seen.add(k);
      if (ev.kind === 'booking') sessions += 1; else other += 1;
    };
    for (const d of shownDays) for (const seg of rawByYmd[d] || []) add(seg.ev);
    for (const ev of allDayRaw) if (shownDays.some((d) => ev.start_utc <= d && d < ev.end_utc)) add(ev);
    const parts = [];
    if (sessions) parts.push(plural(sessions, 'session'));
    if (other) parts.push(plural(other, 'calendar event'));
    return parts.length ? parts.join(' & ') : 'Nothing scheduled';
  }, [shownDays, rawByYmd, allDayRaw]);

  const now = zoned(new Date(), tz);

  // Recomputed every render — the 30s tick keeps it honest between refetches.
  const updatedAgo = (() => {
    if (!fetchedAt) return null;
    const s = Math.max(0, Math.round((Date.now() - fetchedAt) / 1000));
    return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
  })();

  const shift = (n) => { setAnchor(addDaysYmd(anchor, n)); setSel(null); };
  const changeView = (v) => { if (v !== view) { setView(v); savePrefs({ view: v }); setSel(null); } };
  const openDay = (ymd) => { setAnchor(ymd); setView('day'); savePrefs({ view: 'day' }); setSel(null); }; // day heading → that day
  const changeTz = (mode) => { setTzMode(mode); savePrefs({ tz: mode }); setSel(null); };
  const nCols = Math.max(1, cols.length);
  const gridStyle = {
    gridTemplateColumns: `${GUTTER_PX}px repeat(${nCols}, minmax(0, 1fr))`,
    minWidth: view === 'week' ? 830 : Math.max(560, GUTTER_PX + nCols * 150),
  };

  // The sheet keeps showing the last entry while it animates closed.
  if (sel) lastSel.current = sel;
  const shown = sel || lastSel.current;
  const detail = useMemo(() => {
    if (!shown) return null;
    const ev = shown.seg.ev;
    let date;
    let time;
    let timeNote = null;
    if (shown.kind === 'allday') {
      const last = addDaysYmd(ev.end_utc, -1);
      const days = Math.max(1, Math.round((Date.parse(ev.end_utc) - Date.parse(ev.start_utc)) / 86_400_000));
      date = last > ev.start_utc ? `${fmtYmd(ev.start_utc, SHORT_DATE)} – ${fmtYmd(last, SHORT_DATE)}` : fmtYmd(ev.start_utc, LONG_DATE);
      time = 'All day';
      if (days > 1) timeNote = `${days} days`;
    } else {
      const { start, end } = shown.seg;
      const first = zoned(start, tz).ymd;
      const lastDay = zoned(new Date(end.getTime() - 1), tz).ymd;
      date = first === lastDay ? fmtYmd(first, LONG_DATE) : `${fmtYmd(first, SHORT_DATE)} – ${fmtYmd(lastDay, SHORT_DATE)}`;
      time = `${fmtTime(start, tz)} – ${fmtTime(end, tz)}`;
      timeNote = `${durationLabel(Math.round((end - start) / 60000))} · ${tzAbbrev(start, tz)}`;
    }
    const b = ev.booking || {};
    const isBooking = ev.kind === 'booking';
    return {
      ev, b, isBooking, busy: !!ev.busy_only, host: hostById.get(ev.host_id), date, time, timeNote,
      title: ev.busy_only ? 'Busy' : isBooking ? (b.session_title || ev.title || 'Booked session') : (ev.title || '(no title)'),
    };
  }, [shown, tz, hostById]);

  const initialLoading = loading && !data;
  const erroredHosts = visibleHosts.filter((h) => h.error);
  const spinning = loading || refreshing;
  const link = detail && (detail.isBooking ? detail.b.meet_link : detail.ev.meet_link);
  const place = detail && !detail.isBooking && detail.ev.location && detail.ev.location !== detail.ev.meet_link ? detail.ev.location : null;

  return (
    <section className={sc.card} aria-labelledby="team-calendar-title">
      {/* Header: what's in view + Day/Week, Today and the date stepper */}
      <div className={`${sc.cardHeader} ${c.calendarHeader}`}>
        <div>
          <span className={sc.kicker}>Team calendar</span>
          <h2 id="team-calendar-title" className={sc.sectionTitle}>{rangeTitle(shownDays)}</h2>
          <p className={sc.description}>{initialLoading ? 'Loading calendars…' : inView} · {tzName(tz)}</p>
        </div>
        <div className={c.controls}>
          <div className={sc.segmented} role="group" aria-label="Calendar view">
            <button type="button" aria-pressed={view === 'day'} onClick={() => changeView('day')}>Day</button>
            <button type="button" aria-pressed={view === 'week'} onClick={() => changeView('week')}>Week</button>
          </div>
          <button type="button" className={sc.secondary} onClick={() => { setAnchor(todayYmd(tz)); setSel(null); }}>Today</button>
          <div className={c.dateControl}>
            <button type="button" className={sc.iconButton} aria-label={`Previous ${view}`} onClick={() => shift(view === 'week' ? -7 : -1)}><ChevronLeft size={16} /></button>
            <input aria-label="Calendar date" type="date" value={anchor} onChange={(e) => { if (e.target.value) { setAnchor(e.target.value); setSel(null); } }} />
            <button type="button" className={sc.iconButton} aria-label={`Next ${view}`} onClick={() => shift(view === 'week' ? 7 : 1)}><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {/* Hosts picker · legend · display options · refresh */}
      <div className={c.filterBar}>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={sc.secondary}><Users size={15} />Hosts <span className={c.count}>{visibleHosts.length}</span></button>
          </PopoverTrigger>
          <PopoverContent align="start" className={c.hostsPopover}>
            <Command>
              <strong className={c.hostsTitle}>Show on calendar</strong>
              <CommandInput placeholder="Filter hosts…" />
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
                            <span className={c.hostCheck} data-on={on}>{on && <Check />}</span>
                            <i className={c.hostDot} style={{ background: h.color }} />
                            <span className={c.hostName}>{h.name}</span>
                            {h.error && on && <TriangleAlert className={c.hostError} />}
                            {h.active === false && <span className={c.hostTag}>Inactive</span>}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  );
                })}
              </CommandList>
              <div className={c.hostsFoot}>
                <button type="button" className={sc.secondary} onClick={resetHosts}>Active directors</button>
                <button type="button" className={sc.secondary} onClick={clearHosts}>Clear</button>
              </div>
            </Command>
          </PopoverContent>
        </Popover>
        <div className={c.legend}>
          {visibleHosts.slice(0, 4).map((h) => <span key={h.host_id}><i style={{ background: h.color }} />{h.name}</span>)}
          {visibleHosts.length > 4 && <span>+{visibleHosts.length - 4} more</span>}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={sc.iconButton} aria-label="Calendar display options"><SlidersHorizontal size={16} /></button>
          </PopoverTrigger>
          <PopoverContent align="end" className={c.popover}>
            <strong>Display options</strong>
            <label>
              <input type="checkbox" checked={showWeekends} onChange={(e) => { setShowWeekends(e.target.checked); savePrefs({ weekends: e.target.checked }); setSel(null); }} />
              Show weekends
            </label>
            {localTz !== displayTz && (
              <div className={c.tzChoice} role="radiogroup" aria-label="Show times in">
                <span>Show times in</span>
                <label><input type="radio" name="teamcal-tz" checked={tzMode === 'clinic'} onChange={() => changeTz('clinic')} />Workspace time · {tzAbbrev(new Date(), displayTz) || 'Clinic'}</label>
                <label><input type="radio" name="teamcal-tz" checked={tzMode === 'local'} onChange={() => changeTz('local')} />My time · {tzAbbrev(new Date(), localTz)}</label>
              </div>
            )}
            <p>{tzMode === 'local' ? `Times follow this device's timezone (${tzName(localTz)}).` : 'Times follow the workspace timezone in the top bar.'}</p>
          </PopoverContent>
        </Popover>
        <button type="button" className={sc.iconButton} aria-label="Refresh calendar" onClick={() => load({ force: true })} disabled={spinning}>
          <RefreshCw size={16} className={spinning ? 'animate-spin' : undefined} />
        </button>
      </div>

      {erroredHosts.length > 0 && (
        <p role="status" className={c.hostWarning} title={erroredHosts.map((h) => `${h.name}: ${h.error}`).join('\n')}>
          <TriangleAlert size={14} />
          <span>Couldn&apos;t read {erroredHosts.map((h) => h.name).join(', ')} — showing everyone else.</span>
        </p>
      )}

      {initialLoading ? (
        <div className={c.loadingState}>
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full rounded-[3px]" />)}
        </div>
      ) : visibleHosts.length === 0 ? (
        <div className={sc.empty}>No hosts selected. Pick hosts from the Hosts menu above — active or inactive.</div>
      ) : (
        <>
          {/* Desktop grid: one scroller, sticky headings (+ all-day lane) above every event layer */}
          <div ref={scrollRef} className={c.desktopCalendar}>
            <div className={c.calendarGrid} style={gridStyle}>
              <div className={c.corner}>{tzAbbrev(new Date(), tz)}</div>
              {cols.map((col) => (col.kind === 'day' ? (
                <button key={col.key} type="button" className={c.dayHeading} data-today={col.ymd === today}
                  aria-label={`Show ${fmtYmd(col.ymd, { weekday: 'long', month: 'long', day: 'numeric' })} in day view`}
                  onClick={() => openDay(col.ymd)}>
                  <span>{fmtYmd(col.ymd, { weekday: 'short' })}</span>
                  <strong>{Number(col.ymd.slice(8, 10))}</strong>
                </button>
              ) : (
                <div key={col.key} className={`${c.dayHeading} ${c.hostHeading}`}>
                  <span>
                    <i style={{ background: col.host.color }} />
                    <b>{col.host.name}</b>
                    {col.host.active === false && <em>Inactive</em>}
                    {col.host.error && <TriangleAlert size={12} />}
                  </span>
                </div>
              )))}

              {allDayLaneCount > 0 && (
                <>
                  <div className={c.allDayLabel}>All day</div>
                  <div className={c.allDayCell} style={{ gridColumn: `2 / span ${nCols}`, height: allDayLaneCount * 26 + 6 }}>
                    {allDayItems.map((item) => {
                      const h = hostById.get(item.ev.host_id);
                      return (
                        <button
                          key={`${item.ev.host_id}-${item.ev.id}-${item.colIdx}`}
                          type="button"
                          className={c.allDayEvent}
                          data-selected={(sel?.kind === 'allday' && sel.seg.ev === item.ev) || undefined}
                          onClick={() => setSel({ kind: 'allday', seg: { ev: item.ev } })}
                          style={{
                            ...eventTone(item.ev, h),
                            top: item.lane * 26 + 3,
                            left: `calc(100% / ${nCols} * ${item.colIdx} + 3px)`,
                            width: `calc(100% / ${nCols} * ${item.span} - 6px)`,
                          }}
                        >
                          {item.clipStart && '‹ '}{eventLabels(item.ev).primary}{item.clipEnd && ' ›'}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <div className={c.hourColumn}>
                {Array.from({ length: 24 }, (_, h) => <span key={h}>{hourLabel(h)}</span>)}
              </div>

              {cols.map((col) => (
                <div key={col.key} className={c.dayColumn} style={{ height: 24 * HOUR_PX }}>
                  {Array.from({ length: 24 }, (_, h) => <div key={h} className={c.hourRule} />)}

                  {/* Off-hours shading */}
                  {col.offBands.map(([a, b]) => (
                    <div key={`${a}-${b}`} className={c.offBand} style={{ top: (a / 60) * HOUR_PX, height: ((b - a) / 60) * HOUR_PX }} />
                  ))}

                  {col.segs.map((seg, i) => {
                    const h = hostById.get(seg.ev.host_id);
                    const mins = seg.endMin - seg.startMin;
                    const height = Math.max(18, (mins / 60) * HOUR_PX - 3);
                    // Both views share the cluster/column packing. Week view renders it the
                    // way Google Calendar does (measured from their live DOM): step = 100/n,
                    // each card 1.7 steps wide so it tucks under only its right neighbor
                    // (never the whole stack), z rises left→right, and selection is a pure
                    // z-lift — a fronted card can never blanket the cards to its right.
                    // Day view (per-host columns) keeps the exact side-by-side split.
                    const step = 100 / seg.cols;
                    const gcalOverlap = col.kind === 'day';
                    const span = seg.span || 1;
                    // span-1 whole free columns, plus the GCal 1.7 overhang into the next
                    // occupied one (capped at the column edge — a row with nothing to the
                    // right stretches to the edge).
                    const width = gcalOverlap
                      ? Math.min((span - 1 + 1.7) * step, 100 - seg.col * step)
                      : step * span;
                    const box = {
                      top: (seg.startMin / 60) * HOUR_PX + 1, height,
                      left: `calc(${seg.col * step}% + 3px)`, width: `calc(${width}% - 6px)`,
                    };
                    // Availability pseudo-events: same cascade geometry as real events,
                    // tint + dashed border, never clickable (clicks fall through).
                    if (seg.ev.kind === 'availability') {
                      const pal = paletteFor(h?.color);
                      return (
                        <div
                          key={`${seg.ev.id}-${i}`}
                          className={c.availability}
                          style={{ ...box, zIndex: 1 + seg.col, background: pal.tint, color: pal.text, borderColor: `${h?.color || '#525252'}66` }}
                        >
                          <strong>{h?.name}</strong>
                          {height >= 38 && <span>Availability</span>}
                        </div>
                      );
                    }
                    const selected = sel?.seg === seg;
                    const { primary, detail: sub } = eventLabels(seg.ev);
                    const when = col.kind === 'day'
                      ? `${fmtTime(seg.start, tz)} · ${h?.name || ''}`
                      : `${fmtTime(seg.start, tz)} – ${fmtTime(seg.end, tz)}`;
                    return (
                      <button
                        key={`${seg.ev.id}-${i}`}
                        type="button"
                        className={c.event}
                        data-compact={mins <= 30}
                        data-selected={selected || undefined}
                        aria-label={`${primary}, ${h?.name || ''}, ${fmtTime(seg.start, tz)} – ${fmtTime(seg.end, tz)}`}
                        onClick={() => setSel({ kind: 'timed', seg })}
                        style={{ ...box, ...eventTone(seg.ev, h), zIndex: selected ? 15 : 1 + seg.col }}
                      >
                        <strong>{seg.clipStart && '‹ '}{primary}{seg.clipEnd && ' ›'}</strong>
                        {height >= 26 && <span>{when}</span>}
                        {mins >= 60 && sub && <small>{sub}</small>}
                      </button>
                    );
                  })}

                  {/* Now line */}
                  {col.ymd === today && <div className={c.nowLine} style={{ top: (now.minutes / 60) * HOUR_PX }} />}
                </div>
              ))}
            </div>
          </div>

          {/* Phones: the day-by-day agenda */}
          <div className={c.agenda}>
            {agendaDays.map(({ ymd, items }) => (
              <section key={ymd} className={c.agendaDay}>
                <h3>{fmtYmd(ymd, { weekday: 'long', month: 'short', day: 'numeric' })}<span>{items.length}</span></h3>
                {items.length ? items.map((it) => {
                  const h = hostById.get(it.ev.host_id);
                  const { primary, detail: sub } = eventLabels(it.ev);
                  return (
                    <button key={it.key} type="button" className={c.agendaEvent} onClick={() => setSel(it.sel)}>
                      {it.seg ? (
                        <time dateTime={it.seg.start.toISOString()}>
                          {it.seg.clipStart ? 'Cont.' : fmtTime(it.seg.start, tz)}
                          <small>{it.seg.clipStart ? `to ${fmtTime(it.seg.end, tz)}` : durationLabel(Math.round((it.seg.end - it.seg.start) / 60000), 'min')}</small>
                        </time>
                      ) : <time>All day</time>}
                      <div>
                        <span className={c.agendaHost} style={{ color: paletteFor(h?.color).text }}>{h?.name}</span>
                        <strong>{primary}</strong>
                        {sub && <p>{sub}</p>}
                      </div>
                      <ChevronRight size={16} />
                    </button>
                  );
                }) : <p className={c.noEvents}>No sessions scheduled.</p>}
              </section>
            ))}
          </div>
        </>
      )}

      <div className={c.calendarFoot}>
        <span><CalendarDays size={14} /> Select a session to view its details.</span>
        {updatedAgo && <span>Updated {updatedAgo}</span>}
      </div>

      {/* Details */}
      <Sheet open={!!sel} onOpenChange={(open) => { if (!open) setSel(null); }}>
        <SheetContent className={`${sc.sheet} ${c.eventSheet}`}>
          <SheetHeader className={c.sheetHeader}>
            <SheetTitle className={c.sheetTitle}>{detail?.isBooking ? 'Session details' : detail?.busy ? 'Private event' : 'Calendar event'}</SheetTitle>
            <SheetDescription className={c.sheetDescription}>
              {detail?.busy ? 'Marked private by its owner, so only the time is shared.' : 'All the details for this calendar entry.'}
            </SheetDescription>
          </SheetHeader>
          {detail && (
            <>
              <div className={c.badgeRow}>
                {detail.isBooking
                  ? <span className={sc.badge} data-tone="green"><Check size={12} />Booking</span>
                  : detail.busy
                    ? <span className={sc.badge} data-tone="muted"><LockKeyhole size={12} />Private</span>
                    : <span className={sc.badge}><CalendarDays size={12} />Google Calendar</span>}
                {detail.isBooking && detail.b.source && <small>via {SOURCE_LABEL[detail.b.source] || detail.b.source}</small>}
              </div>
              <h3 className={c.detailTitle}>{detail.title}</h3>
              {detail.isBooking && detail.b.patient_name && <div className={c.detailPerson}>{detail.b.patient_name}</div>}
              <dl className={c.details}>
                <div><dt><CalendarDays size={16} />Date</dt><dd>{detail.date}</dd></div>
                <div><dt><Clock3 size={16} />Time</dt><dd>{detail.time}{detail.timeNote && <small>{detail.timeNote}</small>}</dd></div>
                <div>
                  <dt><Users size={16} />Host</dt>
                  <dd>
                    <span className={c.detailHost}>
                      <i style={{ background: detail.host?.color || '#525252' }} />
                      {detail.host?.name || 'Unknown host'}
                      {detail.host?.active === false && <em>Inactive</em>}
                    </span>
                  </dd>
                </div>
                {detail.isBooking ? (
                  <div>
                    <dt><Video size={16} />Location</dt>
                    <dd>
                      Google Meet
                      <small>{link ? <a href={link} target="_blank" rel="noreferrer">{link.replace(/^https?:\/\//, '')}</a> : 'No Meet link on this booking yet.'}</small>
                    </dd>
                  </div>
                ) : (link || place) && (
                  <div>
                    <dt>{place ? <MapPin size={16} /> : <Video size={16} />}Location</dt>
                    <dd>
                      {place || 'Video call'}
                      {link && <small><a href={link} target="_blank" rel="noreferrer">{link.replace(/^https?:\/\//, '')}</a></small>}
                    </dd>
                  </div>
                )}
              </dl>
              {detail.isBooking ? (
                <div className={c.sheetActions}>
                  {link && <a className={sc.button} href={link} target="_blank" rel="noreferrer"><Video size={16} />Join Meet</a>}
                  <button type="button" className={sc.secondary} onClick={() => navigate('/admin/scheduling/bookings')}>View booking</button>
                </div>
              ) : !detail.busy && (link || detail.ev.html_link) && (
                <div className={c.sheetActions}>
                  {link && <a className={sc.button} href={link} target="_blank" rel="noreferrer"><Video size={16} />Join</a>}
                  {detail.ev.html_link && (
                    <a className={sc.secondary} href={detail.ev.html_link} target="_blank" rel="noreferrer">Open in Google Calendar<ExternalLink size={14} /></a>
                  )}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
