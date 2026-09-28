import React, { useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Minus, Search, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import s from './workspace.module.css';

// Shared admin building blocks — design: shumard-checkout-portal/app/admin/ui.tsx.

// For a record sheet's onInteractOutside / onEscapeKeyDown: keep it open when the click or Escape belongs to something
// layered over it — a confirm or the reschedule modal (data-admin-overlay), or a dialog opened from the sheet. On touch,
// Radix judges "outside" at click time, when that layer may already have unmounted — so for clicks the target's own
// ancestry (a detached subtree still knows where it came from) is checked too. Not for Escape: its target is focus
// inside the sheet, which is itself a role="dialog".
// An AdminSelect menu counts as layered over it too: react-dialog ships its own copy of Radix's layer stack, so the sheet
// doesn't know a menu is open. Escape while one is open is the menu's (AdminSelect closes itself — see there); a press
// outside is too — the sheet only judges it on the click, after the menu already closed on that pointerdown.
let menuDismissedBy = null;   // the pointerdown that last closed an AdminSelect menu
export const keepSheetOpen = (e) => {
  const overlayUp = !!document.querySelector('[data-admin-overlay], [data-admin-select]');
  const closedAMenu = !!e.detail?.originalEvent && e.detail.originalEvent === menuDismissedBy;
  const fromLayer = e.type !== 'keydown' && e.target?.closest?.('[data-admin-overlay], [role="dialog"], [role="alertdialog"]');
  if (overlayUp || closedAMenu || fromLayer) e.preventDefault();
};

// A record sheet keeps its last record on screen while it animates closed — clearing it on close blanked the panel
// mid-slide. Open the sheet on the live value; render from this.
export function useLastRecord(record) {
  const [last, setLast] = useState(record);
  if (record && record !== last) setLast(record);
  return record || last;
}

export const initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

// `className` adds to the trigger (e.g. a compact table cell); an option can be `disabled`. Inside a sheet or dialog the
// menu renders into it rather than <body>: react-dialog's own copy of Radix's focus trap and scroll lock only let focus
// and the wheel into its own DOM (keyboard picking and scrolling long lists broke). Open state is ours so Escape always
// closes the menu: inside a sheet keepSheetOpen has already marked that Escape handled (to keep the sheet), and Radix
// then skips its own dismiss — but still calls onEscapeKeyDown.
export function AdminSelect({ value, onChange, options, label, id, placeholder, invalid, describedBy, disabled, className }) {
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState(null);
  const openChange = (next) => {
    if (next) setContainer(trigger.current?.closest('[role="dialog"]') || null);
    setOpen(next);
  };
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled} open={open} onOpenChange={openChange}>
      <SelectTrigger ref={trigger} id={id} aria-label={label} aria-invalid={invalid || undefined} aria-describedby={describedBy} className={className ? `${s.select} ${className}` : s.select}>
        <SelectValue placeholder={placeholder || label} />
      </SelectTrigger>
      <SelectContent position="popper" container={container} className={s.selectMenu} data-admin-select="" onEscapeKeyDown={() => setOpen(false)}
        onPointerDownOutside={(e) => { menuDismissedBy = e.detail.originalEvent; }}>
        {options.map((o) => <SelectItem key={o.value} value={o.value} disabled={o.disabled} className={s.selectOption}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// `tag` = a small label after the name (e.g. a team member's role).
export function Person({ name, email, onClick, tag }) {
  const label = name || 'Unknown';
  const content = (
    <>
      <span className={s.avatar} data-tone={label.charCodeAt(0) % 3}>{initials(label) || '?'}</span>
      <span className={s.personText}>
        <strong>{label}{tag && <span className={s.personTag}>{tag}</span>}</strong>
        {email && <span>{email}</span>}
      </span>
    </>
  );
  return onClick
    ? <button type="button" className={s.person} onClick={onClick}>{content}</button>
    : <div className={s.person}>{content}</div>;
}

// Tone from the prototype's value mapping unless given: green (done) · red · amber · blue (default).
export function Status({ value, tone }) {
  const t = tone || (['Complete', 'Confirmed', 'Synced'].includes(value) ? 'green'
    : value === 'Cancelled' ? 'red' : ['Skipped', 'Preview'].includes(value) ? 'amber' : 'blue');
  const Icon = t === 'green' ? Check : t === 'red' ? X : value === 'Skipped' ? Minus : null;
  return <span className={s.status} data-tone={t}>{Icon && <Icon size={t === 'green' ? 13 : 12} aria-hidden="true" />}{value}</span>;
}

export function SearchBox({ value, onChange, label, placeholder = label }) {
  return (
    <div className={s.search}>
      <Search size={18} aria-hidden="true" />
      <input type="search" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {value && <button type="button" aria-label="Clear search" onClick={() => onChange('')}><X size={15} /></button>}
    </div>
  );
}

export function NoResults({ reset, title = 'No matching results', description = 'Try a different name or reset your filters.' }) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}><Search size={20} /></span>
      <div><h3>{title}</h3><p>{description}</p></div>
      {reset && <button type="button" className={s.secondaryButton} onClick={reset}>Reset filters</button>}
    </div>
  );
}

export function TablePager({ page, count, pageSize, onChange }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return (
    <div className={s.tableFooter}>
      <span role="status">{count ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, count)} of {count} results</span>
      <div className={s.pagination}>
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={17} /></button>
        <span>Page {page} of {pages}</span>
        <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={17} /></button>
      </div>
    </div>
  );
}
