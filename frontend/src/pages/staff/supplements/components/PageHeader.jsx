import React from 'react';

// Lyra page heading (kicker + title + subtitle, actions on the right), matching the workspace pages.
export default function PageHeader({ title, subtitle, children }) {
  return (
    <header className="flex items-end justify-between gap-6 px-8 pt-8 pb-6">
      <div className="min-w-0">
        <span className="block font-mono text-[11px] uppercase tracking-[0.08em] text-[color:var(--ink-muted)]">Supplements</span>
        <h1 className="mt-1.5 text-[34px] font-medium leading-[1.2] tracking-[-0.04em] text-ink">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">{subtitle}</p>
        )}
      </div>
      {children && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {children}
        </div>
      )}
    </header>
  );
}

export function PageContainer({ children, className = '' }) {
  return (
    <div className="canvas min-h-full">
      <div className={`mx-auto max-w-[1400px] ${className}`}>{children}</div>
    </div>
  );
}
