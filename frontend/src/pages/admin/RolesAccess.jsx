import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { adminApi } from './api';
import s from './team.module.css';

// Team → "Roles & access": the capability matrix, ported from the Lyra prototype. Super admin
// edits everything; an admin can tune pcc/doa/hc but not the admin row, and can't grant
// super-admin-only capabilities (e.g. account deletion). The backend enforces all of this too.

// A capability needs its parent on before it can be granted; turning a parent off turns its
// dependants off. Mirrors the prototype (team.manage hangs off the Team app here, not the portal).
const REQUIRES = {
  'patients.view': 'portal', 'patients.manage': 'patients.view',
  'scheduling.view': 'portal', 'scheduling.manage': 'scheduling.view',
  'analytics.view': 'portal', 'automations.manage': 'portal', 'settings.manage': 'portal',
  'purchases.view': 'portal', 'purchases.manage': 'purchases.view',
  'team.manage': 'team', 'supplements.manage': 'supplements', 'learn.instruct': 'learn',
  'vienna.support': 'vienna', 'vienna.marketing': 'vienna', 'vienna.admin': 'vienna',
};
const dependsOn = (key, root) => { for (let cur = key; cur; cur = REQUIRES[cur]) if (cur === root) return true; return false; };
const sameSet = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));
const memberLabel = (n) => `${n} member${n === 1 ? '' : 's'}`;
const joinNames = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export default function RolesAccess({ members = [] }) {
  const [data, setData] = useState(null);        // { catalog, roles, editorIsSuperAdmin, superAdminOnlyCaps }
  const [caps, setCaps] = useState({});          // { role: Set(capabilities) } — local, editable
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);

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
  const labelOf = useMemo(() => Object.fromEntries((data?.catalog || []).map((c) => [c.key, c.label])), [data]);
  const groups = useMemo(() => {
    const g = {};
    (data?.catalog || []).forEach((c) => { (g[c.group] ||= []).push(c); });
    return g;
  }, [data]);
  const saved = useMemo(() => Object.fromEntries((data?.roles || []).map((r) => [r.role, new Set(r.capabilities)])), [data]);
  const grantable = (data?.catalog || []).filter((c) => !superOnly.has(c.key)).length;
  const dirtyRoles = (data?.roles || []).filter((r) => r.editable && !sameSet(caps[r.role] || new Set(), saved[r.role] || new Set()));
  const roleCount = (role) => members.filter((m) => m.role === role).length;

  const cellState = (role, capKey) => {
    const granted = (caps[role.role] || new Set()).has(capKey);
    const needs = REQUIRES[capKey] && !(caps[role.role] || new Set()).has(REQUIRES[capKey]) ? labelOf[REQUIRES[capKey]] : null;
    const locked = !role.editable || (superOnly.has(capKey) && !data.editorIsSuperAdmin) || (needs && !granted);
    const title = !role.editable ? undefined
      : superOnly.has(capKey) && !data.editorIsSuperAdmin ? 'Only a super admin can grant this'
        : needs && !granted ? `Turn on ${needs} first` : undefined;
    return { granted, locked, title, changed: granted !== (saved[role.role] || new Set()).has(capKey) };
  };

  const toggle = (role, capKey) => {
    setCaps((prev) => {
      const next = new Set(prev[role]);
      if (next.has(capKey)) [...next].forEach((k) => { if (dependsOn(k, capKey)) next.delete(k); });
      else next.add(capKey);
      return { ...prev, [role]: next };
    });
  };

  const discard = () => setCaps(Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, new Set(v)])));

  const saveAll = async () => {
    setSaving(true);
    const done = [];
    try {
      for (const role of dirtyRoles) {
        await adminApi.put(`/admin/role-permissions/${role.role}`, { capabilities: [...caps[role.role]] });
        done.push(role);
      }
      toast.success(`Saved ${joinNames(done.map((r) => r.label))}. Changes apply on each member's next page load.`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally {
      // Whatever saved becomes the new baseline; anything after a failure stays dirty.
      if (done.length) {
        setData((prev) => ({
          ...prev,
          roles: prev.roles.map((r) => (done.some((d) => d.role === r.role) ? { ...r, capabilities: [...caps[r.role]] } : r)),
        }));
      }
      setSaving(false);
    }
  };

  if (forbidden) return <p className={s.intro}>Only admins can manage roles.</p>;
  if (loading) return <p className={s.intro}>Loading…</p>;
  if (!data) return null;

  return (
    <>
      <p className={s.intro}>
        Choose what each role can access. Changes apply on a member's next page load. Super admins have every capability, and only they can change the Admin role.
      </p>
      <section className={s.card} aria-label="Roles and access">
        <div className={s.scroll}>
          <table className={s.matrix}>
            <thead>
              <tr>
                <th scope="col">Capability</th>
                {data.roles.map((role) => (
                  <th key={role.role} scope="col" className={s.roleHead} data-edited={dirtyRoles.includes(role) || undefined}>
                    <strong>{!role.editable && <Lock size={12} aria-hidden="true" />}{role.label}</strong>
                    <span>{role.editable ? `${memberLabel(roleCount(role.role))} · ${(caps[role.role] || new Set()).size}/${grantable}` : `Locked · ${memberLabel(roleCount(role.role))}`}</span>
                  </th>
                ))}
              </tr>
            </thead>
            {Object.entries(groups).map(([group, items]) => (
              <tbody key={group}>
                <tr className={s.groupRow}><th scope="rowgroup" colSpan={data.roles.length + 1}>{group}</th></tr>
                {items.map((cap) => (
                  <tr key={cap.key}>
                    <th scope="row">
                      <span className={s.capability}>{cap.label}{superOnly.has(cap.key) && <em className={s.superOnly}>Super admin only</em>}</span>
                    </th>
                    {data.roles.map((role) => {
                      const cell = cellState(role, cap.key);
                      return (
                        <td key={role.role} data-locked={!role.editable || undefined} data-changed={cell.changed || undefined}>
                          <input
                            type="checkbox"
                            className={s.check}
                            checked={cell.granted}
                            disabled={cell.locked}
                            onChange={() => toggle(role.role, cap.key)}
                            aria-label={`${role.label}: ${cap.label}`}
                            title={cell.title}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>
      {dirtyRoles.length > 0 && (
        <div className={s.saveBar} role="region" aria-label="Unsaved changes">
          <p><span aria-hidden="true" />Unsaved changes to {joinNames(dirtyRoles.map((r) => r.label))}</p>
          <div>
            <button type="button" className={s.secondary} onClick={discard} disabled={saving}>Discard</button>
            <button type="button" className={s.primary} onClick={saveAll} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      )}
    </>
  );
}
