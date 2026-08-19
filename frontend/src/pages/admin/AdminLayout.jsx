import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { ConfirmRoot } from './confirm';
import AppSidebar from './AppSidebar';
import { adminApi } from './api';
import { getAdminDisplayTz, setAdminDisplayTz } from './format';
import { US_TIMEZONES, safeTz, tzAbbrev } from './usTimezones';
import './admin.css';

function pageTitle(pathname) {
  if (pathname.startsWith('/admin/scheduling')) return 'Scheduling';
  if (pathname.startsWith('/admin/analytics')) return 'Analytics';
  if (pathname.startsWith('/admin/logs')) return 'Activity log';
  if (pathname.startsWith('/admin/automations')) return 'Automations';
  return 'Users';
}

export default function AdminLayout() {
  const { pathname } = useLocation();
  // Admin-wide display timezone: Pacific until the profile loads, then the team member's
  // saved zone. It also feeds format.js's module default, so the page subtree is re-keyed
  // on change — components that call fmt* without a tz re-render with the new zone.
  const [displayTz, setDisplayTzState] = useState(getAdminDisplayTz());

  useEffect(() => {
    adminApi.get('/user/me')
      .then((r) => {
        const t = safeTz(r.data?.timezone);
        setAdminDisplayTz(t);
        setDisplayTzState(t);
      })
      .catch(() => { /* not signed in / transient — keep the Pacific default */ });
  }, []);

  const changeTz = async (v) => {
    const prev = displayTz;
    setAdminDisplayTz(v);
    setDisplayTzState(v);
    try {
      await adminApi.put('/user/me', { timezone: v });
    } catch {
      setAdminDisplayTz(prev);
      setDisplayTzState(prev);
      toast.error('Could not save your timezone');
    }
  };

  return (
    <SidebarProvider className="admin-geist" style={{ background: 'hsl(40 6% 91%)' }}>
      <AppSidebar />
      <SidebarInset className="md:m-2 md:ml-0 md:rounded-xl md:border md:shadow-sm md:h-[calc(100svh-1rem)] overflow-hidden bg-card">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-card px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <h1 className="text-base font-semibold">{pageTitle(pathname)}</h1>
          <Select value={displayTz} onValueChange={changeTz}>
            <SelectTrigger
              className="ml-auto h-8 w-auto gap-1.5 px-2 text-muted-foreground"
              aria-label="Display timezone"
              title="Timezone all admin times are shown in (saved to your profile)"
            >
              <Globe className="size-4" />
              <span className="text-xs font-medium tabular-nums">{tzAbbrev(new Date(), displayTz) || 'TZ'}</span>
            </SelectTrigger>
            <SelectContent align="end">
              {US_TIMEZONES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <a href="/" className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90">
            <ArrowLeft className="size-4" />
            <span>Dashboard</span>
          </a>
        </header>
        <div
          key={`${pathname.split('/')[2] || 'home'}:${displayTz}`}
          className="flex-1 overflow-y-auto min-w-0 [scrollbar-gutter:stable] animate-in fade-in-0 duration-200"
        >
          <Outlet />
        </div>
      </SidebarInset>
      <ConfirmRoot />
    </SidebarProvider>
  );
}
