import React, { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import p from './pickers.module.css';

// Date + time pickers for admin forms, in the Lyra style (user, 2026-09-28: the browser's pickers looked bad). Values
// stay the forms' plain strings — "YYYY-MM-DD" and "HH:MM" (24h). Extra props (id, aria-*) go on the trigger, so a
// <label htmlFor>, focus-on-error and invalid styling work as they did with the native inputs.

const pad = (n) => String(n).padStart(2, '0');
const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (value) => {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const longDate = (value) => fromYmd(value).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

const DAY_CLASSES = {
  vhidden: p.srOnly, button_reset: '', button: '',
  months: p.months, month: p.month, caption: p.caption, caption_label: p.captionLabel,
  nav: p.nav, nav_button: p.navButton, nav_button_previous: '', nav_button_next: '',
  table: p.table, head_row: p.row, head_cell: p.headCell, row: p.row, cell: p.cell,
  day: p.day, day_today: p.today, day_selected: p.selected, day_outside: p.outside, day_disabled: p.disabled,
};
const DAY_ICONS = { IconLeft: () => <ChevronLeft size={16} />, IconRight: () => <ChevronRight size={16} /> };

// `today`: "YYYY-MM-DD" in whichever timezone the date means (e.g. the patient's) — marked, and one tap away.
export function DatePickerField({ value, onChange, today, placeholder = 'Choose a date', ...triggerProps }) {
  const [open, setOpen] = useState(false);
  const selected = fromYmd(value);
  const todayDate = fromYmd(today);
  const pick = (ymd) => { onChange(ymd); setOpen(false); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={p.trigger} data-empty={value ? undefined : ''} {...triggerProps}>
          <CalendarDays size={17} aria-hidden="true" />
          <span>{value ? longDate(value) : placeholder}</span>
          <ChevronDown size={16} aria-hidden="true" className={p.chevron} />
        </button>
      </PopoverTrigger>
      {/* Focus lands on the selected day (or today), so the arrow keys move through the grid — not on Radix's first
          tabbable, the previous-month button. */}
      <PopoverContent align="start" className={p.panel} onOpenAutoFocus={(e) => e.preventDefault()}>
        <DayPicker
          mode="single"
          required
          initialFocus
          weekStartsOn={1}
          showOutsideDays
          fixedWeeks
          selected={selected}
          defaultMonth={selected || todayDate}
          today={todayDate}
          onSelect={(d) => d && pick(toYmd(d))}
          classNames={DAY_CLASSES}
          components={DAY_ICONS}
        />
        {today && (
          <div className={p.panelFoot}>
            <button type="button" className={p.todayButton} onClick={() => pick(today)}>Today</button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

const TIMES = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);
const timeLabel = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

// Quarter-hour steps; a value off the grid (e.g. prefilled 10:10) is kept in the list.
export function TimePickerField({ value, onChange, placeholder = 'Choose a time', ...triggerProps }) {
  const options = !value || TIMES.includes(value) ? TIMES : [...TIMES, value].sort();
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={p.trigger} {...triggerProps}>
        <Clock3 size={17} aria-hidden="true" />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className={`${p.panel} ${p.timeMenu}`}>
        {options.map((t) => <SelectItem key={t} value={t} className={p.timeOption}>{timeLabel(t)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
