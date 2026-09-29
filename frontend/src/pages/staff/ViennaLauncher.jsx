import React, { useEffect, useRef, useState } from 'react';
import { adminApi } from '../admin/api';
import { MessagesSquare } from 'lucide-react';

// The Vienna tile's landing: mint a 2-minute single-use SSO token and hand the browser to
// the Vienna app, whose /api/auth/portal redeems it against the portal backend and mints
// its own session. REACT_APP_VIENNA_URL is Vienna's public origin (e.g. https://vienna.drshumard.com).
const VIENNA_URL = (process.env.REACT_APP_VIENNA_URL || '').replace(/\/$/, '');

export default function ViennaLauncher() {
  const [error, setError] = useState('');
  const launched = useRef(false);

  // Each attempt mints a FRESH token — a failed handoff burns its single-use token.
  const launch = () => {
    setError('');
    if (!VIENNA_URL) { setError('Vienna is not configured on this portal yet.'); return; }
    adminApi.post('/auth/vienna-token')
      .then((r) => {
        window.location.replace(`${VIENNA_URL}/api/auth/portal?token=${encodeURIComponent(r.data.token)}`);
      })
      .catch((e) => setError(e?.response?.data?.detail || 'Could not open Vienna.'));
  };

  useEffect(() => {
    if (launched.current) return;   // StrictMode double-mounts effects in dev
    launched.current = true;
    launch();
  }, []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center rounded-xl border bg-card px-6 py-16 text-center shadow-sm">
      <MessagesSquare className="size-10 text-muted-foreground" strokeWidth={1.5} />
      {error ? (
        <>
          <p className="mt-4 text-sm text-red-600">{error}</p>
          <button type="button" onClick={launch}
            className="mt-3 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
            Try again
          </button>
        </>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          Opening Vienna…
        </p>
      )}
    </div>
  );
}
