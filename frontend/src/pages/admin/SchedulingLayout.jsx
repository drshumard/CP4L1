import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarDays, CalendarRange, Users, Headset, Clock, Settings2 } from 'lucide-react';

const TABS = [
  { to: '/admin/scheduling/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/admin/scheduling/calendar', label: 'Calendar', icon: CalendarRange },
  { to: '/admin/scheduling/hosts', label: 'Hosts', icon: Users },
  { to: '/admin/scheduling/coordinators', label: 'Coordinators', icon: Headset },
  { to: '/admin/scheduling/events', label: 'Events', icon: Clock },
  { to: '/admin/scheduling/settings', label: 'Settings', icon: Settings2 },
];

export default function SchedulingLayout() {
  const { pathname } = useLocation();
  return (
    <div className="p-5 sm:p-8 max-w-7xl 2xl:max-w-[1680px] mx-auto w-full">
      <div className="mb-6 overflow-x-auto">
        <div className="cad-tabs">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `cad-tab ${isActive ? 'cad-tab-active' : ''}`}
            >
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </div>
      </div>
      <div key={pathname} className="animate-in fade-in-0 duration-200">
        <Outlet />
      </div>
    </div>
  );
}
