import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getTemplates, updateTemplate, createTemplate, deleteTemplate, getSupplements } from '../lib/api';
import { calculateDailyDosage, formatCurrency } from '../lib/utils';
import { getDoseSchedule, normalizeDosageEntry, updateDosageEntry } from '../lib/dosageParser';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Minus, Trash2, Save, Layers, Snowflake, GripVertical, AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader, { PageContainer } from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import '../styles/library-workspace.css';

const DEFAULT_PROGRAMS = ['Detox 1', 'Detox 2', 'Maintenance'];
const TIMES_ORDER = ['AM', 'Afternoon', 'PM'];
const DEFAULT_MONTH_OPTIONS = [0.5, ...Array.from({ length: 12 }, (_, index) => index + 1)];
const monthLabel = (number) => number === 0.5 ? '2 weeks' : number % 1 === 0.5 ? `Month ${Math.floor(number)} + 2 weeks` : `Month ${number}`;

const freqToTimes = (freq) => {
  if (freq >= 3) return ['AM', 'Afternoon', 'PM'];
  if (freq === 2) return ['AM', 'PM'];
  return ['AM'];
};

// Backend timestamps are naive UTC — append Z so they parse as UTC, not local
const parseTs = (d) => {
  if (!d) return null;
  const iso = typeof d === 'string' && !/(Z|[+-]\d{2}:?\d{2})$/.test(d) ? d + 'Z' : d;
  return new Date(iso);
};
const fmtDate = (d) => {
  const t = parseTs(d);
  return t ? t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
};
const fmtDateTime = (d) => {
  const t = parseTs(d);
  if (!t) return '—';
  return `${t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};

// Group by trimmed name (legacy docs may carry padding); duplicates of a step
// sort newest-updated first — the same one NewPlanPage uses for new plans
const templatesForProgram = (templates, program) =>
  templates
    .filter(t => (t.program_name || '').trim() === program)
    .sort((a, b) => (a.step_number - b.step_number) || (b.updated_at || '').localeCompare(a.updated_at || ''));

function NumberStepper({ value, onChange, min = 0, max = Infinity, label }) {
  const num = value ?? 0;
  return (
    <div className="lib-stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={num <= min} onClick={() => onChange(Math.max(min, num - 1))}><Minus size={12} /></button>
      <span aria-live="polite">{num}</span>
      <button type="button" aria-label={`Increase ${label}`} disabled={num >= max} onClick={() => onChange(num + 1)}><Plus size={12} /></button>
    </div>
  );
}

function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: 'relative', zIndex: isDragging ? 10 : 'auto' }}>
      {children({ ...attributes, ...listeners, ref: setActivatorNodeRef })}
    </div>
  );
}

function TemplateTextField({ value, onCommit, label, error, id, placeholder }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  return (
    <div className="lib-field">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={draft} onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { if (draft !== (value || '')) onCommit(draft); }}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        placeholder={placeholder} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
      {error && <p id={`${id}-error`} role="alert" className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}

function MonthAddSupplement({ monthNum, supplements, onAdd }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = supplements.filter(s =>
    s.supplement_name.toLowerCase().includes(q.toLowerCase()) ||
    s.company?.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="lib-button"
          type="button"
          data-add-supplement
        >
          <Plus size={13} /> Add supplement
        </button>
      </PopoverTrigger>
      <PopoverContent className="supp-theme w-[420px] max-w-[calc(100vw-32px)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search supplements…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>No supplements found.</CommandEmpty>
            <CommandGroup className="max-h-[260px] overflow-y-auto">
              {filtered.slice(0, 30).map(s => (
                <CommandItem
                  key={s._id}
                  value={s.supplement_name}
                  onSelect={() => { onAdd(monthNum, s); setOpen(false); setQ(''); }}
                  className="flex items-center justify-between cursor-pointer py-2"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink truncate">{s.supplement_name}</div>
                    <div className="text-[12px] text-ink-muted truncate">{s.company}</div>
                  </div>
                  <span className="text-[12px] tabular-nums text-ink-muted shrink-0 ml-3">
                    {formatCurrency(s.cost_per_bottle)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const makeSuppEntry = (supp) => {
  const freq = supp.default_frequency_per_day || 1;
  const times = freqToTimes(freq);
  return normalizeDosageEntry({
    supplement_id: supp._id,
    supplement_name: supp.supplement_name,
    company: supp.company || '',
    supplier: supp.supplier || '',
    unit_type: supp.unit_type || 'caps',
    quantity_per_dose: supp.default_quantity_per_dose || null,
    frequency_per_day: freq,
    dosage_display: supp.default_dosage_display || '',
    instructions: supp.default_instructions || '',
    units_per_bottle: supp.units_per_bottle || null,
    cost_per_bottle: supp.cost_per_bottle || 0,
    refrigerate: supp.refrigerate || false,
    times,
  });
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [supplements, setSupplements] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [currentTemplate, setCurrentTemplate] = useState(null);
  const [editMonths, setEditMonths] = useState(1);
  const [editSupps, setEditSupps] = useState([]);
  const [activeMonthNumber, setActiveMonthNumber] = useState(null);
  const monthPanelRef = useRef(null);
  const focusNewMonth = useRef(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingSelection, setPendingSelection] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ program_name: '', step_number: 1, default_months: 1 });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteSupp, setDeleteSupp] = useState(null);
  const [deleteFromAll, setDeleteFromAll] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const programNames = [...new Set([...DEFAULT_PROGRAMS, ...templates.map(t => (t.program_name || '').trim()).filter(Boolean)])].sort();
  const programTemplates = templatesForProgram(templates, selectedProgram);
  const stepCounts = programTemplates.reduce((acc, t) => {
    acc[t.step_number] = (acc[t.step_number] || 0) + 1;
    return acc;
  }, {});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [tRes, sRes] = await Promise.all([getTemplates(), getSupplements('', true)]);
      setTemplates(tRes.templates || []);
      setSupplements(sRes.supplements || []);
    } catch (err) { setError('Protocol templates could not be loaded. Please try again.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!selectedProgram && programNames.length > 0) {
      setSelectedProgram(programNames[0]);
    }
  }, [programNames, selectedProgram]);

  useEffect(() => {
    const list = templatesForProgram(templates, selectedProgram);
    const tmpl = list.find(t => t._id === selectedId) || list[0] || null;
    if ((tmpl?._id || '') !== selectedId) setSelectedId(tmpl?._id || '');
    setCurrentTemplate(tmpl);
    setEditMonths(tmpl?.default_months || 1);
    setEditSupps((tmpl?.months || []).map(month => ({ ...month, supplements: (month.supplements || []).map(normalizeDosageEntry) })));
  }, [selectedProgram, selectedId, templates]);

  useEffect(() => {
    setActiveMonthNumber(null);
    focusNewMonth.current = null;
  }, [selectedProgram, selectedId]);

  const activeMonth = editSupps.find(month => month.month_number === activeMonthNumber) || editSupps[0];
  const monthOptions = DEFAULT_MONTH_OPTIONS.includes(editMonths) ? DEFAULT_MONTH_OPTIONS : [...DEFAULT_MONTH_OPTIONS, editMonths].sort((a, b) => a - b);

  useEffect(() => {
    if (!activeMonth || focusNewMonth.current !== activeMonth.month_number) return;
    focusNewMonth.current = null;
    document.getElementById(`template-month-${activeMonth.month_number}`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    monthPanelRef.current?.scrollIntoView?.({ block: 'nearest' });
    monthPanelRef.current?.querySelector('[data-add-supplement]')?.focus({ preventScroll: true });
  }, [activeMonth]);

  const addMonth = () => {
    if (editSupps.length >= 12) return;
    const nextNumber = Math.floor(Math.max(0, ...editSupps.map(month => month.month_number))) + 1;
    setEditSupps(previous => [...previous, { month_number: nextNumber, supplements: [] }]);
    setEditMonths(previous => Math.max(previous, editSupps.length + 1));
    focusNewMonth.current = nextNumber;
    setActiveMonthNumber(nextNumber);
  };

  const handleMonthKeyDown = (event, index) => {
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % editSupps.length
      : event.key === 'ArrowLeft' ? (index + editSupps.length - 1) % editSupps.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? editSupps.length - 1 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const month = editSupps[nextIndex];
    setActiveMonthNumber(month.month_number);
    document.getElementById(`template-month-${month.month_number}`)?.focus();
  };

  const addTemplateSupp = (monthNum, supp) => {
    const entry = makeSuppEntry(supp);
    setEditSupps(prev => prev.map(m => {
      if (m.month_number !== monthNum) return m;
      return { ...m, supplements: [...(m.supplements || []), entry] };
    }));
  };

  const addToAllMonths = (supp) => {
    setEditSupps(prev => prev.map(m => ({
      ...m,
      supplements: [...(m.supplements || []), makeSuppEntry(supp)],
    })));
  };

  const updateTemplateSupp = (monthNum, idx, field, value) => {
    setEditSupps(prev => prev.map(m => {
      if (m.month_number !== monthNum) return m;
      const supps = [...(m.supplements || [])];
      if (!supps[idx]) return m;
      supps[idx] = updateDosageEntry(supps[idx], field, value);
      return { ...m, supplements: supps };
    }));
  };

  const reorderTemplateSupp = (monthNum, oldIdx, newIdx) => {
    setEditSupps(prev => prev.map(m => {
      if (m.month_number !== monthNum) return m;
      return { ...m, supplements: arrayMove(m.supplements || [], oldIdx, newIdx) };
    }));
  };

  const removeTemplateSupp = (monthNum, idx) => {
    setEditSupps(prev => prev.map(m => {
      if (m.month_number !== monthNum) return m;
      return { ...m, supplements: (m.supplements || []).filter((_, i) => i !== idx) };
    }));
  };

  const removeFromAllMonths = (suppName) => {
    setEditSupps(prev => prev.map(m => ({
      ...m,
      supplements: (m.supplements || []).filter(s => s.supplement_name !== suppName),
    })));
    toast.success(`Removed "${suppName}" from all months`);
  };

  const handleSave = async () => {
    if (!currentTemplate) return;
    if (editSupps.some(month => month.supplements?.some(supp => supp.dosage_error))) {
      toast.error('Resolve the highlighted dosage instructions before saving.');
      return;
    }
    setSaving(true);
    try {
      await updateTemplate(currentTemplate._id, { default_months: editMonths, months: editSupps });
      toast.success('Template saved'); await fetchData();
    } catch (err) { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const handleCreate = async () => {
    if (!newTemplate.program_name.trim()) { toast.error('Program name is required'); return; }
    setCreating(true);
    try {
      const doc = await createTemplate({ ...newTemplate, program_name: newTemplate.program_name.trim() });
      toast.success('Template created');
      setAddOpen(false);
      setNewTemplate({ program_name: '', step_number: 1, default_months: 1 });
      await fetchData();
      setSelectedProgram(doc.program_name);
      setSelectedId(doc._id);
    } catch (err) { toast.error(err.message || 'Create failed'); }
    finally { setCreating(false); }
  };

  const handleDeleteTemplate = async () => {
    if (!currentTemplate) return;
    try {
      await deleteTemplate(currentTemplate._id);
      toast.success('Template deleted');
      setConfirmDelete(false);
      fetchData();
    } catch (err) { toast.error(err.message || 'Delete failed'); }
  };

  const filteredSupps = supplements.filter(s =>
    s.supplement_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.company?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalSupps = editSupps.reduce((acc, m) => acc + (m.supplements?.length || 0), 0);
  const originalMonths = (currentTemplate?.months || []).map(month => ({ ...month, supplements: (month.supplements || []).map(normalizeDosageEntry) }));
  const hasChanges = !!currentTemplate && (editMonths !== (currentTemplate.default_months || 1) || JSON.stringify(editSupps) !== JSON.stringify(originalMonths));

  useEffect(() => {
    if (!hasChanges) return undefined;
    const warnBeforeLeaving = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [hasChanges]);

  const applySelection = (selection) => {
    if (selection.create) {
      setEditMonths(currentTemplate?.default_months || 1);
      setEditSupps(originalMonths);
      setNewTemplate({ program_name: selectedProgram, step_number: 1, default_months: 1 });
      setAddOpen(true);
    } else {
      setSelectedProgram(selection.program);
      setSelectedId(selection.id || '');
    }
    setPendingSelection(null);
  };
  const requestSelection = (selection) => {
    if (hasChanges) setPendingSelection(selection);
    else applySelection(selection);
  };

  return (
    <PageContainer>
      <PageHeader title="Protocol templates" subtitle="Build a consistent starting point for every patient protocol.">
        <button onClick={() => requestSelection({ create: true })} className="lib-button"><Plus size={15} /> New template</button>
        <button onClick={handleSave} disabled={saving || loading || !currentTemplate} data-testid="admin-templates-save-button" className="lib-button lib-button--primary"><Save size={14} /> {saving ? 'Saving…' : 'Save changes'}</button>
      </PageHeader>

      {hasChanges && <div className="lib-unsaved-bar" aria-label="Unsaved template changes">
        <span><strong>Unsaved changes</strong> · {currentTemplate.program_name}, step {currentTemplate.step_number}</span>
        <button className="lib-button lib-button--primary" onClick={handleSave} disabled={saving}><Save size={14} />{saving ? 'Saving…' : 'Save template'}</button>
      </div>}
      <div className="library-workspace">
        {error && <div className="lib-error" role="alert"><AlertCircle size={17} /> {error}<button className="lib-button" onClick={fetchData}>Try again</button></div>}
        <div className="lib-template-workspace">
          <aside>
            <nav className="lib-program-nav" aria-label="Protocol programs" data-testid="admin-templates-program-select">
              <div className="lib-program-label">Programs</div>
              {programNames.map(program => <button key={program} className="lib-program" aria-pressed={selectedProgram === program} onClick={() => { if (program !== selectedProgram) requestSelection({ program }); }}><span>{program}</span><span className="lib-program-count">{templatesForProgram(templates, program).length}</span></button>)}
            </nav>
            <p className="lib-template-hint">Choose a program, then a step. Each month defines the supplements used when starting a protocol.</p>
          </aside>
          <div className="lib-template-main">
            {loading ? <div className="lib-panel lib-loading" role="status">Loading templates…</div> : error ? null : currentTemplate ? (
              <>
                <section className="lib-template-overview" aria-label="Template settings">
                  <div className="lib-template-title">
                    <div><h2>{currentTemplate.program_name} · Step {currentTemplate.step_number}</h2><p>{totalSupps} supplement entries · Updated {fmtDate(currentTemplate.updated_at)}</p></div>
                    <div className="flex items-center gap-3"><span className={`lib-template-status ${hasChanges ? 'lib-template-status--dirty' : ''}`} role="status">{hasChanges ? <><span aria-hidden="true">●</span> Unsaved changes</> : <><Check size={14} /> Saved</>}</span><button className="lib-row-action lib-row-action--danger" onClick={() => setConfirmDelete(true)} aria-label="Delete this template"><Trash2 size={14} /></button></div>
                  </div>
                  <div className="lib-template-settings">
                    <div className="lib-field">
                      <Label htmlFor="template-step">Protocol step</Label>
                      <Select value={selectedId} onValueChange={(id) => { if (id !== selectedId) requestSelection({ program: selectedProgram, id }); }}>
                        <SelectTrigger id="template-step" className="w-[210px] h-9 bg-white" data-testid="admin-templates-step-select"><SelectValue /></SelectTrigger>
                        <SelectContent className="supp-theme">{programTemplates.map(template => <SelectItem key={template._id} value={template._id}>Step {template.step_number}{stepCounts[template.step_number] > 1 ? ` · ${fmtDateTime(template.created_at)}` : ''}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="lib-field"><Label htmlFor="template-months">Default plan length</Label><Select value={String(editMonths)} onValueChange={value => setEditMonths(Number(value))}><SelectTrigger id="template-months" className="w-[150px] h-9 bg-white"><SelectValue /></SelectTrigger><SelectContent className="supp-theme">{monthOptions.map(count => <SelectItem key={count} value={String(count)}>{count === 0.5 ? '2 weeks' : `${count} month${count === 1 ? '' : 's'}`}</SelectItem>)}</SelectContent></Select></div>
                    <div className="lib-template-add">
                      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                        <PopoverTrigger asChild><button className="lib-button" disabled={editSupps.length === 0}><Plus size={14} /> Add to all months</button></PopoverTrigger>
                        <PopoverContent className="supp-theme w-[420px] max-w-[calc(100vw-32px)] p-0" align="end">
                          <Command shouldFilter={false}>
                            <CommandInput placeholder="Search supplements or manufacturers…" value={searchQuery} onValueChange={setSearchQuery} />
                            <CommandList><CommandEmpty>No matching supplements.</CommandEmpty><CommandGroup className="max-h-[300px] overflow-y-auto">{filteredSupps.slice(0, 30).map(supp => <CommandItem key={supp._id} value={supp._id} onSelect={() => { addToAllMonths(supp); setSearchOpen(false); setSearchQuery(''); }} className="flex items-center justify-between gap-4 py-3"><div><div className="text-[13px] font-medium">{supp.supplement_name}</div><div className="text-[12px] text-ink-muted">{supp.company}</div></div><span className="text-[12px] tabular-nums whitespace-nowrap">{formatCurrency(supp.cost_per_bottle)}</span></CommandItem>)}</CommandGroup></CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </section>
                <div className="lib-month-toolbar">
                  <div><h3>Template months</h3><p>Choose a month to edit. New months start empty.</p></div>
                  <button type="button" className="lib-button" onClick={addMonth} disabled={saving || editSupps.length >= 12}><Plus size={14} /> Add month</button>
                </div>
                {editSupps.length > 0 && <div className="lib-month-tabs" role="tablist" aria-label="Template months">{editSupps.map((month, index) => <button type="button" key={month.month_number} id={`template-month-${month.month_number}`} role="tab" aria-selected={activeMonth?.month_number === month.month_number} aria-controls="template-active-month" tabIndex={activeMonth?.month_number === month.month_number ? 0 : -1} onKeyDown={event => handleMonthKeyDown(event, index)} onClick={() => setActiveMonthNumber(month.month_number)}><strong>{monthLabel(month.month_number)}</strong><span>{month.supplements?.length || 0} supplement{month.supplements?.length === 1 ? '' : 's'}</span></button>)}</div>}
                {editSupps.length === 0 && <div className="lib-panel lib-empty"><Layers size={26} /><h3>No months in this template</h3><p>Add a month to start building its supplement schedule.</p></div>}
                {(activeMonth ? [activeMonth] : []).map(month => {
                  const suppCount = (month.supplements || []).length;
                  const suppIds = (month.supplements || []).map((_, index) => `supp-${month.month_number}-${index}`);
                  const handleDragEnd = ({ active, over }) => {
                    if (!over || active.id === over.id) return;
                    const oldIdx = suppIds.indexOf(active.id);
                    const newIdx = suppIds.indexOf(over.id);
                    if (oldIdx !== -1 && newIdx !== -1) reorderTemplateSupp(month.month_number, oldIdx, newIdx);
                  };
                  return (
                    <section key={month.month_number} ref={monthPanelRef} id="template-active-month" className="lib-month" role="tabpanel" aria-label={monthLabel(month.month_number)}>
                      <div className="lib-month-heading"><h3>{monthLabel(month.month_number)}</h3><span>{suppCount} supplement{suppCount !== 1 ? 's' : ''}</span></div>
                      {suppCount === 0 ? <div className="lib-template-empty">Add the supplements for this month to begin.</div> : (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                          <SortableContext items={suppIds} strategy={verticalListSortingStrategy}>
                            {(month.supplements || []).map((supp, idx) => {
                              const upb = supp.units_per_bottle || 0;
                              const daily = calculateDailyDosage(supp.quantity_per_dose, supp.frequency_per_day, supp.dose_schedule);
                              const periodDays = month.month_number % 1 === 0.5 ? 14 : 30;
                              const bottles = (daily > 0 && upb > 0) ? Math.ceil((daily * periodDays) / upb) : '—';
                              const times = supp.times || ['AM'];
                              const schedule = supp.dose_schedule?.length ? supp.dose_schedule : getDoseSchedule(supp);
                              return <SortableRow key={suppIds[idx]} id={suppIds[idx]}>{handleProps => (
                                <div className="lib-prescription">
                                  <div className="lib-prescription-heading">
                                    <button {...handleProps} className="lib-drag-handle" aria-label={`Reorder ${supp.supplement_name}`}><GripVertical size={16} /></button>
                                    <div className="lib-prescription-name"><h4>{supp.supplement_name}</h4><span>{supp.company || 'No manufacturer'}{supp.refrigerate && <span className="lib-refrigerate"><Snowflake size={12} /> Refrigerate</span>}</span></div>
                                    <div className="lib-prescription-cost"><strong>{formatCurrency(supp.cost_per_bottle)} <span>/ bottle</span></strong><span>{bottles} bottle{bottles !== 1 ? 's' : ''} / {periodDays === 14 ? '2 weeks' : 'month'}</span></div>
                                    <button className="lib-row-action lib-row-action--danger" aria-label={`Remove ${supp.supplement_name}`} onClick={() => { setDeleteSupp({ monthNum: month.month_number, idx, name: supp.supplement_name }); setDeleteFromAll(false); }}><Trash2 size={14} /></button>
                                  </div>
                                  <div className="lib-prescription-fields">
                                    <div className="lib-dose-settings">
                                      <div className="lib-dose-controls">
                                        <div className="lib-field"><span className="lib-field-label">{supp.dose_schedule?.length ? 'Quantity by time' : 'Quantity per dose'}</span>{supp.dose_schedule?.length ? <div className="lib-dose-schedule">{schedule.map(dose => <label key={dose.time}>{dose.time === 'Afternoon' ? 'Aft' : dose.time}<input type="number" min="0.01" step="any" value={dose.quantity} aria-label={`${supp.supplement_name} ${dose.time} quantity`} onChange={event => updateTemplateSupp(month.month_number, idx, 'dose_schedule', schedule.map(item => item.time === dose.time ? { ...item, quantity: Number(event.target.value) } : item))} /></label>)}</div> : <NumberStepper label={`${supp.supplement_name} quantity`} value={supp.quantity_per_dose} min={1} onChange={value => updateTemplateSupp(month.month_number, idx, 'quantity_per_dose', value)} />}</div>
                                        <div className="lib-field"><span className="lib-field-label">Doses / day</span><NumberStepper label={`${supp.supplement_name} daily doses`} value={supp.frequency_per_day} min={1} max={3} onChange={value => updateTemplateSupp(month.month_number, idx, 'frequency_per_day', value)} /></div>
                                      </div>
                                      <div className="lib-time-options" role="group" aria-label={`Schedule for ${supp.supplement_name}`}>{['AM', 'Aft', 'PM'].map((label, index) => { const fullName = TIMES_ORDER[index]; const active = times.includes(fullName); return <button key={label} type="button" className="lib-time-option" aria-label={fullName} aria-pressed={active} onClick={() => { const nextTimes = active ? times.filter(time => time !== fullName) : [...times, fullName].sort((a, b) => TIMES_ORDER.indexOf(a) - TIMES_ORDER.indexOf(b)); if (nextTimes.length > 0) updateTemplateSupp(month.month_number, idx, 'times', nextTimes); }}>{label}</button>; })}</div>
                                    </div>
                                    <TemplateTextField id={`template-dose-${month.month_number}-${idx}`} label="Dosage text" value={supp.dosage_display} placeholder="e.g. 2 caps, twice daily" error={supp.dosage_error} onCommit={value => updateTemplateSupp(month.month_number, idx, 'dosage_display', value)} />
                                    <TemplateTextField id={`template-instructions-${month.month_number}-${idx}`} label="Patient instructions" value={supp.instructions} placeholder="e.g. Take with food" onCommit={value => updateTemplateSupp(month.month_number, idx, 'instructions', value)} />
                                  </div>
                                </div>
                              )}</SortableRow>;
                            })}
                          </SortableContext>
                        </DndContext>
                      )}
                      <div className="lib-month-add"><MonthAddSupplement monthNum={month.month_number} supplements={supplements} onAdd={addTemplateSupp} /></div>
                    </section>
                  );
                })}
              </>
            ) : (
              <div className="lib-panel lib-empty"><Layers size={28} strokeWidth={1.4} /><h2>No templates for {selectedProgram || 'this program'}</h2><p>Create a step with a default duration, then add its monthly supplements.</p><button className="lib-button lib-button--primary" onClick={() => requestSelection({ create: true })}><Plus size={15} /> Create template</button></div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog open={!!pendingSelection} onOpenChange={() => setPendingSelection(null)} title="Discard unsaved changes?" description="Your edits to this template have not been saved. Discard them to continue." confirmLabel="Discard changes" destructive onConfirm={() => { if (pendingSelection) applySelection(pendingSelection); }} />

      {/* Create template dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent style={{ '--dialog-width': '480px' }} className="supp-theme lib-dialog max-w-[480px] p-0 gap-0 border hairline">
          <DialogHeader className="px-6 pt-6 pb-4 space-y-1">
            <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              New protocol template
            </DialogTitle>
            <DialogDescription className="text-[13px] text-ink-muted">
              Create a new template, then add supplements to it.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-5 grid gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="new-template-program" className="text-[13px] font-medium text-ink-3">Program name <span className="text-red-600">*</span></Label>
              <Input
                id="new-template-program"
                value={newTemplate.program_name}
                onChange={(e) => setNewTemplate({ ...newTemplate, program_name: e.target.value })}
                className="h-9 text-[13px]"
                placeholder="e.g. Detox 1, Maintenance"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="new-template-step" className="text-[13px] font-medium text-ink-3">Step</Label>
                <Input
                  type="number"
                  min={1}
                  id="new-template-step"
                  value={newTemplate.step_number}
                  onChange={(e) => setNewTemplate({ ...newTemplate, step_number: parseInt(e.target.value) || 1 })}
                  className="h-9 text-[13px] tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-template-months" className="text-[13px] font-medium text-ink-3">Default months</Label>
                <Input
                  type="number"
                  min={0.5}
                  step={0.5}
                  id="new-template-months"
                  value={newTemplate.default_months}
                  onChange={(e) => setNewTemplate({ ...newTemplate, default_months: parseFloat(e.target.value) || 1 })}
                  className="h-9 text-[13px] tabular-nums"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 bg-[color:var(--surface-hover)] hairline-t gap-2">
            <button
              onClick={() => setAddOpen(false)}
              className="lib-button"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="lib-button lib-button--primary"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete supplement confirm */}
      <ConfirmDialog
        open={!!deleteSupp}
        onOpenChange={() => { setDeleteSupp(null); setDeleteFromAll(false); }}
        title="Remove supplement?"
        description={deleteSupp ? `Remove "${deleteSupp.name}" from this template.` : ''}
        confirmLabel={deleteFromAll ? 'Remove from all months' : 'Remove'}
        destructive
        onConfirm={() => {
          if (deleteSupp) {
            if (deleteFromAll) removeFromAllMonths(deleteSupp.name);
            else removeTemplateSupp(deleteSupp.monthNum, deleteSupp.idx);
          }
          setDeleteSupp(null);
          setDeleteFromAll(false);
        }}
        extra={
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={deleteFromAll}
              onChange={(e) => setDeleteFromAll(e.target.checked)}
              className="w-4 h-4 accent-black"
            />
            <span className="text-[12.5px] text-ink-3">Remove from all months</span>
          </label>
        }
      />

      {/* Delete template confirm */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this template?"
        description={currentTemplate
          ? `This will delete "${currentTemplate.program_name} Step ${currentTemplate.step_number}" (created ${fmtDate(currentTemplate.created_at)}) and all its supplements.`
          : ''}
        confirmLabel="Delete template"
        destructive
        onConfirm={handleDeleteTemplate}
      />
    </PageContainer>
  );
}
