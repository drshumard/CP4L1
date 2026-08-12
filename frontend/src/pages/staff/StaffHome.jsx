import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/staffApps';

export default function StaffHome() {
  const { profile, role, apps } = useOutletContext();
  const firstName = (profile.first_name || profile.name || '').trim().split(/\s+/)[0] || 'there';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Welcome, {firstName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your team workspace · signed in as {ROLE_LABELS[role] || role}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {apps.map((a) => (
          <Link key={a.key} to={a.path}
            className="group rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-foreground/30">
            <div className="flex items-start justify-between">
              <a.icon className="size-6 text-foreground" strokeWidth={1.75} />
              <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-3 font-semibold text-foreground">{a.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{a.blurb}</p>
          </Link>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">More apps will appear here as they're added to the portal.</p>
    </div>
  );
}
