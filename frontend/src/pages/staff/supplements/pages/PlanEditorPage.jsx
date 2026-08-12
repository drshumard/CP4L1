import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getPlan, updatePlan, getSupplements, exportPatientPDF, exportHCPDF,
  finalizePlan, reopenPlan, duplicatePlan, saveToDrive, getSuppliers,
  getTemplates, savePlanAsTemplate,
} from '../lib/api';
import { formatCurrency, recalculatePlanCosts, downloadBlob } from '../lib/utils';
import { parseDosage, buildDosageText } from '../lib/dosageParser';
import { useAuth } from '../auth';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, Plus, Minus, Trash2, Download, FileText, Eye, EyeOff, Save,
  Snowflake, ChevronsUpDown, Lock, Unlock, Copy, User, CopyPlus,
  GripVertical, CalendarDays, Circle, MoreHorizontal, CloudUpload, AlertTriangle,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';

// Backend timestamps are naive UTC — append Z so they parse as UTC, not local
const fmtTplDate = (d) => {
  if (!d) return '—';
  const iso = typeof d === 'string' && !/(Z|[+-]\d{2}:?\d{2})$/.test(d) ? d + 'Z' : d;
  const t = new Date(iso);
  return `${t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};

/* ─────────────────── NumberStepper ─────────────────── */
function NumberStepper({ value, onChange, disabled, min = 0 }) {
  const num = value ?? 0;
  return (
    <div className="inline-flex items-center h-[24px] rounded-md border hairline overflow-hidden select-none bg-white">
      <button
        type="button"
        disabled={disabled || num <= min}
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
        disabled={disabled}
        onClick={() => onChange(num + 1)}
        className="w-5 h-full flex items-center justify-center text-ink-subtle hover:bg-[color:var(--surface-hover)] hover:text-ink disabled:opacity-30 transition-colors"
      >
        <Plus size={10} />
      </button>
    </div>
  );
}

/* ─────────────────── Sortable row wrapper ─────────────────── */
function SortableRow({ id, disabled, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
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

/* ─────────────────── MonthSection ─────────────────── */
function MonthSection({
  month, showCosts, patientView, isFinalized,
  onUpdateField, onRemoveRow, onRemoveFromAll, onAddSupplement, onReorder,
  supplements, formatCurrency,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteFromAll, setDeleteFromAll] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const suppIds = (month.supplements || []).map((_, i) => `supp-${month.month_number}-${i}`);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = suppIds.indexOf(active.id);
    const newIdx = suppIds.indexOf(over.id);
    if (oldIdx !== -1 && newIdx !== -1) onReorder(month.month_number, oldIdx, newIdx);
  };

  const filtered = supplements.filter(s =>
    s.supplement_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.company?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const monthLabel =
    month.month_number === 0.5 ? '2 Weeks' :
    month.month_number % 1 !== 0 ? `Month ${Math.floor(month.month_number)} + 2 Weeks` :
    `Month ${month.month_number}`;

  const rowCols = patientView
    ? '110px minmax(180px,260px) 110px 72px minmax(160px,1fr)'
    : showCosts
      ? '14px 110px minmax(180px,240px) 56px 56px 110px 72px minmax(160px,1fr) 36px 78px 20px'
      : '14px 110px minmax(180px,240px) 56px 56px 110px 72px minmax(160px,1fr) 20px';

  return (
    <section
      className="mb-8"
      data-testid={`month-page-${month.month_number}`}
    >
      {/* Quiet section header */}
      <div className="flex items-end justify-between px-1 pb-3">
        <div className="flex items-baseline gap-3">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{monthLabel}</h3>
          <span className="text-[12px] text-ink-subtle">
            {(month.supplements || []).length} {(month.supplements || []).length === 1 ? 'supplement' : 'supplements'}
          </span>
        </div>
        {showCosts && !patientView && (
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] uppercase tracking-[0.08em] text-ink-subtle font-medium">Total</span>
              <span className="font-mono tabular-nums text-[15px] font-semibold text-ink">
                {formatCurrency(month.monthly_total_cost)}
              </span>
            </div>
            <div className="font-mono tabular-nums text-[11px] text-ink-subtle">
              Supps {formatCurrency(month.supplement_cost || month.monthly_total_cost)}
              {(month.freight_total || 0) > 0 && (
                <> <span className="text-ink-faint">·</span> Ship {formatCurrency(month.freight_total)}</>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Table card */}
      <div className="rounded-lg border hairline surface overflow-hidden shadow-[var(--shadow-xs)]">
        {/* Brand accent strip */}
        <div
          aria-hidden
          className="h-[2px] w-full"
          style={{ background: 'linear-gradient(90deg, #0D5F68 0%, #46989D 50%, #0D5F68 100%)' }}
        />
        {/* Column headers */}
        <div
          className="grid items-center px-3 h-9 hairline-b gap-x-3 text-[10px] font-semibold tracking-[0.09em] uppercase text-[color:var(--accent-teal)]"
          style={{
            gridTemplateColumns: rowCols,
            background: 'linear-gradient(90deg, rgba(13,95,104,0.12) 0%, rgba(70,152,157,0.18) 50%, rgba(13,95,104,0.12) 100%)',
          }}
        >
          {!patientView && <span />}
          <span className="text-center">Times</span>
          <span className="pl-2">Supplement</span>
          {!patientView && (<>
            <span className="text-center">Qty</span>
            <span className="text-center">Freq</span>
          </>)}
          <span className="text-center">Dosage</span>
          <span className="text-center">Food</span>
          <span className="text-center">Notes</span>
          {showCosts && !patientView && (<>
            <span className="text-center">Btls</span>
            <span className="text-right">Cost</span>
          </>)}
          {!isFinalized && !patientView && <span />}
        </div>

        {/* Rows */}
        {(month.supplements || []).length === 0 ? (
          <div className="px-8 py-12 text-center text-ink-subtle text-[13px]">
            No supplements added yet.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={suppIds} strategy={verticalListSortingStrategy}>
              {(month.supplements || []).map((supp, idx) => (
                <SortableRow key={suppIds[idx]} id={suppIds[idx]} disabled={isFinalized || patientView}>
                  <div
                    className="grid items-center px-3 min-h-[36px] py-1 border-b border-[color:var(--hairline)] last:border-b-0 row-hover transition-colors duration-100 group gap-x-3"
                    style={{ gridTemplateColumns: rowCols }}
                  >
                    {/* Drag handle */}
                    {!patientView && (
                      <div className="flex items-center justify-center cursor-grab active:cursor-grabbing drag-handle">
                        <GripVertical size={12} className="text-ink-faint group-hover:text-ink-subtle" />
                      </div>
                    )}

                    {/* Time chips */}
                    <div className="flex justify-center gap-1">
                      {patientView ? (
                        <span className="text-[11px] font-medium text-[color:var(--accent-teal)]">
                          {(supp.times || ['AM']).map(t => t === 'Afternoon' ? 'AFT' : t.toUpperCase()).join(' · ')}
                        </span>
                      ) : (
                        [
                          { label: 'AM',  full: 'AM' },
                          { label: 'AFT', full: 'Afternoon' },
                          { label: 'PM',  full: 'PM' },
                        ].map(({ label, full }) => {
                          const times = supp.times || ['AM'];
                          const active = times.includes(full);
                          return (
                            <button
                              key={label}
                              type="button"
                              disabled={isFinalized}
                              onClick={() => {
                                const newTimes = active
                                  ? times.filter(t => t !== full)
                                  : [...times, full].sort((a, b) => ['AM','Afternoon','PM'].indexOf(a) - ['AM','Afternoon','PM'].indexOf(b));
                                if (newTimes.length === 0) return;
                                onUpdateField(month.month_number, idx, 'times', newTimes);
                              }}
                              className={`min-w-[30px] px-1.5 h-[20px] flex items-center justify-center rounded text-[10px] font-semibold tracking-[0.02em] transition-colors ${
                                active
                                  ? 'bg-[color:var(--accent-teal)] text-white shadow-[0_1px_0_rgba(13,95,104,0.25)]'
                                  : 'bg-[color:var(--surface-subtle)] text-ink-subtle hover:text-ink hover:bg-[color:var(--surface-hover)]'
                              } ${isFinalized ? 'opacity-50' : ''}`}
                            >
                              {label}
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* Supplement */}
                    <div className="flex items-start gap-1.5 min-w-0 py-1 pl-2">
                      <span className="text-[13px] font-medium text-ink leading-tight break-words">
                        {supp.supplement_name}
                      </span>
                      {supp.refrigerate && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Snowflake size={11} className="text-blue-500 shrink-0 mt-0.5" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Refrigerate</TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {!patientView && (<>
                      <div className="flex justify-center">
                        <NumberStepper
                          value={supp.quantity_per_dose}
                          disabled={isFinalized}
                          onChange={(v) => onUpdateField(month.month_number, idx, 'quantity_per_dose', v)}
                        />
                      </div>
                      <div className="flex justify-center">
                        <NumberStepper
                          value={supp.frequency_per_day}
                          disabled={isFinalized}
                          onChange={(v) => onUpdateField(month.month_number, idx, 'frequency_per_day', v)}
                        />
                      </div>
                    </>)}

                    {/* Dosage */}
                    <div className="min-w-0">
                      {patientView || isFinalized ? (
                        <span className="text-[12.5px] text-ink-3 block truncate text-center">
                          {(supp.dosage_display || '').replace(/<[^>]*>/g, '').trim() || '—'}
                        </span>
                      ) : (
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          className="text-[12.5px] text-ink-3 outline-none min-h-[18px] break-words cursor-text rounded px-1 -mx-1 leading-tight text-center focus:text-left focus:bg-white focus:shadow-[var(--focus-subtle)]"
                          onBlur={(e) => onUpdateField(month.month_number, idx, 'dosage_display', e.target.textContent)}
                          dangerouslySetInnerHTML={{ __html: supp.dosage_display || '' }}
                        />
                      )}
                    </div>

                    {/* With Food */}
                    <div className="flex justify-center">
                      {patientView ? (
                        <span className="text-[12px] text-ink-muted">{supp.with_food ? 'Yes' : 'No'}</span>
                      ) : (
                        <Select
                          value={supp.with_food ? 'yes' : 'no'}
                          onValueChange={(v) => onUpdateField(month.month_number, idx, 'with_food', v === 'yes')}
                          disabled={isFinalized}
                        >
                          <SelectTrigger className="h-7 text-[12px] border hairline w-full px-2.5 bg-white focus:ring-0 focus:shadow-[var(--focus-subtle)]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Notes */}
                    <div className="min-w-0">
                      {patientView || isFinalized ? (
                        <span className="text-[12.5px] text-ink-muted block text-center break-words leading-tight">
                          {(supp.instructions || '').replace(/<[^>]*>/g, '').trim() || '—'}
                        </span>
                      ) : (
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          className="text-[12.5px] text-ink-muted outline-none min-h-[18px] break-words cursor-text rounded px-1.5 -mx-1 leading-tight text-center focus:text-left focus:bg-white focus:shadow-[var(--focus-subtle)] focus:text-ink-3"
                          onBlur={(e) => onUpdateField(month.month_number, idx, 'instructions', e.target.textContent)}
                          dangerouslySetInnerHTML={{ __html: supp.instructions || '' }}
                        />
                      )}
                    </div>

                    {showCosts && !patientView && (<>
                      <div className="font-mono tabular-nums text-[12px] text-ink-3 text-center">
                        {supp.bottles_needed || '—'}
                      </div>
                      <div className="font-mono tabular-nums text-[12px] font-semibold text-ink text-right whitespace-nowrap">
                        {formatCurrency(supp.calculated_cost)}
                      </div>
                    </>)}

                    {!isFinalized && !patientView && (
                      <div className="flex justify-center">
                        <button
                          className="h-6 w-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-ink-subtle hover:text-red-600 hover:bg-red-50 rounded"
                          onClick={() => setDeleteRow(idx)}
                          aria-label="Remove"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                </SortableRow>
              ))}
            </SortableContext>
          </DndContext>
        )}

        {/* Add supplement */}
        {!isFinalized && !patientView && (
          <div
            className="hairline-t px-3 py-2"
            style={{
              background: 'linear-gradient(90deg, rgba(13,95,104,0.09) 0%, rgba(70,152,157,0.13) 50%, rgba(13,95,104,0.09) 100%)',
            }}
          >
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <button
                  className="w-full h-8 px-2 inline-flex items-center gap-2 text-[12px] text-ink-muted hover:text-ink transition-colors rounded"
                  data-testid={`month-${month.month_number}-add-supplement`}
                >
                  <Plus size={13} className="text-[color:var(--accent-teal)]" />
                  <span>Add supplement to {monthLabel}</span>
                  <ChevronsUpDown size={11} className="ml-auto text-ink-faint" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[460px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search supplements…" value={searchQuery} onValueChange={setSearchQuery} />
                  <CommandList>
                    <CommandEmpty>No supplements found.</CommandEmpty>
                    <CommandGroup className="max-h-[300px] overflow-y-auto">
                      {filtered.slice(0, 30).map(supp => (
                        <CommandItem
                          key={supp._id}
                          value={supp.supplement_name}
                          onSelect={() => { onAddSupplement(month.month_number, supp); setSearchOpen(false); setSearchQuery(''); }}
                          className="flex items-center justify-between cursor-pointer py-2.5 px-3"
                        >
                          <div>
                            <div className="text-[13px] font-medium">{supp.supplement_name}</div>
                            <div className="text-[11px] text-ink-subtle">{supp.company}</div>
                          </div>
                          <span className="text-[11px] font-mono text-ink-muted ml-4">
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

      <AlertDialog open={deleteRow !== null} onOpenChange={() => { setDeleteRow(null); setDeleteFromAll(false); }}>
        <AlertDialogContent className="p-0 gap-0 max-w-[440px] overflow-hidden border hairline shadow-[var(--shadow-lg)] rounded-xl">
          <div className="px-6 pt-6 pb-5">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
                <AlertTriangle size={18} className="text-red-600" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <AlertDialogTitle className="text-[15px] font-semibold tracking-[-0.01em] text-ink leading-snug">
                  Remove supplement?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-[13px] mt-1.5 text-ink-muted leading-relaxed">
                  {deleteRow !== null && (month.supplements || [])[deleteRow]
                    ? <>Remove <span className="font-medium text-ink-3">{(month.supplements || [])[deleteRow]?.supplement_name}</span> from this plan. This cannot be undone.</>
                    : 'This will remove the supplement.'}
                </AlertDialogDescription>
              </div>
            </div>

            <label className="flex items-center gap-2.5 mt-5 ml-14 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={deleteFromAll}
                onChange={(e) => setDeleteFromAll(e.target.checked)}
                className="w-4 h-4 rounded border-[1.5px] border-[color:var(--hairline-strong)] accent-red-600 cursor-pointer"
              />
              <span className="text-[12.5px] text-ink-3 group-hover:text-ink transition-colors">
                Remove from all months
              </span>
            </label>
          </div>

          <AlertDialogFooter className="px-6 py-4 bg-[color:var(--surface-hover)] hairline-t gap-2 sm:gap-2">
            <AlertDialogCancel className="h-9 px-4 text-[13px] font-medium border hairline bg-white hover:bg-[color:var(--surface-subtle)] text-ink-3 hover:text-ink mt-0 shadow-none">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteFromAll && deleteRow !== null) {
                  const suppName = (month.supplements || [])[deleteRow]?.supplement_name;
                  if (suppName) onRemoveFromAll(suppName);
                } else {
                  onRemoveRow(month.month_number, deleteRow);
                }
                setDeleteRow(null); setDeleteFromAll(false);
              }}
              className="h-9 px-4 text-[13px] font-semibold bg-red-600 text-white hover:bg-red-700 shadow-[0_1px_0_rgba(0,0,0,0.05)] border-0"
            >
              {deleteFromAll ? 'Remove from all months' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/* ─────────────────── Main Plan Editor ─────────────────── */
export default function PlanEditorPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCosts, setShowCosts] = useState(true);
  const [patientViewMode, setPatientViewMode] = useState(false);
  const [supplements, setSupplements] = useState([]);
  const [supplierFreight, setCompanyFreight] = useState({});
  const [exporting, setExporting] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const saveTimerRef = useRef(null);
  const isFinalized = plan?.status === 'finalized';
  const effectiveShowCosts = patientViewMode ? false : showCosts;

  useEffect(() => {
    const load = async () => {
      try {
        const [p, s, c] = await Promise.all([getPlan(planId), getSupplements('', true), getSuppliers()]);
        let needsSave = false;
        const masterSupps = s.supplements || [];
        for (const month of (p.months || [])) {
          for (const supp of (month.supplements || [])) {
            let master = supp.supplement_id ? masterSupps.find(m => m._id === supp.supplement_id) : null;
            if (!master) master = masterSupps.find(m => m.supplement_name?.toLowerCase() === supp.supplement_name?.toLowerCase());
            if (master) {
              const updates = {
                units_per_bottle: master.units_per_bottle,
                cost_per_bottle: master.cost_per_bottle,
                unit_type: master.unit_type,
                supplier: master.supplier || '',
                refrigerate: master.refrigerate || false,
              };
              for (const [key, val] of Object.entries(updates)) {
                if (val !== undefined && supp[key] !== val) { supp[key] = val; needsSave = true; }
              }
            }
            if (!supp.times || supp.times.length === 0) {
              const freq = supp.frequency_per_day || 1;
              if (freq >= 3) supp.times = ['AM', 'Afternoon', 'PM'];
              else if (freq === 2) supp.times = ['AM', 'PM'];
              else supp.times = ['AM'];
              needsSave = true;
            }
          }
        }
        setPlan(p); setSupplements(s.supplements || []);
        const freightMap = {};
        for (const co of (c.suppliers || [])) { if (co.freight_charge > 0) freightMap[co.name] = co.freight_charge; }
        setCompanyFreight(freightMap);
        if (needsSave && p.status !== 'finalized') {
          try { await updatePlan(planId, { patient_name: p.patient_name, date: p.date, months: p.months }); } catch {}
        }
      } catch (err) { toast.error('Failed to load plan'); navigate(-1); }
      finally { setLoading(false); }
    };
    load();
  }, [planId, navigate]);

  const savePlan = useCallback(async (planData) => {
    if (!planData || !planId || planData.status === 'finalized') return;
    setSaving(true);
    try {
      const result = await updatePlan(planId, { patient_name: planData.patient_name, date: planData.date, months: planData.months });
      setPlan(prev => ({ ...prev, ...result }));
    } catch (err) { toast.error('Failed to save'); }
    finally { setSaving(false); }
  }, [planId]);

  const debouncedSave = useCallback((planData) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => savePlan(planData), 800);
  }, [savePlan]);

  const recalcAndUpdate = (newPlan) => {
    const result = recalculatePlanCosts(newPlan.months || [], supplierFreight);
    newPlan.months = result.months;
    newPlan.total_program_cost = result.total_program_cost;
    setPlan({ ...newPlan }); debouncedSave(newPlan);
  };

  const freqToTimes = (freq) => {
    if (freq >= 3) return ['AM', 'Afternoon', 'PM'];
    if (freq === 2) return ['AM', 'PM'];
    return ['AM'];
  };

  const makeEntry = (supp) => {
    const freq = supp.default_frequency_per_day || 1;
    return {
      supplement_id: supp._id, supplement_name: supp.supplement_name, company: supp.company || '',
      manufacturer: supp.manufacturer || supp.company || '',
      supplier: supp.supplier || '', unit_type: supp.unit_type || 'caps',
      quantity_per_dose: supp.default_quantity_per_dose || null, frequency_per_day: freq,
      dosage_display: supp.default_dosage_display || '', instructions: supp.default_instructions || '',
      with_food: supp.default_instructions?.toLowerCase().includes('food') || true,
      times: freqToTimes(freq), hc_notes: '',
      units_per_bottle: supp.units_per_bottle || null, cost_per_bottle: supp.cost_per_bottle || 0,
      refrigerate: supp.refrigerate || false, bottles_needed: null, calculated_cost: null,
    };
  };

  const addSupplementToMonth = (monthNum, supp) => {
    if (!plan || isFinalized) return;
    const np = { ...plan }; const m = np.months?.find(x => x.month_number === monthNum);
    if (!m) return; m.supplements = [...(m.supplements || []), makeEntry(supp)];
    recalcAndUpdate(np); toast.success(`Added ${supp.supplement_name} to Month ${monthNum}`);
  };
  const addSupplementToAllMonths = (supp) => {
    if (!plan || isFinalized) return;
    const np = { ...plan }; const e = makeEntry(supp);
    for (const m of np.months || []) { m.supplements = [...(m.supplements || []), { ...e }]; }
    recalcAndUpdate(np); toast.success(`Added ${supp.supplement_name} to all months`);
  };
  const removeRow = (monthNum, index) => {
    if (!plan || isFinalized) return;
    const np = { ...plan }; const m = np.months?.find(x => x.month_number === monthNum);
    if (m) m.supplements = (m.supplements || []).filter((_, i) => i !== index);
    recalcAndUpdate(np); toast.success('Supplement removed');
  };
  const removeFromAllMonths = (suppName) => {
    if (!plan || isFinalized) return;
    const np = { ...plan };
    for (const m of np.months || []) {
      m.supplements = (m.supplements || []).filter(s => s.supplement_name !== suppName);
    }
    recalcAndUpdate(np); toast.success(`Removed "${suppName}" from all months`);
  };
  const reorderSupplements = (monthNum, oldIdx, newIdx) => {
    if (!plan || isFinalized) return;
    const np = { ...plan }; const m = np.months?.find(x => x.month_number === monthNum);
    if (m) {
      m.supplements = arrayMove(m.supplements, oldIdx, newIdx);
      recalcAndUpdate(np);
    }
  };

  const updateField = (monthNum, suppIndex, field, value) => {
    if (!plan || isFinalized) return;
    const np = { ...plan }; const m = np.months?.find(x => x.month_number === monthNum);
    if (m && m.supplements[suppIndex]) {
      const s = m.supplements[suppIndex];
      s[field] = value;
      const master = supplements.find(ms => ms._id === s.supplement_id) ||
                     supplements.find(ms => ms.supplement_name?.toLowerCase() === s.supplement_name?.toLowerCase());
      const unit = s.unit_type || master?.unit_type || 'caps';

      if (field === 'quantity_per_dose' || field === 'frequency_per_day') {
        const qty = field === 'quantity_per_dose' ? value : s.quantity_per_dose;
        const freq = field === 'frequency_per_day' ? value : s.frequency_per_day;
        if (qty && freq) s.dosage_display = buildDosageText(qty, freq, unit);
        if (field === 'frequency_per_day' && value) s.times = freqToTimes(value);
      } else if (field === 'dosage_display') {
        const parsed = parseDosage(value);
        if (parsed) {
          s.quantity_per_dose = parsed.qty;
          s.frequency_per_day = parsed.freq;
          s.times = freqToTimes(parsed.freq);
        }
      } else if (field === 'times') {
        s.frequency_per_day = value.length;
        if (s.quantity_per_dose) s.dosage_display = buildDosageText(s.quantity_per_dose, value.length, unit);
      }
    }
    recalcAndUpdate(np);
  };

  const updatePatientName = (name) => {
    if (!plan || isFinalized || plan.patient_id) return;
    const np = { ...plan, patient_name: name }; setPlan(np); debouncedSave(np);
  };

  const goBack = () => {
    if (plan?.patient_id) navigate(`/patients/${plan.patient_id}`);
    else if (window.history.length > 2) navigate(-1);
    else navigate('/staff/supplements');
  };

  const handleExportPatient = async () => {
    setExporting(true);
    try {
      if (!isFinalized) await savePlan(plan);
      const b = await exportPatientPDF(planId);
      downloadBlob(b, `Patient - ${plan.patient_name || 'patient'} - ${plan.program_name || ''} ${plan.step_label || ''}.pdf`);
      toast.success('Patient PDF exported');
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };
  const handleExportHC = async () => {
    setExporting(true);
    try {
      if (!isFinalized) await savePlan(plan);
      const b = await exportHCPDF(planId);
      downloadBlob(b, `HC - ${plan.patient_name || 'patient'} - ${plan.program_name || ''} ${plan.step_label || ''}.pdf`);
      toast.success('HC PDF exported');
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  const [savingDrive, setSavingDrive] = useState(false);
  const handleSaveToDrive = async () => {
    setSavingDrive(true);
    try {
      if (!isFinalized) await savePlan(plan);
      const result = await saveToDrive(planId);
      toast.success(result.message || 'Saved to Google Drive');
    } catch (err) { toast.error(err.message || 'Drive save failed'); }
    finally { setSavingDrive(false); }
  };

  const handleFinalize = async () => {
    try { await savePlan(plan); const r = await finalizePlan(planId); setPlan(prev => ({ ...prev, ...r })); toast.success('Plan finalized'); setConfirmFinalize(false); }
    catch { toast.error('Failed to finalize'); }
  };
  const handleReopen = async () => {
    try { const r = await reopenPlan(planId); setPlan(prev => ({ ...prev, ...r })); toast.success('Plan reopened'); }
    catch { toast.error('Failed to reopen'); }
  };

  const [dupOpen, setDupOpen] = useState(false);
  const [dupTarget, setDupTarget] = useState('same');
  const [dupPatients, setDupPatients] = useState([]);
  const [dupSelectedPatientId, setDupSelectedPatientId] = useState('');
  const [dupNewName, setDupNewName] = useState('');
  const [dupLoading, setDupLoading] = useState(false);

  const openDuplicateDialog = () => {
    setDupTarget('same'); setDupNewName(''); setDupSelectedPatientId(''); setDupOpen(true);
    import('../lib/api').then(api => api.getPatients('')).then(res => setDupPatients(res.patients || [])).catch(() => {});
  };
  const handleDuplicate = async () => {
    setDupLoading(true);
    try {
      const body = { target: dupTarget };
      if (dupTarget === 'existing') body.patient_id = dupSelectedPatientId;
      if (dupTarget === 'new') body.new_patient_name = dupNewName;
      const r = await duplicatePlan(planId, body);
      toast.success('Plan duplicated'); setDupOpen(false); navigate(`/plans/${r._id}`);
    } catch (err) { toast.error(err.message || 'Failed to duplicate'); }
    finally { setDupLoading(false); }
  };

  // Save as Template
  const [tplOpen, setTplOpen] = useState(false);
  const [tplMode, setTplMode] = useState('new');
  const [tplName, setTplName] = useState('');
  const [tplStep, setTplStep] = useState(1);
  const [tplId, setTplId] = useState('');
  const [tplList, setTplList] = useState([]);
  const [tplListLoading, setTplListLoading] = useState(false);
  const [tplSaving, setTplSaving] = useState(false);
  const tplFetchSeq = useRef(0);

  // List every template document — legacy duplicates of a (program, step)
  // are shown with their creation time so a specific one can be targeted
  const tplOptions = React.useMemo(() => {
    const counts = {};
    for (const t of tplList) {
      const key = `${(t.program_name || '').trim()}__${t.step_number}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    return tplList.map(t => ({
      ...t,
      _isDupe: counts[`${(t.program_name || '').trim()}__${t.step_number}`] > 1,
    }));
  }, [tplList]);

  const openSaveTemplateDialog = () => {
    setTplMode('new');
    setTplName(plan?.program_name || '');
    setTplStep(plan?.step_number || 1);
    setTplId('');
    setTplOpen(true);
    setTplListLoading(true);
    const seq = ++tplFetchSeq.current;
    getTemplates()
      .then(r => {
        if (seq !== tplFetchSeq.current) return; // stale response
        setTplList(r.templates || []);
      })
      .catch(() => {
        if (seq !== tplFetchSeq.current) return;
        setTplList([]);
      })
      .finally(() => {
        if (seq !== tplFetchSeq.current) return;
        setTplListLoading(false);
      });
  };
  const handleSaveTemplate = async () => {
    setTplSaving(true);
    try {
      const body = { plan_id: planId, mode: tplMode };
      if (tplMode === 'new') {
        body.program_name = tplName.trim();
        body.step_number = tplStep;
      } else {
        body.template_id = tplId;
      }
      const r = await savePlanAsTemplate(body);
      toast.success(r.message || 'Template saved');
      setTplOpen(false);
    } catch (err) { toast.error(err.message || 'Failed to save template'); }
    finally { setTplSaving(false); }
  };

  const addMonth = () => {
    if (!plan || isFinalized) return;
    const np = { ...plan }; const last = np.months?.[np.months.length - 1];
    const num = Math.ceil(last?.month_number || 0) + 1;
    np.months = [...(np.months || []), { month_number: num, supplements: (last?.supplements || []).map(s => ({ ...s })), monthly_total_cost: 0 }];
    recalcAndUpdate(np);
  };
  const addTwoWeeks = () => {
    if (!plan || isFinalized) return;
    const np = { ...plan }; const last = np.months?.[np.months.length - 1];
    const num = (last?.month_number || 0) + 0.5;
    np.months = [...(np.months || []), { month_number: num, supplements: (last?.supplements || []).map(s => ({ ...s })), monthly_total_cost: 0 }];
    recalcAndUpdate(np);
  };
  const removeLastMonth = () => {
    if (!plan || isFinalized || (plan.months?.length || 0) <= 1) return;
    const last = plan.months[plan.months.length - 1];
    const np = { ...plan }; np.months = (np.months || []).filter(m => m.month_number !== last.month_number);
    recalcAndUpdate(np);
  };

  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const globalFiltered = supplements.filter(s =>
    s.supplement_name.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
    s.company?.toLowerCase().includes(globalSearchQuery.toLowerCase())
  );

  // ⌘S save shortcut
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if (plan && !isFinalized) { e.preventDefault(); savePlan(plan); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [plan, isFinalized, savePlan]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3rem)]">
        <div className="w-5 h-5 border-2 border-[color:var(--accent-teal)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!plan) return null;

  const statusLabel = (plan.status || 'draft').toUpperCase();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-[calc(100vh-3rem)] canvas">

        {/* Page header — sticky */}
        <header className="chrome-blur hairline-b sticky top-0 z-30 px-8 pt-4 pb-3">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-[11px] text-ink-subtle mb-1.5">
            <button onClick={() => navigate('/staff/supplements')} className="hover:text-ink-3 transition-colors">Dashboard</button>
            <span className="text-ink-faint">/</span>
            {plan?.patient_id && (
              <>
                <button onClick={() => navigate(`/patients/${plan.patient_id}`)} className="hover:text-ink-3 transition-colors">
                  {plan.patient_name}
                </button>
                <span className="text-ink-faint">/</span>
              </>
            )}
            <span className="text-ink-3 font-medium">{plan?.program_name} — {plan?.step_label}</span>
          </div>

          {/* Title row */}
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              className="h-8 w-8 flex items-center justify-center rounded-md text-ink-subtle hover:text-ink hover:bg-[color:var(--surface-hover)] transition-colors shrink-0"
              aria-label="Back"
            >
              <ArrowLeft size={16} />
            </button>

            {plan.patient_id ? (
              <button
                onClick={() => navigate(`/patients/${plan.patient_id}`)}
                className="text-[20px] font-semibold text-ink tracking-[-0.02em] hover:text-[color:var(--accent-teal)] transition-colors truncate"
                data-testid="plan-editor-patient-name"
              >
                {plan.patient_name}
              </button>
            ) : (
              <Input
                value={plan.patient_name || ''}
                onChange={(e) => updatePatientName(e.target.value)}
                className="text-[20px] font-semibold border-0 bg-transparent h-9 px-0 focus-visible:ring-0 focus-visible:ring-offset-0 tracking-[-0.02em] max-w-[280px] shadow-none"
                placeholder="Patient name"
                data-testid="plan-editor-patient-name"
                disabled={isFinalized}
              />
            )}

            {/* Meta */}
            <div className="flex items-center gap-1.5 text-[12px] text-ink-muted min-w-0 truncate">
              <span className="text-ink-faint">·</span>
              <span className="truncate">{plan.program_name}</span>
              <span className="text-ink-faint">·</span>
              <span className="truncate">{plan.step_label || `Step ${plan.step_number}`}</span>
              <span className="text-ink-faint">·</span>
              <span className="font-mono tabular-nums">{plan.date}</span>
            </div>

            {/* Right cluster: status · total · saving · view toggles · actions */}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <div className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
                isFinalized
                  ? 'bg-[color:var(--accent-teal-wash)] text-[color:var(--accent-teal)]'
                  : 'bg-amber-50 text-amber-800'
              }`}>
                <Circle size={6} fill="currentColor" strokeWidth={0} />
                {statusLabel}
              </div>

              {effectiveShowCosts && (
                <div
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-[color:var(--surface-hover)] hairline border leading-none"
                  data-testid="plan-editor-cost-summary"
                >
                  <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-ink-subtle leading-none">Total</span>
                  <span
                    className="font-mono tabular-nums text-[13px] font-semibold text-ink leading-none"
                    data-testid="cost-summary-total-value"
                  >
                    {formatCurrency(plan.total_program_cost || 0)}
                  </span>
                </div>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleSaveToDrive}
                    disabled={savingDrive}
                    data-testid="plan-editor-save-drive-pill"
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-white hairline border text-[12px] font-medium text-ink-3 hover:bg-[color:var(--surface-hover)] hover:text-ink transition-colors disabled:opacity-60"
                    aria-label="Save to Dropbox"
                  >
                    {savingDrive ? (
                      <span className="w-3 h-3 border-[1.5px] border-[color:var(--accent-teal)] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CloudUpload size={13} className="text-[color:var(--accent-teal)]" />
                    )}
                    <span className="hidden md:inline">{savingDrive ? 'Saving…' : 'Save to Dropbox'}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Save to Dropbox</TooltipContent>
              </Tooltip>

              {saving && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center justify-center h-7 w-7" aria-label="Saving">
                      <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent-teal)] animate-pulse" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Saving…</TooltipContent>
                </Tooltip>
              )}

              {/* View toggles — icon only */}
              {!patientViewMode && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setShowCosts(v => !v)}
                        className="h-7 w-7 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-[color:var(--surface-hover)] transition-colors"
                        data-testid="plan-editor-toggle-costs"
                        aria-label={showCosts ? 'Hide costs' : 'Show costs'}
                      >
                        {showCosts ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {showCosts ? 'Hide costs' : 'Show costs'}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setPatientViewMode(true)}
                        className="h-7 w-7 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-[color:var(--surface-hover)] transition-colors"
                        data-testid="plan-editor-patient-view-toggle"
                        aria-label="Patient view"
                      >
                        <User size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Patient view</TooltipContent>
                  </Tooltip>
                </>
              )}

              {/* Actions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md text-[12px] font-medium text-ink-3 border hairline bg-white hover:bg-[color:var(--surface-hover)] transition-colors"
                    aria-label="Actions"
                  >
                    <MoreHorizontal size={13} />
                    <span>Actions</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">Export</DropdownMenuLabel>
                  <DropdownMenuItem onClick={handleExportPatient} disabled={exporting} data-testid="plan-editor-export-patient-pdf">
                    <Download size={13} className="mr-2" /> Export patient PDF
                  </DropdownMenuItem>
                  {!patientViewMode && (
                    <DropdownMenuItem onClick={handleExportHC} disabled={exporting} data-testid="plan-editor-export-hc-pdf">
                      <FileText size={13} className="mr-2" /> Export HC PDF
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleSaveToDrive} disabled={savingDrive} data-testid="plan-editor-save-drive">
                    <Download size={13} className="mr-2" />
                    {savingDrive ? 'Saving to Dropbox…' : 'Save to Dropbox'}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">Plan</DropdownMenuLabel>
                  <DropdownMenuItem onClick={openDuplicateDialog}>
                    <Copy size={13} className="mr-2" /> Duplicate plan
                  </DropdownMenuItem>
                  {user?.role === 'admin' && (
                    <DropdownMenuItem onClick={openSaveTemplateDialog} data-testid="plan-editor-save-as-template">
                      <Layers size={13} className="mr-2" /> Save as template
                    </DropdownMenuItem>
                  )}
                  {!isFinalized && !patientViewMode && (
                    <>
                      <DropdownMenuItem onClick={() => savePlan(plan)} disabled={saving} data-testid="plan-editor-save-button">
                        <Save size={13} className="mr-2" />
                        {saving ? 'Saving…' : 'Save plan'}
                        <kbd className="ml-auto text-[10px] font-mono text-ink-subtle">⌘S</kbd>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setConfirmFinalize(true)} className="text-amber-800" data-testid="plan-editor-finalize-button">
                        <Lock size={13} className="mr-2" /> Finalize plan
                      </DropdownMenuItem>
                    </>
                  )}
                  {isFinalized && (
                    <DropdownMenuItem onClick={handleReopen} className="text-amber-800">
                      <Unlock size={13} className="mr-2" /> Reopen plan
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Sub-toolbar */}
        {!isFinalized && !patientViewMode && (
          <div className="chrome-blur hairline-b sticky top-[80px] z-20 px-8 h-10 flex items-center gap-1">
            <Popover open={globalSearchOpen} onOpenChange={setGlobalSearchOpen}>
              <PopoverTrigger asChild>
                <button
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium bg-[color:var(--accent-teal)] text-white hover:bg-[color:var(--accent-teal-hover)] transition-colors"
                  data-testid="plan-editor-add-all-months"
                >
                  <CopyPlus size={12} />
                  Add to all months
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[460px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search supplements…" value={globalSearchQuery} onValueChange={setGlobalSearchQuery} />
                  <CommandList>
                    <CommandEmpty>No supplements found.</CommandEmpty>
                    <CommandGroup className="max-h-[300px] overflow-y-auto">
                      {globalFiltered.slice(0, 30).map(supp => (
                        <CommandItem
                          key={supp._id}
                          value={supp.supplement_name}
                          onSelect={() => { addSupplementToAllMonths(supp); setGlobalSearchOpen(false); setGlobalSearchQuery(''); }}
                          className="flex items-center justify-between cursor-pointer py-2.5 px-3"
                        >
                          <div>
                            <div className="text-[13px] font-medium">{supp.supplement_name}</div>
                            <div className="text-[11px] text-ink-subtle">{supp.company}</div>
                          </div>
                          <span className="text-[11px] font-mono text-ink-muted ml-4">{formatCurrency(supp.cost_per_bottle)}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Separator orientation="vertical" className="h-4 mx-1.5" />

            <button
              onClick={addMonth}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium text-ink-3 hover:bg-[color:var(--surface-hover)] hover:text-ink transition-colors"
              data-testid="plan-editor-add-month"
            >
              <Plus size={12} /> Add month
            </button>
            <button
              onClick={addTwoWeeks}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium text-ink-3 hover:bg-[color:var(--surface-hover)] hover:text-ink transition-colors"
            >
              <Plus size={12} /> Add 2 weeks
            </button>
            {(plan.months?.length || 0) > 1 && (
              <button
                onClick={removeLastMonth}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium text-ink-subtle hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Trash2 size={11} /> Remove last
              </button>
            )}

            <div className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-subtle">
              <CalendarDays size={12} />
              <span>{(plan.months || []).length} {(plan.months || []).length === 1 ? 'month' : 'months'}</span>
            </div>
          </div>
        )}

        {/* Banners */}
        {isFinalized && (
          <div className="mx-8 mt-4 rounded-md bg-amber-50/60 border border-amber-200/70 px-4 py-3 flex items-center gap-3">
            <Lock size={14} className="text-amber-700 shrink-0" />
            <span className="text-[13px] text-amber-900 font-medium">This plan is finalized.</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" onClick={handleReopen} className="gap-1.5 h-7 px-3 text-[12px] font-medium bg-amber-700 hover:bg-amber-800 text-white">
                <Unlock size={12} /> Reopen
              </Button>
              <Button variant="outline" size="sm" onClick={openDuplicateDialog} className="gap-1.5 h-7 px-3 text-[12px] font-medium">
                <Copy size={12} /> Duplicate
              </Button>
            </div>
          </div>
        )}
        {patientViewMode && (
          <div className="mx-8 mt-4 rounded-md bg-[color:var(--accent-teal-wash)] border border-[color:var(--accent-teal)]/20 px-4 py-3 flex items-center gap-3">
            <User size={14} className="text-[color:var(--accent-teal)] shrink-0" />
            <span className="text-[13px] text-[color:var(--accent-teal)] font-medium">Patient view — costs hidden.</span>
            <Button size="sm" onClick={() => setPatientViewMode(false)} className="ml-auto h-7 px-3 text-[12px] font-medium bg-[color:var(--accent-teal)] hover:bg-[color:var(--accent-teal-hover)] text-white">
              Exit
            </Button>
          </div>
        )}

        {/* Months */}
        <div className="px-8 py-6">
          <div className="animate-fade-up">
            {(plan.months || []).map((month) => (
              <MonthSection
                key={month.month_number}
                month={month}
                showCosts={effectiveShowCosts}
                patientView={patientViewMode}
                isFinalized={isFinalized}
                onUpdateField={updateField}
                onRemoveRow={removeRow}
                onRemoveFromAll={removeFromAllMonths}
                onReorder={reorderSupplements}
                onAddSupplement={addSupplementToMonth}
                supplements={supplements}
                formatCurrency={formatCurrency}
              />
            ))}

            {/* Program cost breakdown */}
            {effectiveShowCosts && (plan.months || []).length > 0 && (() => {
              const totalSupps = (plan.months || []).reduce(
                (sum, m) => sum + (m.supplement_cost || m.monthly_total_cost || 0), 0
              );
              const totalShip = (plan.months || []).reduce(
                (sum, m) => sum + (m.freight_total || 0), 0
              );
              const grand = plan.total_program_cost || 0;
              return (
                <div
                  className="rounded-lg border hairline overflow-hidden shadow-[var(--shadow-xs)] mt-2"
                  data-testid="plan-editor-program-summary"
                >
                  <div
                    aria-hidden
                    className="h-[2px] w-full"
                    style={{ background: 'linear-gradient(90deg, #0D5F68 0%, #46989D 50%, #0D5F68 100%)' }}
                  />
                  <div
                    className="flex items-stretch"
                    style={{
                      background: 'linear-gradient(90deg, rgba(13,95,104,0.09) 0%, rgba(70,152,157,0.13) 50%, rgba(13,95,104,0.09) 100%)',
                    }}
                  >
                    <div className="flex-1 px-5 py-4">
                      <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[color:var(--accent-teal)] mb-2">
                        Program breakdown
                      </div>
                      <div className="flex items-center gap-6 flex-wrap">
                        <div>
                          <div className="text-[11px] text-ink-subtle">Supplements</div>
                          <div className="font-mono tabular-nums text-[15px] text-ink font-medium">
                            {formatCurrency(totalSupps)}
                          </div>
                        </div>
                        <div className="w-px h-8 bg-[color:var(--hairline)]" />
                        <div>
                          <div className="text-[11px] text-ink-subtle">Shipping</div>
                          <div className="font-mono tabular-nums text-[15px] text-ink font-medium">
                            {formatCurrency(totalShip)}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="hairline-l px-6 py-4 flex flex-col items-end justify-center bg-white/40">
                      <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-ink-subtle">Program total</div>
                      <div className="font-mono tabular-nums text-[22px] font-semibold text-ink tracking-tight">
                        {formatCurrency(grand)}
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-2 hairline-t text-[10.5px] text-ink-subtle">
                    Cost visible to HC only · Patient PDFs exclude all cost info
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Duplicate dialog */}
      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent className="max-w-[440px] p-7">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-[-0.01em]">Duplicate plan</DialogTitle>
            <DialogDescription className="text-[13px] mt-1 text-ink-muted">
              Choose where to place the duplicated plan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[12px] font-medium text-ink-3">Assign to</Label>
              <Select value={dupTarget} onValueChange={setDupTarget}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="same">Same patient</SelectItem>
                  <SelectItem value="existing">Existing patient</SelectItem>
                  <SelectItem value="new">New patient</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {dupTarget === 'existing' && (
              <div className="space-y-2">
                <Label className="text-[12px] font-medium text-ink-3">Select patient</Label>
                <Select value={dupSelectedPatientId} onValueChange={setDupSelectedPatientId}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Choose a patient…" /></SelectTrigger>
                  <SelectContent>
                    {dupPatients.map(p => (
                      <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {dupTarget === 'new' && (
              <div className="space-y-2">
                <Label className="text-[12px] font-medium text-ink-3">New patient name</Label>
                <Input
                  value={dupNewName}
                  onChange={(e) => setDupNewName(e.target.value)}
                  className="h-10"
                  placeholder="e.g. Jane Smith"
                  autoFocus
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDupOpen(false)} className="h-9 px-4 text-[13px]">Cancel</Button>
            <Button
              onClick={handleDuplicate}
              disabled={dupLoading || (dupTarget === 'existing' && !dupSelectedPatientId) || (dupTarget === 'new' && !dupNewName.trim())}
              className="h-9 px-4 bg-[color:var(--accent-teal)] hover:bg-[color:var(--accent-teal-hover)] text-white text-[13px] font-medium"
            >
              {dupLoading ? 'Duplicating…' : 'Duplicate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as Template dialog */}
      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent className="max-w-[440px] p-7">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-[-0.01em]">Save as template</DialogTitle>
            <DialogDescription className="text-[13px] mt-1 text-ink-muted">
              Save this plan's supplements as a reusable protocol template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[12px] font-medium text-ink-3">Mode</Label>
              <Select value={tplMode} onValueChange={setTplMode}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Create new template</SelectItem>
                  <SelectItem value="overwrite">Overwrite existing template</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tplMode === 'new' ? (
              <>
                <div className="space-y-2">
                  <Label className="text-[12px] font-medium text-ink-3">Program name</Label>
                  <Input
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    className="h-10"
                    placeholder="e.g. Detox 1"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[12px] font-medium text-ink-3">Step number</Label>
                  <Input
                    type="number"
                    min={1}
                    value={tplStep}
                    onChange={(e) => setTplStep(parseInt(e.target.value) || 1)}
                    className="h-10 w-24 font-mono"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label className="text-[12px] font-medium text-ink-3">Template to overwrite</Label>
                <Select value={tplId} onValueChange={setTplId} disabled={tplListLoading || tplOptions.length === 0}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={
                      tplListLoading ? 'Loading templates…'
                      : tplOptions.length === 0 ? 'No templates yet'
                      : 'Choose a template…'
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {tplOptions.map(t => (
                      <SelectItem key={t._id} value={t._id}>
                        {t.program_name} — Step {t.step_number}
                        {t._isDupe ? ` · created ${fmtTplDate(t.created_at)}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!tplListLoading && tplOptions.length === 0 && (
                  <p className="text-[12px] text-ink-muted">
                    No templates exist yet — switch to “Create new template”.
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTplOpen(false)} className="h-9 px-4 text-[13px]">Cancel</Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={tplSaving || (tplMode === 'new' && !tplName.trim()) || (tplMode === 'overwrite' && !tplId)}
              className="h-9 px-4 bg-[color:var(--accent-teal)] hover:bg-[color:var(--accent-teal-hover)] text-white text-[13px] font-medium"
            >
              {tplSaving ? 'Saving…' : 'Save template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmFinalize} onOpenChange={setConfirmFinalize}>
        <AlertDialogContent className="p-7">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold tracking-[-0.01em]">Finalize this plan?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] mt-2 text-ink-muted">
              Finalizing locks the plan. You can reopen later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel className="h-9 px-4 text-[13px]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalize} className="bg-amber-700 hover:bg-amber-800 text-white h-9 px-4 text-[13px] font-medium">
              Finalize plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
