import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPatients, createPatient, deletePatient, searchPbClients } from '../lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Search, Trash2, ChevronRight, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader, { PageContainer } from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newPatient, setNewPatient] = useState({ name: '', email: '', phone: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [pbQuery, setPbQuery] = useState('');
  const [pbResults, setPbResults] = useState([]);
  const [pbLoading, setPbLoading] = useState(false);
  const [pbError, setPbError] = useState(false);
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPatients(search);
      setPatients(res.patients || []);
      setTotal(res.total || 0);
    } catch (err) { toast.error('Failed to load patients'); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset portal search whenever the Add dialog closes
  useEffect(() => {
    if (!addOpen) { setPbQuery(''); setPbResults([]); setPbError(false); setPbLoading(false); }
  }, [addOpen]);

  // Debounced portal patient search
  useEffect(() => {
    if (!addOpen || pbQuery.trim().length < 2) { setPbResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setPbLoading(true);
      try {
        const res = await searchPbClients(pbQuery.trim());
        if (cancelled) return;
        setPbResults(res.clients || []);
        setPbError(false);
      } catch (err) {
        if (cancelled) return;
        setPbResults([]);
        setPbError(true);
      } finally {
        if (!cancelled) setPbLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pbQuery, addOpen]);

  const pickPbClient = (c) => {
    setNewPatient({
      ...newPatient,
      name: [c.first_name, c.last_name].filter(Boolean).join(' '),
      email: c.email || '',
      phone: c.phone || '',
    });
    setPbQuery('');
    setPbResults([]);
  };

  const handleAdd = async () => {
    if (!newPatient.name.trim()) { toast.error('Patient name is required'); return; }
    setSaving(true);
    try {
      const result = await createPatient(newPatient);
      toast.success('Patient added');
      setAddOpen(false);
      setNewPatient({ name: '', email: '', phone: '', notes: '' });
      navigate(`/patients/${result._id}`);
    } catch (err) { toast.error(err.message || 'Failed to add patient'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await deletePatient(deleteId); toast.success('Patient deleted'); fetchData(); }
    catch (err) { toast.error(err.message || 'Delete failed'); }
    finally { setDeleteId(null); }
  };

  return (
    <PageContainer>
      <PageHeader title="Patients" subtitle={`${total} patient${total !== 1 ? 's' : ''}`}>
        <button
          onClick={() => setAddOpen(true)}
          data-testid="add-patient-button"
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[13px] font-medium bg-[color:var(--accent-teal)] text-white hover:bg-[color:var(--accent-teal-hover)] transition-colors shadow-[var(--shadow-xs)]"
        >
          <UserPlus size={14} /> Add patient
        </button>
      </PageHeader>

      <div className="px-8 py-6">
        <div className="relative max-w-[360px] mb-4">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <Input
            placeholder="Search patients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="patients-search"
            className="pl-9 h-9 text-[13px] bg-white"
          />
        </div>

        <div
          className="rounded-lg border hairline surface overflow-hidden shadow-[var(--shadow-xs)]"
          data-testid="patients-table"
        >
          <div
            className="grid items-center h-9 px-5 hairline-b text-[10px] font-semibold tracking-[0.09em] uppercase text-[color:var(--accent-teal)]"
            style={{
              gridTemplateColumns: 'minmax(200px,1.5fr) 1fr 160px 80px 60px',
              background: 'linear-gradient(90deg, rgba(13,95,104,0.08) 0%, rgba(70,152,157,0.12) 50%, rgba(13,95,104,0.08) 100%)',
            }}
          >
            <span>Name</span>
            <span>Email</span>
            <span>Phone</span>
            <span className="text-center">Plans</span>
            <span />
          </div>

          {loading ? (
            <div className="h-40 flex items-center justify-center gap-2 text-[12px] text-ink-muted">
              <div className="w-4 h-4 border-2 border-[color:var(--accent-teal)] border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : patients.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-ink-subtle">
              <UserPlus size={28} strokeWidth={1.4} className="text-ink-faint" />
              <p className="text-[13px] text-ink-muted">No patients yet</p>
              <button
                onClick={() => setAddOpen(true)}
                className="h-8 px-3.5 rounded-md text-[12.5px] font-medium bg-[color:var(--accent-teal)] text-white hover:bg-[color:var(--accent-teal-hover)]"
              >
                Add your first patient
              </button>
            </div>
          ) : (
            patients.map(p => (
              <div
                key={p._id}
                onClick={() => navigate(`/patients/${p._id}`)}
                className="grid items-center min-h-[48px] px-5 py-1.5 border-b border-[color:var(--hairline)] last:border-b-0 row-hover cursor-pointer transition-colors group"
                style={{ gridTemplateColumns: 'minmax(200px,1.5fr) 1fr 160px 80px 60px' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-[color:var(--accent-teal-wash)] flex items-center justify-center text-[11px] font-semibold text-[color:var(--accent-teal)] shrink-0">
                    {p.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <span className="text-[13px] font-medium text-ink truncate">{p.name}</span>
                </div>
                <span className="text-[12.5px] text-ink-muted truncate">{p.email || '—'}</span>
                <span className="text-[12.5px] text-ink-muted truncate">{p.phone || '—'}</span>
                <span className="text-center">
                  <span className="inline-flex items-center justify-center h-5 min-w-[24px] px-1.5 rounded bg-[color:var(--accent-teal-wash)] text-[10.5px] font-semibold text-[color:var(--accent-teal)]">
                    {p.plan_count || 0}
                  </span>
                </span>
                <span className="flex items-center justify-end gap-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteId(p._id); }}
                    className="h-7 w-7 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity text-ink-subtle hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={13} />
                  </button>
                  <ChevronRight size={14} className="text-ink-faint" />
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add patient dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-[460px] p-0 gap-0 overflow-hidden rounded-xl border hairline shadow-[var(--shadow-lg)]">
          <DialogHeader className="px-6 pt-6 pb-4 space-y-1">
            <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Add patient</DialogTitle>
            <DialogDescription className="text-[13px] text-ink-muted">
              Search the portal's patient list to prefill, or enter details manually.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-5 grid gap-3.5">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Search portal patients</Label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                <Input
                  value={pbQuery}
                  onChange={(e) => setPbQuery(e.target.value)}
                  className="pl-9 h-9 text-[13px]"
                  placeholder="Search Practice Better by name or email…"
                  data-testid="patient-pb-search"
                  autoFocus
                />
              </div>
              {(pbLoading || pbError) && (
                <p className="text-[11.5px] text-ink-subtle">
                  {pbLoading ? 'Searching…' : 'Portal search unavailable — enter details manually'}
                </p>
              )}
              {pbResults.length > 0 && (
                <div className="rounded-md border hairline overflow-hidden max-h-[176px] overflow-y-auto">
                  {pbResults.map((c) => (
                    <button
                      key={c.record_id}
                      type="button"
                      onClick={() => pickPbClient(c)}
                      data-testid="patient-pb-result"
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[color:var(--surface-hover)] border-b border-[color:var(--hairline)] last:border-b-0"
                    >
                      <span className="text-[12.5px] font-medium text-ink truncate">
                        {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unnamed'}
                      </span>
                      <span className="text-[11.5px] text-ink-muted truncate max-w-[45%]">{c.email || ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Full name <span className="text-red-600">*</span></Label>
              <Input
                value={newPatient.name}
                onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                className="h-9 text-[13px]"
                placeholder="e.g. John Smith"
                data-testid="patient-form-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Email</Label>
              <Input
                type="email"
                value={newPatient.email}
                onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                className="h-9 text-[13px]"
                placeholder="patient@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Phone</Label>
              <Input
                value={newPatient.phone}
                onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                className="h-9 text-[13px]"
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Notes</Label>
              <Input
                value={newPatient.notes}
                onChange={(e) => setNewPatient({ ...newPatient, notes: e.target.value })}
                className="h-9 text-[13px]"
                placeholder="Any relevant notes"
              />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 bg-[color:var(--surface-hover)] hairline-t gap-2">
            <button
              onClick={() => setAddOpen(false)}
              className="h-9 px-4 rounded-md text-[13px] font-medium border hairline bg-white hover:bg-[color:var(--surface-subtle)] text-ink-3 hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              data-testid="patient-form-submit"
              className="h-9 px-4 rounded-md text-[13px] font-semibold bg-[color:var(--accent-teal)] hover:bg-[color:var(--accent-teal-hover)] text-white disabled:opacity-60"
            >
              {saving ? 'Adding…' : 'Add patient'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Delete this patient?"
        description="This will also delete all their plans. This cannot be undone."
        confirmLabel="Delete patient"
        destructive
        onConfirm={handleDelete}
      />
    </PageContainer>
  );
}
