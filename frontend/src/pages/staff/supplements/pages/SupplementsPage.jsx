import React, { useState, useEffect, useCallback } from 'react';
import { getSupplements, createSupplement, updateSupplement, deleteSupplement, getSuppliers } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Search, Snowflake, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader, { PageContainer } from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';

const emptySupp = {
  supplement_name: '', company: '', supplier: '', units_per_bottle: '', unit_type: 'caps',
  default_quantity_per_dose: '', default_frequency_per_day: '', default_dosage_display: '',
  cost_per_bottle: '', default_instructions: '', refrigerate: false, notes: '', active: true,
};

export default function SupplementsPage() {
  const [supplements, setSupplements] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState(emptySupp);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [supplierList, setSupplierList] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [suppRes, compRes] = await Promise.all([getSupplements(search, false), getSuppliers()]);
      setSupplements(suppRes.supplements || []); setTotal(suppRes.total || 0);
      setSupplierList(compRes.suppliers || []);
    } catch (err) { toast.error('Failed to load supplements'); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAdd = () => { setEditId(null); setEditData({ ...emptySupp }); setEditOpen(true); };
  const openEdit = (supp) => {
    setEditId(supp._id);
    setEditData({
      supplement_name: supp.supplement_name || '',
      company: supp.company || supp.manufacturer || '',
      supplier: supp.supplier || '',
      units_per_bottle: supp.units_per_bottle ?? '',
      unit_type: supp.unit_type || 'caps',
      default_quantity_per_dose: supp.default_quantity_per_dose ?? '',
      default_frequency_per_day: supp.default_frequency_per_day ?? '',
      default_dosage_display: supp.default_dosage_display || '',
      cost_per_bottle: supp.cost_per_bottle ?? '',
      default_instructions: supp.default_instructions || '',
      refrigerate: supp.refrigerate || false,
      notes: supp.notes || '',
      active: supp.active !== false,
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editData.supplement_name.trim()) { toast.error('Supplement name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...editData,
        supplier: editData.supplier === 'none' ? '' : editData.supplier,
        manufacturer: editData.company,
        units_per_bottle: editData.units_per_bottle ? parseInt(editData.units_per_bottle) : null,
        default_quantity_per_dose: editData.default_quantity_per_dose ? parseInt(editData.default_quantity_per_dose) : null,
        default_frequency_per_day: editData.default_frequency_per_day ? parseInt(editData.default_frequency_per_day) : null,
        cost_per_bottle: editData.cost_per_bottle ? parseFloat(editData.cost_per_bottle) : 0,
      };
      if (editId) { await updateSupplement(editId, payload); toast.success('Updated'); }
      else { await createSupplement(payload); toast.success('Added'); }
      setEditOpen(false); fetchData();
    } catch (err) { toast.error(err.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await deleteSupplement(deleteId); toast.success('Deleted'); setEditOpen(false); fetchData(); }
    catch (err) { toast.error('Delete failed'); }
    finally { setDeleteId(null); }
  };

  const activeCount = supplements.filter(s => s.active !== false).length;

  return (
    <PageContainer>
      <PageHeader
        title="Supplement library"
        subtitle={`${total} total · ${activeCount} active`}
      >
        <button
          onClick={openAdd}
          data-testid="admin-supplements-add-button"
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[13px] font-medium bg-[color:var(--accent-teal)] text-white hover:bg-[color:var(--accent-teal-hover)] shadow-[var(--shadow-xs)]"
        >
          <Plus size={14} /> Add supplement
        </button>
      </PageHeader>

      <div className="px-8 py-6">
        <div className="relative max-w-[360px] mb-4">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <Input
            placeholder="Search supplements…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="admin-supplements-search-input"
            className="pl-9 h-9 text-[13px] bg-white"
          />
        </div>

        <div
          className="rounded-lg border hairline surface overflow-hidden shadow-[var(--shadow-xs)]"
          data-testid="admin-supplements-table"
        >
          <div
            className="grid items-center h-9 px-5 hairline-b text-[10px] font-semibold tracking-[0.09em] uppercase text-[color:var(--accent-teal)]"
            style={{
              gridTemplateColumns: 'minmax(220px,1.4fr) 160px 110px minmax(160px,1.2fr) 100px',
              background: 'linear-gradient(90deg, rgba(13,95,104,0.08) 0%, rgba(70,152,157,0.12) 50%, rgba(13,95,104,0.08) 100%)',
            }}
          >
            <span>Name</span>
            <span>Brand</span>
            <span>Size</span>
            <span>Dosage</span>
            <span className="text-right">Price</span>
          </div>

          {loading ? (
            <div className="h-40 flex items-center justify-center gap-2 text-[12px] text-ink-muted">
              <div className="w-4 h-4 border-2 border-[color:var(--accent-teal)] border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : supplements.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-[13px] text-ink-muted">No supplements found</div>
          ) : (
            supplements.map(supp => (
              <div
                key={supp._id}
                onClick={() => openEdit(supp)}
                className="grid items-center min-h-[42px] px-5 py-1.5 border-b border-[color:var(--hairline)] last:border-b-0 row-hover cursor-pointer transition-colors"
                style={{ gridTemplateColumns: 'minmax(220px,1.4fr) 160px 110px minmax(160px,1.2fr) 100px' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px] font-medium text-ink truncate">{supp.supplement_name}</span>
                  {supp.refrigerate && <Snowflake size={11} className="text-blue-500 shrink-0" />}
                </div>
                <span className="text-[12.5px] text-ink-muted truncate">{supp.company || supp.manufacturer || '—'}</span>
                <span className="font-mono tabular-nums text-[12.5px] text-ink-3">
                  {supp.units_per_bottle || '—'} {supp.unit_type}
                </span>
                <span className="text-[12.5px] text-ink-3 truncate">{supp.default_dosage_display || '—'}</span>
                <span className="font-mono tabular-nums text-[13px] font-semibold text-ink text-right whitespace-nowrap">
                  {formatCurrency(supp.cost_per_bottle)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Edit/Add dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[680px] p-0 gap-0 overflow-hidden rounded-xl border hairline shadow-[var(--shadow-lg)]">
          <DialogHeader className="px-6 pt-6 pb-3 space-y-1">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em] text-ink truncate">
                {editId ? editData.supplement_name || 'Edit supplement' : 'Add supplement'}
              </DialogTitle>
              {editId && (
                <button
                  onClick={() => setDeleteId(editId)}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={11} /> Delete
                </button>
              )}
            </div>
            <DialogDescription className="text-[12.5px] text-ink-muted">Master supplement record.</DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-5 grid grid-cols-3 gap-x-3.5 gap-y-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Name <span className="text-red-600">*</span></Label>
              <Input value={editData.supplement_name} onChange={(e) => setEditData({ ...editData, supplement_name: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Unit type</Label>
              <Select value={editData.unit_type} onValueChange={(v) => setEditData({ ...editData, unit_type: v })}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="caps">Capsules</SelectItem>
                  <SelectItem value="ml">ml</SelectItem>
                  <SelectItem value="serving">Serving</SelectItem>
                  <SelectItem value="scoop">Scoop</SelectItem>
                  <SelectItem value="pump">Pump</SelectItem>
                  <SelectItem value="drop">Drop</SelectItem>
                  <SelectItem value="tablet">Tablet</SelectItem>
                  <SelectItem value="packet">Packet</SelectItem>
                  <SelectItem value="g">Grams</SelectItem>
                  <SelectItem value="lozenge">Lozenge</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Manufacturer</Label>
              <Input value={editData.company} onChange={(e) => setEditData({ ...editData, company: e.target.value })} className="h-9 text-[13px]" placeholder="e.g. Quicksilver" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Supplier</Label>
              <Select value={editData.supplier || 'none'} onValueChange={(v) => setEditData({ ...editData, supplier: v })}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No supplier</SelectItem>
                  {supplierList.map(s => <SelectItem key={s._id} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Units / bottle</Label>
              <Input type="number" value={editData.units_per_bottle} onChange={(e) => setEditData({ ...editData, units_per_bottle: e.target.value })} className="h-9 text-[13px] font-mono tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Cost / bottle ($)</Label>
              <Input type="number" step="0.01" value={editData.cost_per_bottle} onChange={(e) => setEditData({ ...editData, cost_per_bottle: e.target.value })} className="h-9 text-[13px] font-mono tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Default qty / dose</Label>
              <Input type="number" value={editData.default_quantity_per_dose} onChange={(e) => setEditData({ ...editData, default_quantity_per_dose: e.target.value })} className="h-9 text-[13px] font-mono tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Default freq / day</Label>
              <Input type="number" value={editData.default_frequency_per_day} onChange={(e) => setEditData({ ...editData, default_frequency_per_day: e.target.value })} className="h-9 text-[13px] font-mono tabular-nums" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Default dosage display</Label>
              <Input value={editData.default_dosage_display} onChange={(e) => setEditData({ ...editData, default_dosage_display: e.target.value })} className="h-9 text-[13px]" placeholder="e.g. 2 caps 3x/day" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Default instructions</Label>
              <Input value={editData.default_instructions} onChange={(e) => setEditData({ ...editData, default_instructions: e.target.value })} className="h-9 text-[13px]" placeholder="e.g. With food" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Notes</Label>
              <Input value={editData.notes} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div className="flex items-center gap-2.5 pt-6">
              <Switch checked={editData.refrigerate} onCheckedChange={(v) => setEditData({ ...editData, refrigerate: v })} />
              <Label className="text-[12px] font-medium text-ink-3">Refrigerate</Label>
            </div>
            <div className="flex items-center gap-2.5 pt-6">
              <Switch checked={editData.active} onCheckedChange={(v) => setEditData({ ...editData, active: v })} />
              <Label className="text-[12px] font-medium text-ink-3">Active</Label>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 bg-[color:var(--surface-hover)] hairline-t gap-2">
            <button
              onClick={() => setEditOpen(false)}
              className="h-9 px-4 rounded-md text-[13px] font-medium border hairline bg-white hover:bg-[color:var(--surface-subtle)] text-ink-3 hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-9 px-4 rounded-md text-[13px] font-semibold bg-[color:var(--accent-teal)] hover:bg-[color:var(--accent-teal-hover)] text-white disabled:opacity-60"
            >
              {saving ? 'Saving…' : editId ? 'Update' : 'Add supplement'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Delete this supplement?"
        description="This action cannot be undone."
        confirmLabel="Delete supplement"
        destructive
        onConfirm={handleDelete}
      />
    </PageContainer>
  );
}
