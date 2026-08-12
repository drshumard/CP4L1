import React from 'react';

export default function PageHeader({ title, subtitle, children }) {
  return (
    <header className="chrome-blur hairline-b sticky top-0 z-30 px-8 pt-5 pb-4">
      <div className="flex items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold text-ink tracking-[-0.02em] leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[12px] text-ink-muted mt-0.5">{subtitle}</p>
          )}
        </div>
        {children && (
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}

export function PageContainer({ children, className = '' }) {
  return (
    <div className="min-h-[calc(100vh-3rem)] canvas">
      <div className={`max-w-[1400px] mx-auto ${className}`}>{children}</div>
    </div>
  );
}
