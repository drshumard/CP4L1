import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { ConfirmRoot } from './confirm';
import AppSidebar from './AppSidebar';
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
  return (
    <SidebarProvider className="admin-geist" style={{ background: 'hsl(40 6% 91%)' }}>
      <AppSidebar />
      <SidebarInset className="md:m-2 md:ml-0 md:rounded-xl md:border md:shadow-sm md:h-[calc(100svh-1rem)] overflow-hidden bg-card">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-card px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <h1 className="text-base font-semibold">{pageTitle(pathname)}</h1>
          <a href="/" className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90">
            <ArrowLeft className="size-4" />
            <span>Dashboard</span>
          </a>
        </header>
        <div
          key={pathname.split('/')[2] || 'home'}
          className="flex-1 overflow-y-auto min-w-0 [scrollbar-gutter:stable] animate-in fade-in-0 duration-200"
        >
          <Outlet />
        </div>
      </SidebarInset>
      <ConfirmRoot />
    </SidebarProvider>
  );
}
