import React, { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, CalendarRange, Users, Headphones, Clock3, SlidersHorizontal, Plus } from 'lucide-react';
import s from './workspace.module.css';
import sc from './scheduling/scheduling.module.css';

// Scheduling section shell (prototype scheduling/layout.tsx): heading + New booking, then the section tabs.
// The New booking page carries its own heading (back link), so both step aside there (the user: hide the tabs on it).
const TABS = [
  { to: '/admin/scheduling/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/admin/scheduling/calendar', label: 'Calendar', icon: CalendarRange },
  { to: '/admin/scheduling/hosts', label: 'Hosts', icon: Users },
  { to: '/admin/scheduling/coordinators', label: 'Coordinators', icon: Headphones },
  { to: '/admin/scheduling/events', label: 'Events', icon: Clock3 },
  { to: '/admin/scheduling/settings', label: 'Settings', icon: SlidersHorizontal },
];

export default function SchedulingLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const navRef = useRef(null);
  const isNewBooking = pathname.startsWith('/admin/scheduling/new');
  const isBookings = pathname.startsWith('/admin/scheduling/bookings');

  // On phones the tab row scrolls sideways — centre the current tab rather than leave it off-screen.
  // (Only the row scrolls; scrollIntoView would move the page too.)
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector('[aria-current]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft += active.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);
  return (
    <div className={`${s.schedulingLyra} ${sc.scope}`}>
      {!isNewBooking && (
        <>
          <div className={sc.heading}>
            <div>
              <h1>Scheduling</h1>
              {isBookings && <p>Your people, their time, and everything in between.</p>}
            </div>
            <button type="button" className={sc.button} onClick={() => navigate('/admin/scheduling/new')}><Plus size={16} />New booking</button>
          </div>
          <nav ref={navRef} className={sc.nav} aria-label="Scheduling views">
            {TABS.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to}><Icon size={16} />{label}</NavLink>
            ))}
          </nav>
        </>
      )}
      <div key={pathname} className="animate-in fade-in-0 duration-200">
        <Outlet />
      </div>
    </div>
  );
}
