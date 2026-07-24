import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// Must stay in sync with backend HOST_COLOR_PALETTE (server.py) and the tint/text
// companion map (PALETTE) in TeamCalendar.jsx — those are keyed by these exact hexes.
export const HOST_COLORS = [
  '#2563eb', '#7c3aed', '#059669', '#d97706', '#0e7490',
  '#e11d48', '#4f46e5', '#c026d3', '#0d9488', '#ea580c',
];

export function HostColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange('')}
        className={cn(
          'flex h-7 items-center rounded-full border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
          !value && 'border-foreground text-foreground',
        )}
      >
        Auto
      </button>
      {HOST_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Use color ${c}`}
          onClick={() => onChange(c)}
          className="flex size-7 items-center justify-center rounded-full transition-transform hover:scale-110"
          style={{ background: c }}
        >
          {value === c && <Check className="size-4 text-white" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}
