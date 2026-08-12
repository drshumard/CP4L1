import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPatient, updatePatient, deletePlan, duplicatePlan, saveAllPlansToDrive } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft, Plus, Trash2, Copy, FileText, Pencil, Save, X, CloudUpload, Circle, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader, { PageContainer } from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';

export default function PatientDetailPage() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [savingDrive, setSavingDrive] = useState(false);

  const handleSaveAllToDrive = async () => {
    setSavingDrive(true);
    try {
      const result = await saveAllPlansToDrive(patientId);
      toast.success(result.message);
    } catch (err) { toast.error(err.message || 'Drive save failed'); }
    finally { setSavingDrive(false); }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPatient(patientId);
      setPatient(res);
      setEditData({ name: res.name || '', email: res.email || '', phone: res.phone || '', notes: res.notes || '' });
    } catch (err) { toast.error('Failed to load patient'); navigate('/staff/supplements/patients'); }
    finally { setLoading(false); }
  }, [patientId, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3rem)]">
        <div className="w-5 h-5 border-2 border-[color:var(--accent-teal)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!patient) return null;

  const plans = patient.plans || [];

  return (
    <PageContainer>
      <PageHeader
        title={patient.name}
        subtitle={[patient.email, patient.phone].filter(Boolean).join(' · ') || 'No contact info'}
      >
        <button
          onClick={() => navigate('/staff/supplements/patients')}
          className="h-8 w-8 flex items-center justify-center rounded-md text-ink-subtle hover:text-ink hover:bg-[color:var(--surface-hover)]"
          aria-label="Back"
        >
          <ArrowLeft size={15} />
        </button>
        {plans.length > 0 && (
          <button
            onClick={handleSaveAllToDrive}
            disabled={savingDrive}
            data-testid="save-all-drive"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium border hairline bg-white hover:bg-[color:var(--surface-hover)] text-ink-3 hover:text-ink disabled:opacity-60"
          >
            {savingDrive ? (
              <span className="w-3 h-3 border-[1.5px] border-[color:var(--accent-teal)] border-t-transparent rounded-full animate-spin" />
            ) : (
              <CloudUpload size={13} className="text-[color:var(--accent-teal)]" />
            )}
            {savingDrive ? 'Saving…' : 'Save all to Dropbox'}
          </button>
        )}
        <button
          onClick={() => navigate(`/staff/supplements/plans/new?patient_id=${patientId}&patient_name=${encodeURIComponent(patient.name)}`)}
          data-testid="new-plan-for-patient"
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[13px] font-medium bg-[color:var(--accent-teal)] text-white hover:bg-[color:var(--accent-teal-hover)] shadow-[var(--shadow-xs)]"
        >
          <Plus size={14} /> New plan
        </button>
      </PageHeader>

      <div className="px-8 py-6">
        {/* Patient info card */}
        <div className="rounded-lg border hairline surface overflow-hidden shadow-[var(--shadow-xs)] mb-6">
          <div
            aria-hidden
            className="h-[2px] w-full"
            style={{ background: 'linear-gradient(90deg, #0D5F68 0%, #46989D 50%, #0D5F68 100%)' }}
          />
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-[color:var(--accent-teal-wash)] flex items-center justify-center text-[16px] font-semibold text-[color:var(--accent-teal)] border border-[color:var(--accent-teal)]/15">
                {patient.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-ink tracking-[-0.01em] truncate">{patient.name}</h2>
                <p className="text-[12px] text-ink-muted truncate">
                  {patient.email || 'No email'}{patient.phone && ` · ${patient.phone}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium border hairline bg-white hover:bg-[color:var(--surface-hover)] text-ink-3 hover:text-ink"
                >
                  <Pencil size={12} /> Edit
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setEditing(false)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium border hairline bg-white hover:bg-[color:var(--surface-hover)] text-ink-3 hover:text-ink"
                  >
                    <X size={12} /> Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-semibold bg-[color:var(--accent-teal)] text-white hover:bg-[color:var(--accent-teal-hover)] disabled:opacity-60"
                  >
                    <Save size={12} /> {saving ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>
          {editing && (
            <div className="px-5 pb-5 pt-1 grid grid-cols-2 gap-4 hairline-t">
              <div className="space-y-1.5 pt-4">
                <Label className="text-[12px] font-medium text-ink-3">Name</Label>
                <Input value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} className="h-9 text-[13px]" />
              </div>
              <div className="space-y-1.5 pt-4">
                <Label className="text-[12px] font-medium text-ink-3">Email</Label>
                <Input value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} className="h-9 text-[13px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-ink-3">Phone</Label>
                <Input value={editData.phone} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} className="h-9 text-[13px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-ink-3">Notes</Label>
                <Input value={editData.notes} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} className="h-9 text-[13px]" />
              </div>
            </div>
          )}
          {!editing && patient.notes && (
            <div className="px-5 py-3 hairline-t text-[12.5px] text-ink-muted leading-relaxed">
              {patient.notes}
            </div>
          )}
        </div>

        {/* Plans */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-semibold text-ink tracking-[-0.01em]">
            Plans <span className="text-ink-subtle font-normal ml-1">{plans.length}</span>
          </h3>
        </div>

        <div className="rounded-lg border hairline surface overflow-hidden shadow-[var(--shadow-xs)]">
          <div
            className="grid items-center h-9 px-5 hairline-b text-[10px] font-semibold tracking-[0.09em] uppercase text-[color:var(--accent-teal)]"
            style={{
              gridTemplateColumns: 'minmax(160px,1.4fr) 100px 72px 110px 110px 140px 80px',
              background: 'linear-gradient(90deg, rgba(13,95,104,0.08) 0%, rgba(70,152,157,0.12) 50%, rgba(13,95,104,0.08) 100%)',
            }}
          >
            <span>Program</span>
            <span>Step</span>
            <span className="text-center">Months</span>
            <span className="text-right">Total</span>
            <span>Status</span>
            <span>Updated</span>
            <span />
          </div>

          {plans.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center gap-2 text-ink-subtle">
              <FileText size={24} strokeWidth={1.4} className="text-ink-faint" />
              <p className="text-[12.5px] text-ink-muted">No plans yet for this patient</p>
            </div>
          ) : (
            plans.map(plan => (
              <div
                key={plan._id}
                onClick={() => navigate(`/staff/supplements/plans/${plan._id}`)}
                className="grid items-center min-h-[44px] px-5 py-1.5 border-b border-[color:var(--hairline)] last:border-b-0 row-hover cursor-pointer transition-colors group"
                style={{ gridTemplateColumns: 'minmax(160px,1.4fr) 100px 72px 110px 110px 140px 80px' }}
              >
                <span className="text-[13px] font-medium text-ink truncate">{plan.program_name}</span>
                <span className="text-[12.5px] text-ink-3 truncate">{plan.step_label || `Step ${plan.step_number}`}</span>
                <span className="font-mono tabular-nums text-[12.5px] text-ink-3 text-center">{plan.months?.length || 0}</span>
                <span className="font-mono tabular-nums text-[13px] font-semibold text-ink text-right whitespace-nowrap">
                  {formatCurrency(plan.total_program_cost)}
                </span>
                <span>
                  <span className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-semibold uppercase tracking-[0.08em] ${
                    plan.status === 'finalized'
                      ? 'bg-[color:var(--accent-teal-wash)] text-[color:var(--accent-teal)]'
                      : 'bg-amber-50 text-amber-800'
                  }`}>
                    <Circle size={5} fill="currentColor" strokeWidth={0} />
                    {plan.status || 'draft'}
                  </span>
                </span>
                <span className="text-[12px] text-ink-muted">
                  {plan.updated_at ? new Date(plan.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </span>
                <span className="flex items-center justify-end gap-0.5">
                  <button
                    onClick={(e) => handleDuplicate(e, plan._id)}
                    className="h-7 w-7 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-ink-subtle hover:text-[color:var(--accent-teal)] hover:bg-[color:var(--accent-teal-wash)]"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteId(plan._id); }}
                    className="h-7 w-7 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-ink-subtle hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={13} />
                  </button>
                  <ChevronRight size={12} className="text-ink-faint" />
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Delete this plan?"
        description="This action cannot be undone."
        confirmLabel="Delete plan"
        destructive
        onConfirm={handleDeletePlan}
      />
    </PageContainer>
  );
}
