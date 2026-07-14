import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

// Cadence custom select — a real listbox (not a native <select>), so the open menu
// is styled to spec. Portaled to <body> with fixed positioning so it's never clipped
// by a modal's overflow; flips above the trigger when there isn't room below.
//
// Props: value, onChange(value), options=[{value,label,disabled?}], placeholder,
//        disabled, className, style, ariaLabel.

export default function CadSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  disabled = false,
  className = '',
  style = {},
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));
  const label = selected ? selected.label : placeholder;

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const dropUp = spaceBelow < 260 && r.top > spaceBelow;
    setRect({
      left: r.left,
      width: r.width,
      top: r.bottom + 4,
      bottom: window.innerHeight - r.top + 4,
      dropUp,
    });
  };

  const openMenu = () => {
    if (disabled) return;
    place();
    setOpen(true);
    setActiveIdx(Math.max(0, options.findIndex((o) => String(o.value) === String(value))));
  };
  const closeMenu = () => {
    setOpen(false);
    setActiveIdx(-1);
    triggerRef.current?.focus();
  };
  const choose = (opt) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    setActiveIdx(-1);
    triggerRef.current?.focus();
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const reposition = () => place();
    const onDocDown = (e) => {
      if (triggerRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
      setActiveIdx(-1);
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    document.addEventListener('mousedown', onDocDown);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('mousedown', onDocDown);
    };
  }, [open]); // eslint-disable-line

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActiveIdx(0); }
    else if (e.key === 'End') { e.preventDefault(); setActiveIdx(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[activeIdx]) choose(options[activeIdx]); }
  };

  const panel = open && rect
    ? createPortal(
        <div
          ref={panelRef}
          className="cad-menu"
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            ...(rect.dropUp ? { bottom: rect.bottom } : { top: rect.top }),
          }}
        >
          {options.map((o, i) => {
            const isSel = String(o.value) === String(value);
            return (
              <div
                key={o.value}
                role="option"
                aria-selected={isSel}
                aria-disabled={o.disabled || undefined}
                className={`cad-menu-item ${i === activeIdx ? 'is-active' : ''} ${isSel ? 'is-selected' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
              >
                <span className="truncate">{o.label}</span>
                {isSel && <Check size={15} strokeWidth={2} />}
              </div>
            );
          })}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={`cad-select2 ${className}`} style={style}>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className="cad-input cad-select2-trigger"
      >
        <span className={selected ? 'truncate' : 'cad-select2-placeholder truncate'}>{label}</span>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          style={{ color: 'var(--ink-400)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .12s', flex: 'none' }}
        />
      </button>
      {panel}
    </div>
  );
}
