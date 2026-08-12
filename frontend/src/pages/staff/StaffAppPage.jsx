import React from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import { STAFF_APPS } from '@/lib/staffApps';

// Generic shell for a registered staff app. Guards on the registry's role list, then
// renders a placeholder until the real app is integrated — swap the body per app as
// integrations land (iframe, embedded routes, whatever each app needs).
export default function StaffAppPage({ appKey }) {
  const { role } = useOutletContext();
  const app = STAFF_APPS.find((a) => a.key === appKey);
  if (!app) return <Navigate to="/staff" replace />;
  if (!app.roles.includes(role)) return <Navigate to="/staff" replace />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center rounded-xl border bg-card px-6 py-16 text-center shadow-sm">
      <app.icon className="size-10 text-muted-foreground" strokeWidth={1.5} />
      <h2 className="mt-4 text-lg font-semibold text-foreground">{app.label}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{app.blurb}</p>
      <p className="mt-6 rounded-full border px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Coming soon</p>
    </div>
  );
}
