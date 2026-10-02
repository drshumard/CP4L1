import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { getPlans, getPlanCreators, deletePlan, duplicatePlan } from '../lib/api';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ArrowRight, ArrowUpRight, Check, Copy, FileText, Layers, MoreHorizontal, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatPlanDuration } from '../lib/utils';
import PageHeader, { PageContainer } from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import '../styles/plan-overview.css';

const base = '/staff/supplements';
const PAGE_SIZE = 12;
const initials = name => (name || '?').trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase();
const date = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function DashboardPage() {
  const [plans, setPlans] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [overview, setOverview] = useState(null);
  const [knownPrograms, setKnownPrograms] = useState(['Detox 1', 'Detox 2', 'Maintenance']);
  const [search, setSearch] = useState('');
  const [program, setProgram] = useState('all');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [creators, setCreators] = useState([]);
  const [selectedCreator, setSelectedCreator] = useState('mine');
  const requestId = useRef(0);
  const overviewId = useRef(0);
  const navigate = useNavigate();
  const { user } = useAuth();

  const fetchPlans = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setError(false);
    try {
      const createdBy = selectedCreator === 'mine' ? (user?._id || '') : selectedCreator === 'all' ? '' : selectedCreator;
      const res = await getPlans(searchQuery, program === 'all' ? '' : program, status === 'all' ? '' : status, createdBy, { skip: page * PAGE_SIZE, limit: PAGE_SIZE });
      if (id !== requestId.current) return;
      setPlans(res.plans || []); setTotal(res.total || 0);
      setKnownPrograms(current => [...new Set([...current, ...(res.plans || []).map(p => p.program_name).filter(Boolean)])].sort());
    } catch { if (id === requestId.current) setError(true); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [selectedCreator, user?._id, searchQuery, program, status, page]);
  useEffect(() => { const timer = setTimeout(() => { setSearchQuery(search.trim()); setPage(0); }, 250); return () => clearTimeout(timer); }, [search]);
  const fetchOverview = useCallback(async () => {
    const id = ++overviewId.current;
    const owner = selectedCreator === 'mine' ? (user?._id || '') : selectedCreator === 'all' ? '' : selectedCreator;
    setOverview(null);
    try {
      const [all, draft, final] = await Promise.all([getPlans('', '', '', owner, { limit: 1 }), getPlans('', '', 'draft', owner, { limit: 1 }), getPlans('', '', 'finalized', owner, { limit: 1 })]);
      if (id === overviewId.current) setOverview({ total: all.total || 0, drafts: draft.total || 0, finalized: final.total || 0, recentDraft: draft.plans?.[0] });
    } catch { /* The register presents its own recoverable error state. */ }
  }, [selectedCreator, user?._id]);
  useEffect(() => { fetchOverview(); return () => { overviewId.current++; }; }, [fetchOverview]);
  useEffect(() => { fetchPlans(); return () => { requestId.current++; }; }, [fetchPlans]);
  useEffect(() => { let active = true; getPlanCreators().then(res => { if (active) setCreators(res.creators || []); }).catch(() => {}); return () => { active = false; }; }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await deletePlan(deleteId); toast.success('Plan deleted'); if (plans.length === 1 && page > 0) setPage(page - 1); else fetchPlans(); fetchOverview(); }
    catch { toast.error('Could not delete the plan. Please try again.'); }
    finally { setDeleteId(null); }
  };
  const handleDuplicate = async planId => {
    try { const result = await duplicatePlan(planId, { target: 'same' }); toast.success('Plan duplicated'); navigate(`${base}/plans/${result._id}`); }
    catch { toast.error('Could not duplicate the plan. Please try again.'); }
  };
  const recentDraft = overview?.recentDraft;
  const programs = knownPrograms;
  const visible = plans;
  const filtered = search || program !== 'all' || status !== 'all';
  const clearFilters = () => { setSearch(''); setSearchQuery(''); setProgram('all'); setStatus('all'); setPage(0); };
  const changeStatus = value => { setStatus(value); setPage(0); };
  const counts = { all: overview?.total, draft: overview?.drafts, finalized: overview?.finalized };

  return <PageContainer>
    <PageHeader title="Your plan workspace" subtitle="Build a protocol, refine the details, and keep every patient's next step in view.">
      <Link className="supp-button supp-button-primary" to={`${base}/plans/new`} data-testid="plans-create-new-button"><Plus size={14} />Create a plan</Link>
    </PageHeader>
    <div className="po-content">
      <div className="po-overview">
        <section className="po-stats" aria-label="Plan overview">
          {[{ key: 'all', label: 'All plans', count: overview?.total, hint: 'In this workspace', icon: FileText }, { key: 'draft', label: 'In progress', count: overview?.drafts, hint: 'Ready to continue', icon: Layers }, { key: 'finalized', label: 'Finalized', count: overview?.finalized, hint: 'Completed protocols', icon: Check }].map(item => <button key={item.key} type="button" className="po-stat" aria-pressed={status === item.key} onClick={() => changeStatus(item.key)}>
            <span className="po-stat-label">{item.label}<item.icon size={14} strokeWidth={1.5} /></span><strong>{!overview ? '—' : String(item.count).padStart(2, '0')}</strong><span className="po-stat-hint">{item.hint}<ArrowUpRight size={12} /></span>
          </button>)}
        </section>
        <section className="po-continue">
          <div className="po-continue-label"><span />{loading ? 'Your next step' : recentDraft && !error ? 'Pick up where you left off' : 'A clear starting point'}</div>
          <h2>{loading ? 'Loading your workspace…' : recentDraft && !error ? recentDraft.patient_name || 'Untitled plan' : 'Start with your patient.'}</h2>
          <p>{recentDraft && !error && !loading ? `${recentDraft.program_name} · ${recentDraft.step_label || `Step ${recentDraft.step_number || 1}`}` : 'Turn a protocol template into a plan that fits.'}</p>
          <Link to={recentDraft && !error && !loading ? `${base}/plans/${recentDraft._id}` : `${base}/plans/new`}>{recentDraft && !error && !loading ? 'Continue plan' : 'Create a plan'}<ArrowRight size={15} /></Link>
        </section>
      </div>
      <section className="po-register" aria-labelledby="plan-register-title">
        <div className="po-register-head"><div><h2 id="plan-register-title">Plan register</h2><p>All the details, from first draft to final plan.</p></div>
          <Select value={selectedCreator} onValueChange={value => { setSelectedCreator(value); setPage(0); }}><SelectTrigger className="po-owner" aria-label="Plan owner"><UserRound size={14} /><SelectValue /></SelectTrigger><SelectContent className="supp-theme"><SelectItem value="mine">My plans</SelectItem><SelectItem value="all">Everyone's plans</SelectItem>{creators.filter(c => c.user_id !== user?._id).map(c => <SelectItem key={c.user_id} value={c.user_id}>{c.name || 'Team member'}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="po-toolbar">
          <div className="po-tabs" role="group" aria-label="Filter plans by status">{[['all', 'All plans'], ['draft', 'In progress'], ['finalized', 'Finalized']].map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => changeStatus(value)}>{label}<span>{counts[value] ?? '—'}</span></button>)}</div>
          <div className="po-filters"><label className="po-search"><Search size={14} /><Input aria-label="Search plans" placeholder="Search patients…" value={search} onChange={e => setSearch(e.target.value)} data-testid="plans-search-input" />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={13} /></button>}</label>
            <Select value={program} onValueChange={value => { setProgram(value); setPage(0); }}><SelectTrigger className="po-program" aria-label="Filter by program" data-testid="plans-filter-program"><SelectValue placeholder="All programs" /></SelectTrigger><SelectContent className="supp-theme"><SelectItem value="all">All programs</SelectItem>{programs.map(p => <SelectItem value={p} key={p}>{p}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
        {loading ? <div className="supp-empty" role="status"><FileText size={25} strokeWidth={1.3} /><p>Loading plans…</p></div> : error ? <div className="supp-empty" role="alert"><h3>We couldn't load your plans</h3><p>Your work is still there. Check your connection and try again.</p><button className="supp-button" onClick={() => { fetchPlans(); fetchOverview(); }}>Try again</button></div> : !visible.length ? <div className="supp-empty"><FileText size={30} strokeWidth={1.2} /><h3>{filtered ? 'No plans match these filters' : 'A new plan starts here'}</h3><p>{filtered ? 'Try another patient, program, or status to find the plan you need.' : 'Choose a patient and a protocol. Then make the plan their own.'}</p>{filtered ? <button className="supp-button" onClick={clearFilters}>Clear filters</button> : <Link className="supp-button supp-button-primary" to={`${base}/plans/new`}><Plus size={14} />Create your first plan</Link>}</div> : <div className="supp-table-wrap" data-testid="plans-table"><table className="supp-table"><caption className="sr-only">Supplement plans, most recently updated first</caption><thead><tr><th scope="col">Patient</th><th scope="col">Protocol</th><th scope="col">Duration</th><th scope="col">Status</th><th scope="col" className="number">Program total</th><th scope="col">Last updated</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map(plan => <tr key={plan._id}>
          <td><div className="po-patient"><span className="po-initials">{initials(plan.patient_name)}</span><Link to={`${base}/plans/${plan._id}`}>{plan.patient_name || 'Untitled plan'}<small>View plan<ArrowUpRight size={10} /></small></Link></div></td>
          <td><span className="po-protocol">{plan.program_name || 'Custom protocol'}</span><small>{plan.step_label || `Step ${plan.step_number || 1}`}</small></td>
          <td className="po-duration">{formatPlanDuration(plan.months)}</td>
          <td><span className="supp-status" data-status={plan.status} data-testid={`plan-status-${plan._id}`}>{plan.status === 'finalized' ? 'Finalized' : 'Draft'}</span></td>
          <td className="number po-cost">{formatCurrency(plan.total_program_cost)}</td><td className="po-date">{date(plan.updated_at || plan.created_at)}</td>
          <td><DropdownMenu><DropdownMenuTrigger asChild><button className="po-more" aria-label={`Actions for ${plan.patient_name || 'untitled plan'}`}><MoreHorizontal size={17} /></button></DropdownMenuTrigger><DropdownMenuContent className="supp-theme" align="end"><DropdownMenuItem onSelect={() => navigate(`${base}/plans/${plan._id}`)}><ArrowUpRight size={14} />Open plan</DropdownMenuItem><DropdownMenuItem onSelect={() => handleDuplicate(plan._id)} data-testid={`duplicate-plan-${plan._id}`}><Copy size={14} />Duplicate plan</DropdownMenuItem><DropdownMenuItem className="text-red-700" onSelect={() => setDeleteId(plan._id)} data-testid={`delete-plan-${plan._id}`}><Trash2 size={14} />Delete plan</DropdownMenuItem></DropdownMenuContent></DropdownMenu></td>
        </tr>)}</tbody></table></div>}
        <footer className="po-table-footer"><span>{loading ? 'Loading…' : error ? 'Plans unavailable' : `${total ? page * PAGE_SIZE + 1 : 0}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total} plans`}</span><div className="po-pagination"><span>Most recently updated first</span><button onClick={() => setPage(p => p - 1)} disabled={page === 0 || loading}>Previous</button><button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total || loading}>Next</button></div></footer>
      </section>
      <div className="po-shortcuts"><Link to={`${base}/patients`}><UserRound size={16} /><span>Patient directory<small>Keep records and plan history together.</small></span><ArrowUpRight size={15} /></Link>{user?.role === 'admin' && <Link to={`${base}/admin/templates`}><Layers size={16} /><span>Protocol templates<small>A consistent foundation for individual care.</small></span><ArrowUpRight size={15} /></Link>}</div>
    </div>
    <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Delete this plan?" description="This permanently deletes the plan and its supplement schedule. The patient record will remain." confirmLabel="Delete plan" destructive onConfirm={handleDelete} />
  </PageContainer>;
}
