import React, { useState, useEffect, useCallback } from 'react';
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader, { PageContainer } from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState({ name: '', freight_charge: '', notes: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { const res = await getSuppliers(); setSuppliers(res.suppliers || []); }
    catch (err) { toast.error('Failed to load suppliers'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAdd = () => { setEditId(null); setEditData({ name: '', freight_charge: '', notes: '' }); setEditOpen(true); };
  const openEdit = (s) => {
    setEditId(s._id);
    setEditData({ name: s.name, freight_charge: s.freight_charge ?? '', notes: s.notes || '' });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editData.name.trim()) { toast.error('Supplier name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: editData.name.trim(),
        freight_charge: editData.freight_charge ? parseFloat(editData.freight_charge) : 0,
        notes: editData.notes,
      };
      if (editId) { await updateSupplier(editId, payload); toast.success('Supplier updated'); }
      else { await createSupplier(payload); toast.success('Supplier added'); }
      setEditOpen(false); fetchData();
    } catch (err) { toast.error(err.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await deleteSupplier(deleteId); toast.success('Supplier deleted'); fetchData(); }
    catch (err) { toast.error(err.message || 'Delete failed'); }
    finally { setDeleteId(null); }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Suppliers"
        subtitle="Freight is charged once per supplier per month"
      >
        <button
          onClick={openAdd}
          data-testid="admin-suppliers-add-button"
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[13px] font-medium bg-[color:var(--accent-teal)] text-white hover:bg-[color:var(--accent-teal-hover)] shadow-[var(--shadow-xs)]"
        >
          <Plus size={14} /> Add supplier
        </button>
      </PageHeader>

      <div className="px-8 py-6">
        <div
          className="rounded-lg border hairline surface overflow-hidden shadow-[var(--shadow-xs)]"
          data-testid="admin-suppliers-table"
        >
          <div
            className="grid items-center h-9 px-5 hairline-b text-[10px] font-semibold tracking-[0.09em] uppercase text-[color:var(--accent-teal)]"
            style={{
              gridTemplateColumns: '1fr 160px',
              background: 'linear-gradient(90deg, rgba(13,95,104,0.08) 0%, rgba(70,152,157,0.12) 50%, rgba(13,95,104,0.08) 100%)',
            }}
          >
            <span>Supplier</span>
            <span className="text-right">Freight</span>
          </div>

          {loading ? (
            <div className="h-40 flex items-center justify-center gap-2 text-[12px] text-ink-muted">
              <div className="w-4 h-4 border-2 border-[color:var(--accent-teal)] border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : suppliers.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2 text-ink-subtle">
              <Truck size={26} strokeWidth={1.4} className="text-ink-faint" />
              <p className="text-[13px] text-ink-muted">No suppliers yet</p>
            </div>
          ) : (
            suppliers.map(s => (
              <div
                key={s._id}
                onClick={() => openEdit(s)}
                className="grid items-center min-h-[48px] px-5 py-2 border-b border-[color:var(--hairline)] last:border-b-0 row-hover cursor-pointer transition-colors"
                style={{ gridTemplateColumns: '1fr 160px' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-md bg-[color:var(--accent-teal-wash)] flex items-center justify-center shrink-0">
                    <Truck size={13} className="text-[color:var(--accent-teal)]" />
                  </div>
                  <span className="text-[13px] font-medium text-ink truncate">{s.name}</span>
                </div>
                <span className="font-mono tabular-nums text-[13px] font-semibold text-ink text-right whitespace-nowrap">
                  ${(s.freight_charge || 0).toFixed(2)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[440px] p-0 gap-0 overflow-hidden rounded-xl border hairline shadow-[var(--shadow-lg)]">
          <DialogHeader className="px-6 pt-6 pb-4 space-y-1">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                {editId ? 'Edit supplier' : 'Add supplier'}
              </DialogTitle>
              {editId && (
                <button
                  onClick={() => { setEditOpen(false); setDeleteId(editId); }}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={11} /> Delete
                </button>
              )}
            </div>
            <DialogDescription className="text-[13px] text-ink-muted">
              {editId ? 'Update supplier details.' : 'Add a new supplier with freight charge.'}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-5 grid gap-3.5">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Supplier name <span className="text-red-600">*</span></Label>
              <Input
                value={editData.name}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                className="h-9 text-[13px]"
                placeholder="e.g. Emerson"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Freight charge ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={editData.freight_charge}
                onChange={(e) => setEditData({ ...editData, freight_charge: e.target.value })}
                className="h-9 text-[13px] font-mono tabular-nums"
                placeholder="0.00"
              />
              <p className="text-[11.5px] text-ink-subtle">Charged once per month when any supplement from this supplier is in a plan.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-ink-3">Notes</Label>
              <Input
                value={editData.notes}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                className="h-9 text-[13px]"
                placeholder="Optional"
              />
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
              {saving ? 'Saving…' : editId ? 'Update' : 'Add supplier'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Delete this supplier?"
        description="Supplements using this supplier will keep the name but won't have freight applied."
        confirmLabel="Delete supplier"
        destructive
        onConfirm={handleDelete}
      />
    </PageContainer>
  );
}
