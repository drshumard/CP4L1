import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { getPatient, updatePatient, deletePlan, duplicatePlan, saveAllPlansToDrive } from '../lib/api';
import { formatCurrency, formatPlanDuration } from '../lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft, Plus, Trash2, Copy, FileText, Pencil, Save, CloudUpload, ArrowUpRight, Mail, Phone, Check, Clock3, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader, { PageContainer } from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import '../styles/patient-workspace.css';

export default function PatientDetailPage() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [savingDrive, setSavingDrive] = useState(false);
  const [planFilter, setPlanFilter] = useState('all');
  const requestGeneration = useRef(0);
  const activePatientId = useRef(patientId);

  const handleSaveAllToDrive = async () => {
    setSavingDrive(true);
    try {
      const result = await saveAllPlansToDrive(patientId);
      toast.success(result.message);
    } catch (err) { toast.error(err.message || 'Drive save failed'); }
    finally { setSavingDrive(false); }
  };

  const fetchData = useCallback(async () => {
    if (activePatientId.current !== patientId) return;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError('');
    try {
      const res = await getPatient(patientId);
      if (generation !== requestGeneration.current) return;
      setPatient(res);
      setEditData({ name: res.name || '', email: res.email || '', phone: res.phone || '', notes: res.notes || '' });
    } catch (err) {
      if (generation !== requestGeneration.current) return;
      setPatient(null);
      setError('The patient record could not be loaded. Please try again.');
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    activePatientId.current = patientId;
    setPatient(null);
    setEditing(false);
    setPlanFilter('all');
    setDeleteId(null);
    fetchData();
    return () => {
      ++requestGeneration.current;
      activePatientId.current = null;
    };
  }, [fetchData, patientId]);

  const handleSave = async () => {
    if (!editData.name?.trim()) { toast.error('Patient name is required'); return; }
    setSaving(true);
    try {
      await updatePatient(patientId, editData);
      toast.success('Patient updated');
      setEditing(false);
      fetchData();
    } catch (err) { toast.error('Update failed'); }
    finally { setSaving(false); }
  };

  const handleDeletePlan = async () => {
    if (!deleteId) return;
    try { await deletePlan(deleteId); toast.success('Plan deleted'); fetchData(); }
    catch (err) { toast.error('Delete failed'); }
    finally { setDeleteId(null); }
  };

  const handleDuplicate = async (e, planId) => {
    e.stopPropagation();
    try { const r = await duplicatePlan(planId); toast.success('Plan duplicated'); navigate(`/staff/supplements/plans/${r._id}`); }
    catch (err) { toast.error('Duplicate failed'); }
  };

  if (loading || (patient && patient._id !== patientId)) {
    return <div className="pw-loading-page" role="status"><span className="pw-spinner" /> Loading patient record…</div>;
  }
  if (error) {
    return (
      <PageContainer>
        <PageHeader title="Patient record" subtitle="Patient details and supplement plan history." />
        <div className="pw-workspace">
          <Link to="/staff/supplements/patients" className="pw-back-link"><ArrowLeft size={14} /> All patients</Link>
          <div className="pw-panel pw-empty-state" role="alert">
            <div className="pw-empty-icon"><AlertCircle size={24} strokeWidth={1.5} /></div>
            <h3>Unable to load this patient</h3>
            <p>{error}</p>
            <button onClick={fetchData} className="pw-button pw-button-secondary">Try again</button>
          </div>
        </div>
      </PageContainer>
    );
  }
  if (!patient) return null;

  const plans = patient.plans || [];
  const draftCount = plans.filter(plan => (plan.status || 'draft') === 'draft').length;
  const finalizedCount = plans.filter(plan => plan.status === 'finalized').length;
  const visiblePlans = planFilter === 'all' ? plans : plans.filter(plan => (plan.status || 'draft') === planFilter);
  const newPlanUrl = `/staff/supplements/plans/new?patient_id=${patientId}&patient_name=${encodeURIComponent(patient.name)}`;
  const startEditing = () => {
    setEditData({ name: patient.name || '', email: patient.email || '', phone: patient.phone || '', notes: patient.notes || '' });
    setEditing(true);
  };

  return (
    <PageContainer>
      <PageHeader title={patient.name} subtitle="Patient details and supplement plan history.">
        <Link to={newPlanUrl} data-testid="new-plan-for-patient" className="pw-button pw-button-primary"><Plus size={16} /> Create plan</Link>
      </PageHeader>

      <div className="pw-workspace">
        <Link to="/staff/supplements/patients" className="pw-back-link"><ArrowLeft size={14} /> All patients</Link>
        <div className="pw-patient-layout">
          <aside className="pw-profile pw-panel" aria-labelledby="patient-details-heading">
            <div className="pw-profile-heading">
              <h2 id="patient-details-heading">Patient details</h2>
              {!editing && <button onClick={startEditing} className="pw-icon-button" aria-label="Edit patient details" title="Edit patient details"><Pencil size={14} /></button>}
            </div>
            <div className="pw-profile-identity">
              <div className="pw-avatar pw-avatar-large">{patient.name?.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?'}</div>
              <h3>{patient.name}</h3>
              <p>{patient.created_at ? `Patient since ${new Date(patient.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : 'Patient record'}</p>
            </div>
            {editing ? (
              <form className="pw-profile-edit" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                <div className="pw-field"><Label htmlFor="edit-patient-name">Full name</Label><Input id="edit-patient-name" value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} required autoComplete="name" autoFocus /></div>
                <div className="pw-field"><Label htmlFor="edit-patient-email">Email</Label><Input id="edit-patient-email" type="email" value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} autoComplete="email" /></div>
                <div className="pw-field"><Label htmlFor="edit-patient-phone">Phone</Label><Input id="edit-patient-phone" type="tel" value={editData.phone} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} autoComplete="tel" /></div>
                <div className="pw-field"><Label htmlFor="edit-patient-notes">Notes</Label><textarea id="edit-patient-notes" value={editData.notes} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} rows={4} /></div>
                <div className="pw-edit-actions">
                  <button type="button" onClick={() => setEditing(false)} className="pw-button pw-button-secondary">Cancel</button>
                  <button type="submit" disabled={saving} className="pw-button pw-button-primary"><Save size={14} /> {saving ? 'Saving…' : 'Save details'}</button>
                </div>
              </form>
            ) : (
              <>
                <dl className="pw-profile-contact">
                  <div><dt><Mail size={14} /> Email address</dt><dd>{patient.email ? <a href={`mailto:${patient.email}`}>{patient.email}</a> : <span className="pw-muted">Not added</span>}</dd></div>
                  <div><dt><Phone size={14} /> Phone number</dt><dd>{patient.phone ? <a href={`tel:${patient.phone}`}>{patient.phone}</a> : <span className="pw-muted">Not added</span>}</dd></div>
                </dl>
                <div className="pw-profile-notes">
                  <div className="pw-eyebrow">Notes</div>
                  {patient.notes ? <p>{patient.notes}</p> : <><p className="pw-muted">Keep useful context alongside their plans.</p><button onClick={startEditing} className="pw-text-button"><Plus size={13} /> Add a note</button></>}
                </div>
              </>
            )}
          </aside>

          <div className="pw-plan-workspace">
            <div className="pw-plan-summary" aria-label="Plan summary">
              <div><span><FileText size={14} /> Total plans</span><strong>{plans.length}</strong></div>
              <div><span><Clock3 size={14} /> In draft</span><strong>{draftCount}</strong></div>
              <div><span><Check size={14} /> Finalized</span><strong>{finalizedCount}</strong></div>
            </div>
            <section className="pw-panel" aria-labelledby="patient-plans-heading">
              <div className="pw-section-heading pw-plans-heading">
                <div><h2 id="patient-plans-heading">Supplement plans</h2><p>Review, continue, and build on this patient’s care.</p></div>
                {plans.length > 0 && <button onClick={handleSaveAllToDrive} disabled={savingDrive} data-testid="save-all-drive" className="pw-button pw-button-secondary">{savingDrive ? <span className="pw-spinner" /> : <CloudUpload size={14} />}{savingDrive ? 'Saving…' : 'Save all to Dropbox'}</button>}
              </div>
              <div className="pw-plan-toolbar">
                <div className="pw-filter-tabs" role="group" aria-label="Filter plans by status">
                  {[['all', 'All plans', plans.length], ['draft', 'Drafts', draftCount], ['finalized', 'Finalized', finalizedCount]].map(([value, label, count]) => (
                    <button key={value} onClick={() => setPlanFilter(value)} aria-pressed={planFilter === value}>{label}<span>{count}</span></button>
                  ))}
                </div>
                <span className="pw-sort-label">Latest updated first</span>
              </div>
              {visiblePlans.length === 0 ? (
                <div className="pw-empty-state">
                  <div className="pw-empty-icon"><FileText size={25} strokeWidth={1.5} /></div>
                  <h3>{plans.length ? `No ${planFilter} plans` : 'Their next step starts here'}</h3>
                  <p>{plans.length ? 'Switch to all plans to see the full plan history.' : 'Create their first supplement plan and tailor it to their care.'}</p>
                  {plans.length ? <button onClick={() => setPlanFilter('all')} className="pw-button pw-button-secondary">View all plans</button> : <Link to={newPlanUrl} className="pw-button pw-button-primary"><Plus size={15} /> Create first plan</Link>}
                </div>
              ) : (
                <div className="pw-plan-list">
                  {visiblePlans.map(plan => (
                    <article key={plan._id} className="pw-plan-row">
                      <div className="pw-plan-icon"><FileText size={19} strokeWidth={1.5} /></div>
                      <div className="pw-plan-content">
                        <div className="pw-plan-title-line"><Link to={`/staff/supplements/plans/${plan._id}`}>{plan.program_name || 'Untitled plan'}</Link><span className={`pw-status ${plan.status === 'finalized' ? 'pw-status-finalized' : 'pw-status-draft'}`}><span />{plan.status || 'draft'}</span></div>
                        <p>{plan.step_label || `Step ${plan.step_number || 1}`}<span>·</span>{formatPlanDuration(plan.months)}<span>·</span>Updated {plan.updated_at ? new Date(plan.updated_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
                        <div className="pw-plan-row-bottom"><span className="pw-plan-cost">{formatCurrency(plan.total_program_cost)} <span>plan total</span></span><Link to={`/staff/supplements/plans/${plan._id}`} className="pw-text-button">{plan.status === 'finalized' ? 'View plan' : 'Continue editing'}<ArrowUpRight size={14} /></Link></div>
                      </div>
                      <div className="pw-row-actions">
                        <button onClick={(e) => handleDuplicate(e, plan._id)} className="pw-icon-button" aria-label={`Duplicate ${plan.program_name || 'plan'}`} title="Duplicate plan"><Copy size={14} /></button>
                        <button onClick={() => setDeleteId(plan._id)} className="pw-icon-button pw-destructive" aria-label={`Delete ${plan.program_name || 'plan'}`} title="Delete plan"><Trash2 size={14} /></button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete this plan?" description="This action cannot be undone." confirmLabel="Delete plan" destructive onConfirm={handleDeletePlan} />
    </PageContainer>
  );
}
