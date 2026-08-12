import React, { useMemo } from 'react';
import { Navigate, Route, Routes, useOutletContext } from 'react-router-dom';
import { ADMIN_ROLES } from '@/lib/staffApps';
import { SuppAuthContext } from './auth';
import AppShell from './components/AppShell';
import DashboardPage from './pages/DashboardPage';
import PatientsPage from './pages/PatientsPage';
import PatientDetailPage from './pages/PatientDetailPage';
import NewPlanPage from './pages/NewPlanPage';
import PlanEditorPage from './pages/PlanEditorPage';
import SupplementsPage from './pages/SupplementsPage';
import TemplatesPage from './pages/TemplatesPage';
import SuppliersPage from './pages/SuppliersPage';
import './supplements.css';

// The absorbed Supplement Protocol Manager, mounted at /staff/supplements/* inside the
// staff shell (same AppShell-wraps-Routes structure as the standalone app). Portal roles
// map onto the app's two roles: hc stays hc; portal admins get the app's admin powers
// (catalog/templates/suppliers management).
export default function SupplementsApp() {
  const { profile, role } = useOutletContext();

  const user = useMemo(() => {
    if (!['hc', ...ADMIN_ROLES].includes(role)) return null;
    return {
      name: profile.name || profile.email,
      role: ADMIN_ROLES.includes(role) ? 'admin' : 'hc',
    };
  }, [profile, role]);

  if (!user) return <Navigate to="/staff" replace />;
  const isAdmin = user.role === 'admin';
  const adminOnly = (el) => (isAdmin ? el : <Navigate to="/staff/supplements" replace />);

  return (
    <SuppAuthContext.Provider value={{ user, loading: false }}>
      <AppShell>
        <Routes>
          <Route index element={<DashboardPage />} />
          <Route path="patients" element={<PatientsPage />} />
          <Route path="patients/:patientId" element={<PatientDetailPage />} />
          <Route path="plans/new" element={<NewPlanPage />} />
          <Route path="plans/:planId" element={<PlanEditorPage />} />
          <Route path="admin/supplements" element={adminOnly(<SupplementsPage />)} />
          <Route path="admin/templates" element={adminOnly(<TemplatesPage />)} />
          <Route path="admin/suppliers" element={adminOnly(<SuppliersPage />)} />
          <Route path="*" element={<Navigate to="/staff/supplements" replace />} />
        </Routes>
      </AppShell>
    </SuppAuthContext.Provider>
  );
}
