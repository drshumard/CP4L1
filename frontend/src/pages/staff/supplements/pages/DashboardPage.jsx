import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { getPlans, getPlanCreators, deletePlan, duplicatePlan } from '../lib/api';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Search, Trash2, FileText, Copy, Users, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '../lib/utils';
import PageHeader, { PageContainer } from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';

export default function DashboardPage() {
  const [plans, setPlans] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [program, setProgram] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState(null);
  const [creators, setCreators] = useState([]);
  const [selectedCreator, setSelectedCreator] = useState('mine');
  const navigate = useNavigate();
  const { user } = useAuth();

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const createdBy = selectedCreator === 'mine' ? (user?._id || '') : selectedCreator === 'all' ? '' : selectedCreator;
      const res = await getPlans(search, program === 'all' ? '' : program, '', createdBy);
      setPlans(res.plans || []); setTotal(res.total || 0);
    } catch (err) { toast.error('Failed to load plans'); }
    finally { setLoading(false); }
  }, [search, program, selectedCreator, user]);

  const fetchCreators = useCallback(async () => {
    try { const res = await getPlanCreators(); setCreators(res.creators || []); } catch {}
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);
  useEffect(() => { fetchCreators(); }, [fetchCreators]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await deletePlan(deleteId); toast.success('Plan deleted'); fetchPlans(); }
    catch (err) { toast.error('Delete failed'); }
    finally { setDeleteId(null); }
  };

  const handleDuplicate = async (e, planId) => {
    e.stopPropagation();
    try { const result = await duplicatePlan(planId, { target: 'same' }); toast.success('Plan duplicated'); navigate(`/plans/${result._id}`); }
    catch (err) { toast.error('Duplicate failed'); }
  };

  const otherCreators = creators.filter(c => c.user_id !== user?._id);

  const creatorTab = (active) =>
    `h-7 px-3 rounded-md text-[12px] font-medium transition-colors flex items-center gap-1.5 ${
      active
        ? 'bg-[color:var(--accent-teal)] text-white shadow-[var(--shadow-xs)]'
        : 'text-ink-muted hover:text-ink hover:bg-[color:var(--surface-hover)]'
    }`;

  const subtitle =
    selectedCreator === 'mine' ? `My plans · ${total}` :
    selectedCreator === 'all' ? `All plans · ${total}` :
    `${creators.find(c => c.user_id === selectedCreator)?.name || '…'} · ${total}`;

  return (
    <PageContainer>
      <PageHeader title="Dashboard" subtitle={subtitle}>
        <button
          onClick={() => navigate('/staff/supplements/plans/new')}
          data-testid="plans-create-new-button"
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[13px] font-medium bg-[color:var(--accent-teal)] text-white hover:bg-[color:var(--accent-teal-hover)] transition-colors shadow-[var(--shadow-xs)]"
        >
          <Plus size={14} /> New plan
        </button>
      </PageHeader>

      <div className="px-8 py-6">
        {/* Creator tabs */}
        <div className="flex items-center gap-1 mb-4 p-1 rounded-lg bg-[color:var(--surface-hover)] hairline border w-fit">
          <button onClick={() => setSelectedCreator('mine')} className={creatorTab(selectedCreator === 'mine')}>
            My plans
          </button>
          {otherCreators.map(c => (
            <button key={c.user_id} onClick={() => setSelectedCreator(c.user_id)} className={creatorTab(selectedCreator === c.user_id)}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-semibold ${
                selectedCreator === c.user_id ? 'bg-white/20 text-white' : 'bg-[color:var(--accent-teal-wash)] text-[color:var(--accent-teal)]'
              }`}>
                {c.name?.charAt(0) || '?'}
              </span>
              {c.name}
              <span className={`text-[10px] ${selectedCreator === c.user_id ? 'text-white/70' : 'text-ink-subtle'}`}>
                {c.plan_count}
              </span>
            </button>
          ))}
          <button onClick={() => setSelectedCreator('all')} className={creatorTab(selectedCreator === 'all')}>
            <Users size={12} /> All
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-[360px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <Input
              placeholder="Search patients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="plans-search-input"
              className="pl-9 h-9 text-[13px] bg-white"
            />
          </div>
          <Select value={program} onValueChange={setProgram}>
            <SelectTrigger className="w-[180px] h-9 text-[13px] bg-white" data-testid="plans-filter-program">
              <SelectValue placeholder="All programs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All programs</SelectItem>
              <SelectItem value="Detox 1">Detox 1</SelectItem>
              <SelectItem value="Detox 2">Detox 2</SelectItem>
              <SelectItem value="Maintenance">Maintenance</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div
          className="rounded-lg border hairline surface overflow-hidden shadow-[var(--shadow-xs)]"
          data-testid="plans-table"
        >
          <div
            className="grid items-center h-9 px-5 hairline-b text-[10px] font-semibold tracking-[0.09em] uppercase text-[color:var(--accent-teal)]"
            style={{
              gridTemplateColumns: 'minmax(180px,1.4fr) 1fr 100px 72px 110px 110px 140px 90px',
              background: 'linear-gradient(90deg, rgba(13,95,104,0.08) 0%, rgba(70,152,157,0.12) 50%, rgba(13,95,104,0.08) 100%)',
            }}
          >
            <span>Patient</span>
            <span>Program</span>
            <span>Step</span>
            <span className="text-center">Months</span>
            <span className="text-right">Total</span>
            <span>Status</span>
            <span>Updated</span>
            <span />
          </div>

          {loading ? (
            <div className="h-40 flex items-center justify-center gap-2 text-[12px] text-ink-muted">
              <div className="w-4 h-4 border-2 border-[color:var(--accent-teal)] border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : plans.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-ink-subtle">
              <FileText size={28} strokeWidth={1.4} className="text-ink-faint" />
              <p className="text-[13px] text-ink-muted">
                {selectedCreator === 'mine' ? 'No plans yet' : 'No plans found'}
              </p>
              {selectedCreator === 'mine' && (
                <button
                  onClick={() => navigate('/staff/supplements/plans/new')}
                  className="h-8 px-3.5 rounded-md text-[12.5px] font-medium bg-[color:var(--accent-teal)] text-white hover:bg-[color:var(--accent-teal-hover)]"
                >
                  Create your first plan
                </button>
              )}
            </div>
          ) : (
            plans.map(plan => (
              <div
                key={plan._id}
                onClick={() => navigate(`/plans/${plan._id}`)}
                className="grid items-center min-h-[44px] px-5 py-1.5 border-b border-[color:var(--hairline)] last:border-b-0 row-hover cursor-pointer transition-colors group"
                style={{ gridTemplateColumns: 'minmax(180px,1.4fr) 1fr 100px 72px 110px 110px 140px 90px' }}
              >
                <span className="text-[13px] font-medium text-ink truncate">{plan.patient_name || 'Untitled'}</span>
                <span className="text-[12.5px] text-ink-3 truncate">{plan.program_name}</span>
                <span className="text-[12.5px] text-ink-3 truncate">{plan.step_label || `Step ${plan.step_number}`}</span>
                <span className="font-mono tabular-nums text-[12.5px] text-ink-3 text-center">
                  {plan.months?.length || 0}
                </span>
                <span className="font-mono tabular-nums text-[13px] font-semibold text-ink text-right whitespace-nowrap">
                  {formatCurrency(plan.total_program_cost)}
                </span>
                <span>
                  <span
                    data-testid={`plan-status-${plan._id}`}
                    className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-semibold uppercase tracking-[0.08em] ${
                      plan.status === 'finalized'
                        ? 'bg-[color:var(--accent-teal-wash)] text-[color:var(--accent-teal)]'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                  >
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
                    data-testid={`duplicate-plan-${plan._id}`}
                    className="h-7 w-7 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity text-ink-subtle hover:text-[color:var(--accent-teal)] hover:bg-[color:var(--accent-teal-wash)]"
                    title="Duplicate"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteId(plan._id); }}
                    data-testid={`delete-plan-${plan._id}`}
                    className="h-7 w-7 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity text-ink-subtle hover:text-red-600 hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
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
        onConfirm={handleDelete}
      />
    </PageContainer>
  );
}
