import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

// Imperative, Cadence-styled confirm — replaces browser-default window.confirm.
// Usage: if (!(await confirmDialog({ title, message, confirmLabel, danger }))) return;
// Mount <ConfirmRoot/> once inside the admin shell.

let _open = null;

export function confirmDialog(opts = {}) {
  return new Promise((resolve) => {
    if (_open) _open({ ...opts, resolve });
    else resolve(typeof window !== 'undefined' ? window.confirm(opts.message || opts.title || 'Are you sure?') : false);
  });
}

export function ConfirmRoot() {
  const [state, setState] = useState(null);

  const close = (val) => {
    setState((s) => { if (s) s.resolve(val); return null; });
  };

  useEffect(() => {
    _open = setState;
    return () => { _open = null; };
  }, []);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  if (!state) return null;
  const danger = state.danger !== false;

  return (
    <div className="admin-shell pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={() => close(false)} />
      <div
        className="relative bg-white w-full max-w-sm"
        style={{ borderRadius: 'var(--r-lg)', border: '1px solid var(--ink-200)', boxShadow: '0 12px 32px rgba(15,23,42,0.16)' }}
      >
        <div className="p-5 flex items-start gap-3">
          {danger && (
            <span className="flex-none mt-0.5" aria-hidden="true">
              <AlertTriangle size={18} strokeWidth={1.75} style={{ color: 'var(--st-conflict-fg)' }} />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">{state.title || 'Are you sure?'}</h3>
            {state.message && (
              <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{state.message}</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--ink-200)' }}>
          <button className="cad-btn cad-btn--secondary" onClick={() => close(false)}>
            {state.cancelLabel || 'Cancel'}
          </button>
          <button className={`cad-btn ${danger ? 'cad-btn--danger' : 'cad-btn--primary'}`} onClick={() => close(true)} autoFocus>
            {state.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
