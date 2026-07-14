import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, MoreHorizontalIcon } from 'lucide-react';
import { adminApi } from '../api';
import { confirmDialog } from '../confirm';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const HEADER_GRADIENT = 'linear-gradient(to top, #F8F8F8, #F8F8F899, #00000000)';
const HEAD = 'h-14 px-6 text-center align-middle text-[13px] font-semibold text-foreground';
const CELL = 'px-6 py-2 text-sm text-center';

export default function Directors() {
  const [directors, setDirectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [engine, setEngine] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.get('/admin/directors');
      setDirectors(res.data.directors || []);
    } catch (e) {
      toast.error(e?.response?.status === 403 ? 'Admin access required' : 'Failed to load directors');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    adminApi.get('/admin/settings').then((r) => setEngine(r.data?.booking_engine || 'pb')).catch(() => {});
  }, []);

  const openNew = () => navigate('/admin/scheduling/directors/new');
  const openEdit = (d) => navigate(`/admin/scheduling/directors/${d.director_id}`);

  const deactivate = async (d) => {
    if (!(await confirmDialog({ title: `Deactivate ${d.name}?`, message: 'Existing bookings keep this director; they just stop receiving new ones.', confirmLabel: 'Deactivate' }))) return;
    try { await adminApi.del(`/admin/directors/${d.director_id}`); toast.success('Director deactivated'); load(); }
    catch { toast.error('Deactivate failed'); }
  };

  const activate = async (d) => {
    try { await adminApi.put(`/admin/directors/${d.director_id}`, { active: true }); toast.success('Director activated'); load(); }
    catch { toast.error('Activate failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Directors of Admissions — availability rules, time off, and each one&apos;s Google calendar.</p>
        <Button size="sm" onClick={openNew}><Plus className="size-4" /> Add director</Button>
      </div>

      {engine === 'pb' && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          Booking engine is <strong>Practice Better (legacy)</strong>: patient availability comes from each
          active director&apos;s own Practice Better schedule (via their <strong>PB consultant ID</strong> below).
          The weekly hours, time off, and date overrides here apply only when the engine is Portal (local).
        </div>
      )}

      <div className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b hover:bg-transparent" style={{ backgroundImage: HEADER_GRADIENT }}>
              <TableHead className={HEAD}>Name</TableHead>
              <TableHead className={HEAD}>Timezone</TableHead>
              <TableHead className={HEAD}>Calendar</TableHead>
              <TableHead className={HEAD}>Availability</TableHead>
              <TableHead className={HEAD}>Status</TableHead>
              <TableHead className={HEAD}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && directors.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : directors.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No directors yet. Add one to start taking bookings.</TableCell></TableRow>
            ) : directors.map((d) => {
              const active = d.active !== false;
              const rules = (d.weekly_rules || []).length;
              const overrides = (d.date_overrides || []).length;
              return (
                <TableRow key={d.director_id} className="cursor-pointer" onClick={() => openEdit(d)}>
                  <TableCell className={`${CELL} font-medium text-foreground`}>{d.name}</TableCell>
                  <TableCell className={`${CELL} text-muted-foreground`}>{d.timezone}</TableCell>
                  <TableCell className={CELL}>
                    {d.google_calendar_id
                      ? <span className="block max-w-[220px] truncate text-xs text-muted-foreground">{d.google_calendar_id}</span>
                      : <span className="text-xs font-medium text-amber-700">Not set</span>}
                  </TableCell>
                  <TableCell className={`${CELL} text-xs text-muted-foreground`}>
                    {rules} weekly rule{rules === 1 ? '' : 's'}{overrides > 0 ? ` · ${overrides} override${overrides === 1 ? '' : 's'}` : ''}
                  </TableCell>
                  <TableCell className={`${CELL} text-center`}>
                    <span className={`font-semibold ${active ? 'text-emerald-700' : 'text-red-700'}`}>{active ? 'Active' : 'Inactive'}</span>
                  </TableCell>
                  <TableCell className={`${CELL} text-center`} onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontalIcon />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(d)}>Edit</DropdownMenuItem>
                        {active
                          ? <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deactivate(d)}>Deactivate</DropdownMenuItem>
                          : <DropdownMenuItem onClick={() => activate(d)}>Activate</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
