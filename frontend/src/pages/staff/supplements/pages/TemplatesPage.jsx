import React, { useState, useEffect, useCallback } from 'react';
import { getTemplates, updateTemplate, createTemplate, deleteTemplate, getSupplements } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { parseDosage, buildDosageText } from '../lib/dosageParser';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
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
import { Plus, Minus, Trash2, Save, Layers, Snowflake, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader, { PageContainer } from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';

const DEFAULT_PROGRAMS = ['Detox 1', 'Detox 2', 'Maintenance'];
const TIMES_ORDER = ['AM', 'Afternoon', 'PM'];
const ROW_COLS = '14px 96px minmax(150px,1fr) 56px 56px 140px minmax(140px,1fr) 44px 72px 28px';

const freqToTimes = (freq) => {
  if (freq >= 3) return ['AM', 'Afternoon', 'PM'];
  if (freq === 2) return ['AM', 'PM'];
  return ['AM'];
};

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

function NumberStepper({ value, onChange, min = 0 }) {
  const num = value ?? 0;
  return (
    <div className="inline-flex items-center h-[24px] rounded-md border hairline overflow-hidden select-none bg-white">
      <button
        type="button"
        disabled={num <= min}
        onClick={() => onChange(Math.max(min, num - 1))}
        className="w-5 h-full flex items-center justify-center text-ink-subtle hover:bg-[color:var(--surface-hover)] hover:text-ink disabled:opacity-30 transition-colors"
      >
        <Minus size={10} />
      </button>
      <span className="w-6 h-full flex items-center justify-center font-mono text-[11px] font-semibold text-ink tabular-nums">
        {num}
      </span>
      <button
        type="button"
        onClick={() => onChange(num + 1)}
        className="w-5 h-full flex items-center justify-center text-ink-subtle hover:bg-[color:var(--surface-hover)] hover:text-ink transition-colors"
      >
        <Plus size={10} />
      </button>
    </div>
  );
}

function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
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
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-medium text-ink-muted hover:text-[color:var(--accent-teal)] hover:bg-[color:var(--accent-teal-wash)] border border-dashed border-[color:var(--hairline-strong)] hover:border-[color:var(--accent-teal)]/40 transition-colors w-full justify-center"
        >
          <Plus size={13} /> Add supplement
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command>
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
                    <div className="text-[11.5px] text-ink-muted truncate">{s.company}</div>
                  </div>
                  <span className="text-[12px] font-mono tabular-nums text-ink-muted shrink-0 ml-3">
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
  return {
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
  };
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [supplements, setSupplements] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [currentTemplate, setCurrentTemplate] = useState(null);
  const [editMonths, setEditMonths] = useState(1);
  const [editSupps, setEditSupps] = useState([]);
  const [saving, setSaving] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ program_name: '', step_number: 1, default_months: 1 });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteSupp, setDeleteSupp] = useState(null);
  const [deleteFromAll, setDeleteFromAll] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const programNames = [...new Set([...DEFAULT_PROGRAMS, ...templates.map(t => (t.program_name || '').trim())])].sort();
  const programTemplates = templatesForProgram(templates, selectedProgram);
  const stepCounts = programTemplates.reduce((acc, t) => {
    acc[t.step_number] = (acc[t.step_number] || 0) + 1;
    return acc;
  }, {});

  const fetchData = useCallback(async () => {
    try {
      const [tRes, sRes] = await Promise.all([getTemplates(), getSupplements('', true)]);
      setTemplates(tRes.templates || []);
      setSupplements(sRes.supplements || []);
    } catch (err) { toast.error('Failed to load data'); }
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
    setEditSupps(tmpl?.months || []);
  }, [selectedProgram, selectedId, templates]);

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
      const s = { ...supps[idx], [field]: value };
      const unit = s.unit_type || 'caps';
      if (field === 'quantity_per_dose' || field === 'frequency_per_day') {
        if (s.quantity_per_dose && s.frequency_per_day) {
          s.dosage_display = buildDosageText(s.quantity_per_dose, s.frequency_per_day, unit);
        }
        if (field === 'frequency_per_day' && value) s.times = freqToTimes(value);
      } else if (field === 'dosage_display') {
        const parsed = parseDosage(value);
        if (parsed) {
          s.quantity_per_dose = parsed.qty;
          if (parsed.freq !== s.frequency_per_day) {
            s.frequency_per_day = parsed.freq;
            s.times = freqToTimes(parsed.freq);
          }
        }
      } else if (field === 'times') {
        s.frequency_per_day = value.length;
        if (s.quantity_per_dose) s.dosage_display = buildDosageText(s.quantity_per_dose, value.length, unit);
      }
      supps[idx] = s;
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

  return (
    <PageContainer>
      <PageHeader
        title="Protocol templates"
        subtitle={currentTemplate
          ? `${currentTemplate.program_name} · Step ${currentTemplate.step_number} · ${totalSupps} supplement${totalSupps !== 1 ? 's' : ''} · Created ${fmtDate(currentTemplate.created_at)} · Updated ${fmtDate(currentTemplate.updated_at)}`
          : 'Manage default supplement lists for each program and step'}
      >
        {currentTemplate && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100"
          >
            <Trash2 size={13} /> Delete
          </button>
        )}
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[13px] font-medium border hairline bg-white text-ink-3 hover:text-ink hover:bg-[color:var(--surface-hover)]"
        >
          <Plus size={14} /> New template
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !currentTemplate}
          data-testid="admin-templates-save-button"
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[13px] font-medium bg-[color:var(--accent-teal)] text-white hover:bg-[color:var(--accent-teal-hover)] disabled:opacity-60 shadow-[var(--shadow-xs)]"
        >
          <Save size={13} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </PageHeader>

      <div className="px-8 py-6">
        {/* Filter bar */}
        <div className="flex items-end gap-3 mb-5">
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-ink-subtle uppercase tracking-[0.06em]">Program</Label>
            <Select value={selectedProgram} onValueChange={setSelectedProgram}>
              <SelectTrigger className="w-[200px] h-9 text-[13px] bg-white" data-testid="admin-templates-program-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {programNames.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-ink-subtle uppercase tracking-[0.06em]">Step</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-[220px] h-9 text-[13px] bg-white" data-testid="admin-templates-step-select">
                <SelectValue placeholder="No templates" />
              </SelectTrigger>
              <SelectContent>
                {programTemplates.map(t => (
                  <SelectItem key={t._id} value={t._id}>
                    Step {t.step_number}
                    {stepCounts[t.step_number] > 1 ? ` · created ${fmtDateTime(t.created_at)}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-ink-subtle uppercase tracking-[0.06em]">Default months</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={editMonths}
              onChange={(e) => setEditMonths(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-[100px] h-9 font-mono tabular-nums text-[13px] bg-white"
            />
          </div>

          {currentTemplate && (
            <div className="ml-auto flex items-center gap-2">
              <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[13px] font-medium border hairline bg-white text-ink-3 hover:text-[color:var(--accent-teal)] hover:bg-[color:var(--accent-teal-wash)]">
                    <Plus size={13} /> Add to all months
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[440px] p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Search supplements…" value={searchQuery} onValueChange={setSearchQuery} />
                    <CommandList>
                      <CommandEmpty>No supplements found.</CommandEmpty>
                      <CommandGroup className="max-h-[300px] overflow-y-auto">
                        {filteredSupps.slice(0, 30).map(supp => (
                          <CommandItem
                            key={supp._id}
                            value={supp.supplement_name}
                            onSelect={() => { addToAllMonths(supp); setSearchOpen(false); setSearchQuery(''); }}
                            className="flex items-center justify-between cursor-pointer py-2"
                          >
                            <div className="min-w-0">
                              <div className="text-[13px] font-medium text-ink truncate">{supp.supplement_name}</div>
                              <div className="text-[11.5px] text-ink-muted truncate">{supp.company}</div>
                            </div>
                            <span className="text-[12px] font-mono tabular-nums text-ink-muted shrink-0 ml-3">
                              {formatCurrency(supp.cost_per_bottle)}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        {currentTemplate ? (
          <div className="space-y-4">
            {editSupps.map((month) => {
              const suppCount = (month.supplements || []).length;
              const suppIds = (month.supplements || []).map((_, i) => `supp-${month.month_number}-${i}`);
              const handleDragEnd = ({ active, over }) => {
                if (!over || active.id === over.id) return;
                const oldIdx = suppIds.indexOf(active.id);
                const newIdx = suppIds.indexOf(over.id);
                if (oldIdx !== -1 && newIdx !== -1) reorderTemplateSupp(month.month_number, oldIdx, newIdx);
              };
              return (
                <div
                  key={month.month_number}
                  className="rounded-lg border hairline surface overflow-hidden shadow-[var(--shadow-xs)]"
                >
                  <div
                    className="flex items-center justify-between h-9 px-5 hairline-b"
                    style={{
                      background: 'linear-gradient(90deg, rgba(13,95,104,0.12) 0%, rgba(70,152,157,0.18) 50%, rgba(13,95,104,0.12) 100%)',
                    }}
                  >
                    <span className="text-[10px] font-semibold tracking-[0.09em] uppercase text-[color:var(--accent-teal)]">
                      {month.month_number === 0.5 ? '2 Weeks' : `Month ${month.month_number}`}
                    </span>
                    <span className="text-[10px] font-medium tracking-[0.04em] text-[color:var(--accent-teal)]/70">
                      {suppCount} supplement{suppCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {suppCount === 0 ? (
                    <div className="py-8 text-center text-[12.5px] text-ink-muted">No supplements yet</div>
                  ) : (
                    <>
                    <div
                      className="grid items-center px-5 h-8 hairline-b gap-3 text-[10px] font-semibold tracking-[0.09em] uppercase text-ink-subtle bg-[color:var(--surface-subtle)]"
                      style={{ gridTemplateColumns: ROW_COLS }}
                    >
                      <span />
                      <span>Times</span>
                      <span>Supplement</span>
                      <span className="text-center">Qty</span>
                      <span className="text-center">Freq</span>
                      <span>Dosage</span>
                      <span>Instructions</span>
                      <span className="text-center">Btls</span>
                      <span className="text-right">Cost</span>
                      <span />
                    </div>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={suppIds} strategy={verticalListSortingStrategy}>
                    {(month.supplements || []).map((supp, idx) => {
                      const qty = supp.quantity_per_dose || 0;
                      const freq = supp.frequency_per_day || 0;
                      const upb = supp.units_per_bottle || 0;
                      const bottles = (qty > 0 && freq > 0 && upb > 0) ? Math.ceil((qty * freq * 30) / upb) : '—';
                      const times = supp.times || ['AM'];
                      return (
                        <SortableRow key={suppIds[idx]} id={suppIds[idx]}>
                        <div
                          className="grid items-center min-h-[44px] px-5 py-1.5 border-b border-[color:var(--hairline)] row-hover transition-colors group gap-3"
                          style={{ gridTemplateColumns: ROW_COLS }}
                        >
                          <div className="flex items-center justify-center cursor-grab active:cursor-grabbing drag-handle">
                            <GripVertical size={12} className="text-ink-faint group-hover:text-ink-subtle" />
                          </div>
                          <div className="flex gap-0.5 justify-start">
                            {['AM', 'Aft', 'PM'].map((label, ti) => {
                              const fullName = TIMES_ORDER[ti];
                              const active = times.includes(fullName);
                              return (
                                <button
                                  key={label}
                                  type="button"
                                  onClick={() => {
                                    const nt = active
                                      ? times.filter(t => t !== fullName)
                                      : [...times, fullName].sort((a, b) => TIMES_ORDER.indexOf(a) - TIMES_ORDER.indexOf(b));
                                    if (nt.length === 0) return;
                                    updateTemplateSupp(month.month_number, idx, 'times', nt);
                                  }}
                                  className={`h-5 px-1.5 rounded text-[10px] font-semibold transition-colors ${
                                    active
                                      ? 'bg-[color:var(--accent-teal)] text-white'
                                      : 'bg-[color:var(--surface-subtle)] text-ink-subtle hover:text-[color:var(--accent-teal)]'
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[13px] font-medium text-ink leading-tight break-words">{supp.supplement_name}</span>
                            {supp.refrigerate && (
                              <Snowflake size={11} className="text-[color:var(--accent-teal)] shrink-0" />
                            )}
                          </div>
                          <div className="flex justify-center">
                            <NumberStepper
                              value={supp.quantity_per_dose}
                              min={1}
                              onChange={(v) => updateTemplateSupp(month.month_number, idx, 'quantity_per_dose', v)}
                            />
                          </div>
                          <div className="flex justify-center">
                            <NumberStepper
                              value={supp.frequency_per_day}
                              min={1}
                              onChange={(v) => updateTemplateSupp(month.month_number, idx, 'frequency_per_day', v)}
                            />
                          </div>
                          <div
                            contentEditable
                            suppressContentEditableWarning
                            className="text-[12px] text-ink-muted outline-none min-h-[18px] break-words cursor-text rounded px-1 -mx-1 leading-tight focus:bg-white focus:text-ink-3 focus:shadow-[var(--focus-subtle)]"
                            onBlur={(e) => {
                              const v = e.target.textContent;
                              if (v !== (supp.dosage_display || '')) updateTemplateSupp(month.month_number, idx, 'dosage_display', v);
                            }}
                            dangerouslySetInnerHTML={{ __html: escapeHtml(supp.dosage_display || '') }}
                          />
                          <div
                            contentEditable
                            suppressContentEditableWarning
                            className="text-[12px] text-ink-muted outline-none min-h-[18px] break-words cursor-text rounded px-1 -mx-1 leading-tight focus:bg-white focus:text-ink-3 focus:shadow-[var(--focus-subtle)]"
                            onBlur={(e) => {
                              const v = e.target.textContent;
                              if (v !== (supp.instructions || '')) updateTemplateSupp(month.month_number, idx, 'instructions', v);
                            }}
                            dangerouslySetInnerHTML={{ __html: escapeHtml(supp.instructions || '') }}
                          />
                          <span className="font-mono tabular-nums text-[12px] text-ink-3 text-center">{bottles}</span>
                          <span className="font-mono tabular-nums text-[12px] font-semibold text-ink text-right">
                            {formatCurrency(supp.cost_per_bottle)}
                          </span>
                          <button
                            className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-ink-subtle hover:text-red-600 hover:bg-red-50 transition-opacity"
                            onClick={() => {
                              setDeleteSupp({ monthNum: month.month_number, idx, name: supp.supplement_name });
                              setDeleteFromAll(false);
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        </SortableRow>
                      );
                    })}
                    </SortableContext>
                    </DndContext>
                    </>
                  )}

                  <div className="px-5 py-2.5 hairline-t bg-[color:var(--surface-hover)]">
                    <MonthAddSupplement
                      monthNum={month.month_number}
                      supplements={supplements}
                      onAdd={addTemplateSupp}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border hairline border-dashed surface flex flex-col items-center justify-center py-16">
            <Layers size={28} strokeWidth={1.4} className="text-ink-faint mb-2.5" />
            <p className="text-[13px] font-medium text-ink">No template found</p>
            <p className="text-[12px] text-ink-muted mt-1">Select a program and step above, or create a new template.</p>
          </div>
        )}
      </div>

      {/* Create template dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-[440px] p-0 gap-0 overflow-hidden rounded-xl border hairline shadow-[var(--shadow-lg)]">
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
              <Label className="text-[12px] font-medium text-ink-3">Program name <span className="text-red-600">*</span></Label>
              <Input
                value={newTemplate.program_name}
                onChange={(e) => setNewTemplate({ ...newTemplate, program_name: e.target.value })}
                className="h-9 text-[13px]"
                placeholder="e.g. Detox 1, Maintenance"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-ink-3">Step</Label>
                <Input
                  type="number"
                  min={1}
                  value={newTemplate.step_number}
                  onChange={(e) => setNewTemplate({ ...newTemplate, step_number: parseInt(e.target.value) || 1 })}
                  className="h-9 text-[13px] font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-ink-3">Default months</Label>
                <Input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={newTemplate.default_months}
                  onChange={(e) => setNewTemplate({ ...newTemplate, default_months: parseFloat(e.target.value) || 1 })}
                  className="h-9 text-[13px] font-mono tabular-nums"
                />
              </div>
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
              onClick={handleCreate}
              disabled={creating}
              className="h-9 px-4 rounded-md text-[13px] font-semibold bg-[color:var(--accent-teal)] hover:bg-[color:var(--accent-teal-hover)] text-white disabled:opacity-60"
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
              className="w-3.5 h-3.5 rounded border-[color:var(--hairline-strong)] text-[color:var(--accent-teal)] focus:ring-[color:var(--accent-teal)]"
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
