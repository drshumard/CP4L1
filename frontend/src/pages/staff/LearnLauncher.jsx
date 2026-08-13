import React, { useEffect, useRef, useState } from 'react';
import { adminApi } from '../admin/api';
import { GraduationCap } from 'lucide-react';

// The Learn tab's landing: mint a 2-minute single-use SSO token and hand the browser to
// the federated Learn app (Neuro93Saturn), whose /api/auth/portal redeems it against the
// portal backend and mints its own session. In prod Learn lives same-origin at /learn
// (Cloudflare Worker route); in dev point REACT_APP_LEARN_URL at the local Next server.
const LEARN_URL = process.env.REACT_APP_LEARN_URL || '/learn';

export default function LearnLauncher() {
  const [error, setError] = useState('');
  const launched = useRef(false);

  useEffect(() => {
    // StrictMode double-mounts effects in dev; two parallel handoffs make Supabase
    // invalidate the first magic-link hash — exactly one launch per visit.
    if (launched.current) return;
    launched.current = true;
    adminApi.post('/auth/learn-token')
      .then((r) => {
        window.location.href = `${LEARN_URL}/api/auth/portal?token=${encodeURIComponent(r.data.token)}`;
      })
      .catch((e) => setError(e?.response?.data?.detail || 'Could not open Learn. Try again.'));
  }, []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center rounded-xl border bg-card px-6 py-16 text-center shadow-sm">
      <GraduationCap className="size-10 text-muted-foreground" strokeWidth={1.5} />
      {error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          Opening Learn…
        </p>
      )}
    </div>
  );
}
