import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getPatients, createPatient, deletePatient, searchPbClients } from '../lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Search, Trash2, ArrowUpRight, UserPlus, Users, X, ArrowDownAZ, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader, { PageContainer } from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import '../styles/patient-workspace.css';

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newPatient, setNewPatient] = useState({ name: '', email: '', phone: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [pbQuery, setPbQuery] = useState('');
  const [pbResults, setPbResults] = useState([]);
  const [pbLoading, setPbLoading] = useState(false);
  const [pbError, setPbError] = useState(false);
  const requestGeneration = useRef(0);
  const activeSearch = useRef(search);
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    if (activeSearch.current !== search) return;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError('');
    try {
      const res = await getPatients(search);
      if (generation !== requestGeneration.current) return;
      setPatients(res.patients || []);
      setTotal(res.total || 0);
    } catch (err) {
      if (generation === requestGeneration.current) setError('Patient records could not be loaded. Please try again.');
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    activeSearch.current = search;
    setLoading(true);
    setError('');
    const timer = setTimeout(fetchData, search ? 250 : 0);
    return () => {
      clearTimeout(timer);
      ++requestGeneration.current;
      activeSearch.current = null;
    };
  }, [fetchData, search]);

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
      navigate(`/staff/supplements/patients/${result._id}`);
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
      <PageHeader title="Patients" subtitle="A clear view of every patient and their supplement plans.">
        <button onClick={() => setAddOpen(true)} data-testid="add-patient-button" className="pw-button pw-button-primary">
          <UserPlus size={15} /> Add patient
        </button>
      </PageHeader>

      <div className="pw-workspace">
        <section className="pw-panel" aria-labelledby="patient-directory-heading">
          <div className="pw-section-heading">
            <div>
              <div className="pw-eyebrow">Patient records</div>
              <h2 id="patient-directory-heading">Your patient directory</h2>
              <p>Open a record to review details, continue a plan, or start a new one.</p>
            </div>
            <span className="pw-count" aria-label={loading || error ? 'Patient count unavailable' : `${total} ${search ? 'matching ' : ''}patients`}>{loading || error ? '—' : total}</span>
          </div>

          <div className="pw-directory-toolbar">
            <div className="pw-search">
              <Search size={16} aria-hidden="true" />
              <Input
                aria-label="Search patients by name or email"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="patients-search"
              />
              {search && <button onClick={() => setSearch('')} aria-label="Clear patient search"><X size={14} /></button>}
            </div>
            <span className="pw-sort-label"><ArrowDownAZ size={15} aria-hidden="true" /> Name, A–Z</span>
          </div>

          <div className="pw-table-scroll" data-testid="patients-table" aria-busy={loading}>
            <table className="pw-records-table">
              <caption className="sr-only">Patient directory, sorted by name</caption>
              <thead><tr><th>Patient</th><th>Contact details</th><th>Plans</th><th className="pw-added-column">Added</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5}><div className="pw-empty-state pw-loading" role="status"><span className="pw-spinner" /> Loading patient records…</div></td></tr>
                ) : error ? (
                  <tr><td colSpan={5}>
                    <div className="pw-empty-state" role="alert">
                      <div className="pw-empty-icon"><AlertCircle size={24} strokeWidth={1.5} /></div>
                      <h3>Unable to load patients</h3>
                      <p>{error}</p>
                      <button onClick={fetchData} className="pw-button pw-button-secondary">Try again</button>
                    </div>
                  </td></tr>
                ) : patients.length === 0 ? (
                  <tr><td colSpan={5}>
                    <div className="pw-empty-state">
                      <div className="pw-empty-icon">{search ? <Search size={24} strokeWidth={1.5} /> : <Users size={24} strokeWidth={1.5} />}</div>
                      <h3>{search ? 'No matching patients' : 'Start with your first patient'}</h3>
                      <p>{search ? `No records match “${search}”. Try a different name or email address.` : 'Create a patient record to keep their details and supplement plans together.'}</p>
                      {search ? (
                        <button onClick={() => setSearch('')} className="pw-button pw-button-secondary">Clear search</button>
                      ) : (
                        <button onClick={() => setAddOpen(true)} className="pw-button pw-button-primary"><UserPlus size={15} /> Add patient</button>
                      )}
                    </div>
                  </td></tr>
                ) : patients.map(p => (
                  <tr key={p._id}>
                    <td>
                      <Link to={`/staff/supplements/patients/${p._id}`} className="pw-patient-link">
                        <span className="pw-avatar">{p.name?.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?'}</span>
                        <span><strong>{p.name}</strong><span className="pw-record-link">View patient record <ArrowUpRight size={11} /></span></span>
                      </Link>
                    </td>
                    <td><div className="pw-contact-stack"><span>{p.email || 'No email added'}</span><span>{p.phone || 'No phone added'}</span></div></td>
                    <td><span className={`pw-plan-count ${p.plan_count ? 'pw-plan-count-active' : ''}`}>{p.plan_count || 0} {p.plan_count === 1 ? 'plan' : 'plans'}</span></td>
                    <td className="pw-added-column pw-muted">{p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td><div className="pw-row-actions">
                      <button onClick={() => setDeleteId(p._id)} className="pw-icon-button pw-destructive" aria-label={`Delete ${p.name}`} title="Delete patient"><Trash2 size={14} /></button>
                      <Link to={`/staff/supplements/patients/${p._id}`} className="pw-icon-button" aria-label={`Open ${p.name}'s record`} title="Open patient record"><ArrowUpRight size={16} /></Link>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pw-table-footer" aria-live="polite">
            <span>{loading ? 'Updating directory…' : error ? 'Directory unavailable' : `${patients.length} of ${total} ${search ? 'matching ' : ''}patient${total === 1 ? '' : 's'}`}</span>
            <span>{error ? 'Your search has been kept.' : total > patients.length ? 'Search to find a specific patient.' : 'Patient details and plans, in one place.'}</span>
          </div>
        </section>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="supp-theme pw-dialog max-w-[520px] p-0 gap-0 overflow-hidden">
          <DialogHeader className="pw-dialog-header">
            <div className="pw-eyebrow">Patient records</div>
            <DialogTitle>Add a patient</DialogTitle>
            <DialogDescription>Create a record to organise their supplement plans.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAdd(); }}>
            <div className="pw-dialog-fields">
              <div className="pw-import-field">
                <Label htmlFor="portal-patient-search">Import details from Practice Better</Label>
                <div className="pw-search">
                  <Search size={15} aria-hidden="true" />
                  <Input id="portal-patient-search" value={pbQuery} onChange={(e) => setPbQuery(e.target.value)} placeholder="Search portal by name or email…" data-testid="patient-pb-search" autoFocus />
                </div>
                <p className="pw-field-hint">Search with at least two characters, or add details below.</p>
                {(pbLoading || pbError) && <p className="pw-field-hint" role="status">{pbLoading ? 'Searching…' : 'Portal search unavailable — enter details below.'}</p>}
                {pbResults.length > 0 && (
                  <div className="pw-portal-results">
                    {pbResults.map((c) => (
                      <button key={c.record_id} type="button" onClick={() => pickPbClient(c)} data-testid="patient-pb-result">
                        <strong>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unnamed'}</strong>
                        <span>{c.email || ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="pw-field"><Label htmlFor="new-patient-name">Full name <span aria-hidden="true">*</span></Label><Input id="new-patient-name" value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} placeholder="e.g. Alex Morgan" data-testid="patient-form-name" autoComplete="name" required /></div>
              <div className="pw-form-columns">
                <div className="pw-field"><Label htmlFor="new-patient-email">Email <span className="pw-optional">Optional</span></Label><Input id="new-patient-email" type="email" value={newPatient.email} onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })} placeholder="patient@example.com" autoComplete="email" /></div>
                <div className="pw-field"><Label htmlFor="new-patient-phone">Phone <span className="pw-optional">Optional</span></Label><Input id="new-patient-phone" type="tel" value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} placeholder="Phone number" autoComplete="tel" /></div>
              </div>
              <div className="pw-field"><Label htmlFor="new-patient-notes">Notes <span className="pw-optional">Optional</span></Label><textarea id="new-patient-notes" value={newPatient.notes} onChange={(e) => setNewPatient({ ...newPatient, notes: e.target.value })} placeholder="Add useful context for their care…" rows={3} /></div>
            </div>
            <DialogFooter className="pw-dialog-footer">
              <button type="button" onClick={() => setAddOpen(false)} className="pw-button pw-button-secondary">Cancel</button>
              <button type="submit" disabled={saving} data-testid="patient-form-submit" className="pw-button pw-button-primary">{saving ? 'Adding…' : 'Create patient record'}<ArrowUpRight size={15} /></button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete this patient?" description="This will also delete all their plans. This cannot be undone." confirmLabel="Delete patient" destructive onConfirm={handleDelete} />
    </PageContainer>
  );
}
