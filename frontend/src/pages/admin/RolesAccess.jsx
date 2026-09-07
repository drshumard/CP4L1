import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { adminApi } from './api';
import { Button } from '@/components/ui/button';

// Team → "Roles & access": the capability matrix. Super admin edits everything;
// an admin can tune pcc/doa/hc but not the admin row, and can't grant super-admin-only
// capabilities (e.g. account deletion). The backend enforces all of this too.
const HEADER_GRADIENT = 'linear-gradient(to top, #F8F8F8, #F8F8F899, #00000000)';

export default function RolesAccess() {
  const [data, setData] = useState(null);        // { catalog, roles, editorIsSuperAdmin, superAdminOnlyCaps }
  const [caps, setCaps] = useState({});          // { role: Set(capabilities) } — local, editable
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [savingRole, setSavingRole] = useState(null);

  useEffect(() => {
    adminApi.get('/admin/role-permissions')
      .then((r) => {
        setData(r.data);
        const init = {};
        r.data.roles.forEach((role) => { init[role.role] = new Set(role.capabilities); });
        setCaps(init);
      })
      .catch((e) => { if (e?.response?.status === 403) setForbidden(true); else toast.error('Failed to load roles'); })
      .finally(() => setLoading(false));
  }, []);

  const superOnly = useMemo(() => new Set(data?.superAdminOnlyCaps || []), [data]);
  const roleMeta = useMemo(() => Object.fromEntries((data?.roles || []).map((r) => [r.role, r])), [data]);

  // Group the catalog for readable rows.
  const groups = useMemo(() => {
    const g = {};
    (data?.catalog || []).forEach((c) => { (g[c.group] ||= []).push(c); });
    return g;
  }, [data]);

  const dirty = useMemo(() => {
    if (!data) return new Set();
    const d = new Set();
    data.roles.forEach((role) => {
      const before = new Set(role.capabilities);
      const now = caps[role.role] || new Set();
      if (before.size !== now.size || [...now].some((c) => !before.has(c))) d.add(role.role);
    });
    return d;
  }, [caps, data]);

  const canEditCell = (role, capKey) => {
    const meta = roleMeta[role];
    if (!meta?.editable) return false;
    // A non-super-admin can't toggle super-admin-only capabilities at all.
    if (superOnly.has(capKey) && !data.editorIsSuperAdmin) return false;
    return true;
  };

  const toggle = (role, capKey) => {
    if (!canEditCell(role, capKey)) return;
    setCaps((prev) => {
      const next = new Set(prev[role]);
      next.has(capKey) ? next.delete(capKey) : next.add(capKey);
      return { ...prev, [role]: next };
    });
  };

  const saveRole = async (role) => {
    setSavingRole(role);
    try {
      await adminApi.put(`/admin/role-permissions/${role}`, { capabilities: [...(caps[role] || [])] });
      // Update the baseline so the row is no longer dirty.
      setData((prev) => ({
        ...prev,
        roles: prev.roles.map((r) => r.role === role ? { ...r, capabilities: [...(caps[role] || [])] } : r),
      }));
      toast.success(`Saved ${roleMeta[role]?.label || role} access`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally { setSavingRole(null); }
  };

  if (forbidden) return <div className="p-6 py-12 text-center text-muted-foreground">Only admins can manage roles.</div>;
  if (loading) return <div className="p-6 py-12 text-center text-muted-foreground">Loading…</div>;
  if (!data) return null;

  const roles = data.roles;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose what each role can access. Changes apply on a member's next page load.
        {!data.editorIsSuperAdmin && ' Some capabilities and the Admin role are super-admin-only.'}
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ backgroundImage: HEADER_GRADIENT }}>
              <th className="h-12 px-4 text-left align-middle text-[13px] font-semibold text-foreground">Capability</th>
              {roles.map((r) => (
                <th key={r.role} className="h-12 px-4 text-center align-middle text-[13px] font-semibold text-foreground">
                  {r.label}{!r.editable && <span className="ml-1 text-[11px] font-normal text-muted-foreground">(locked)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([group, items]) => (
              <React.Fragment key={group}>
                <tr className="bg-muted/40">
                  <td colSpan={roles.length + 1} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</td>
                </tr>
                {items.map((cap) => (
                  <tr key={cap.key} className="border-t">
                    <td className="px-4 py-2 text-foreground">
                      {cap.label}
                      {superOnly.has(cap.key) && <span className="ml-1.5 text-[11px] text-amber-600">super-admin only</span>}
                    </td>
                    {roles.map((r) => {
                      const checked = (caps[r.role] || new Set()).has(cap.key);
                      const editable = canEditCell(r.role, cap.key);
                      return (
                        <td key={r.role} className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!editable}
                            onChange={() => toggle(r.role, cap.key)}
                            className="size-4 cursor-pointer accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`${r.label} — ${cap.label}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        {roles.filter((r) => r.editable).map((r) => (
          <Button key={r.role} size="sm" variant={dirty.has(r.role) ? 'default' : 'outline'}
            disabled={!dirty.has(r.role) || savingRole === r.role}
            onClick={() => saveRole(r.role)}>
            {savingRole === r.role ? 'Saving…' : `Save ${r.label}`}
          </Button>
        ))}
      </div>
    </div>
  );
}
