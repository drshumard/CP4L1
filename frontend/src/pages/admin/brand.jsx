import React from 'react';

// Shared look for the brand-styled admin pages: the /checkout page's colours — blue #3565e9, gold #ffc24a,
// blue/teal/gold tints — on clean white cards, with solid-blue hero surfaces. Purchases uses the rounded set;
// Automations uses the LYRA_* set (shadcncraft's Lyra style: boxy, square corners, crisp borders, no shadows).
// shadcn components carry their own rounded-* classes, so the square variants need !rounded-none.

export const INK = 'text-[#252b35]';
export const MUTED = 'text-[#68768b]';
export const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[1.2px]';
export const CARD = 'rounded-2xl border border-[#e6e9ef] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_rgba(16,24,40,0.03)]';
export const BLUE_SURFACE = 'relative overflow-hidden bg-[linear-gradient(135deg,#3565e9_0%,#2a52c9_100%)] text-white';
export const INSET = 'rounded-xl border border-[#e6e9ef] bg-[#f7f9fc]';
export const TINT = {
  blue: 'border-[#d5e1ff] bg-[#e8efff] text-[#2654cc]',
  teal: 'border-[#cbe8eb] bg-[#e4f5f6] text-[#2d818b]',
  gold: 'border-[#f0dfb2] bg-[#fff3d7] text-[#8a5a0c]',
  green: 'border-[#c9ead8] bg-[#e6f6ee] text-[#17794a]',
  red: 'border-[#f6cfcc] bg-[#fdecec] text-[#b42318]',
  gray: 'border-[#e3e7ee] bg-[#f1f3f6] text-[#5f6b7c]',
};
const GOLD = 'border border-[#efb13c] bg-[#ffc24a] text-[#282614] shadow-[0_3px_7px_#de9b2420] hover:bg-[#f7b93d]';
const OUTLINE = 'border-[#dde2e9] bg-white text-[#252b35] hover:bg-[#f5f8ff] hover:text-[#2654cc]';
// Overrides the portal's global teal input focus with the /checkout one.
const FIELD = 'border-[#dfe3e9] bg-white shadow-[0_1px_2px_#15274b04] focus:!border-[#7c91cf] focus:![box-shadow:0_0_0_3px_#eaf0ff] focus-visible:ring-0';
export const GOLD_BUTTON = `rounded-lg ${GOLD}`;
export const OUTLINE_BUTTON = `rounded-lg ${OUTLINE}`;
export const INPUT = `rounded-lg ${FIELD}`;
export const LYRA_CARD = 'border border-[#dde2e9] bg-white';
export const LYRA_INSET = 'border border-[#e6e9ef] bg-[#f7f9fc]';
export const LYRA_GOLD_BUTTON = `!rounded-none ${GOLD}`;
export const LYRA_OUTLINE_BUTTON = `!rounded-none ${OUTLINE}`;
export const LYRA_INPUT = `!rounded-none ${FIELD}`;
export const SWITCH = 'data-[state=checked]:bg-[#3565e9]';

export function Pill({ tone, children, dot = true, square = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap border px-2.5 py-0.5 text-xs font-medium ${square ? '' : 'rounded-full'} ${TINT[tone]}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}{children}
    </span>
  );
}

export function IconTile({ icon: Icon, tone, className = 'size-9 rounded-lg', iconClass = 'size-4' }) {
  return <span className={`grid shrink-0 place-items-center border ${className} ${TINT[tone]}`}><Icon className={iconClass} /></span>;
}

export function Glow() {   // soft light circles on the solid-blue surfaces
  return <>
    <span className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full bg-white/10" />
    <span className="pointer-events-none absolute -bottom-20 right-16 size-36 rounded-full bg-white/[0.06]" />
  </>;
}

export function PageHeader({ icon: Icon, eyebrow, title, accent, description, children }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {eyebrow && <p className={`mb-2 flex items-center gap-2 ${EYEBROW} text-[#2d5fdc]`}><Icon className="size-3.5" /> {eyebrow}</p>}
        <h1 className={`text-[28px] font-semibold leading-tight tracking-[-0.8px] ${INK}`}>{title} <span className="text-[#3565e9]">{accent}</span></h1>
        <p className={`mt-1 text-sm ${MUTED}`}>{description}</p>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
