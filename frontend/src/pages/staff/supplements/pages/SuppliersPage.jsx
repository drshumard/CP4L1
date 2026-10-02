import React, { useState, useEffect, useCallback } from 'react';
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Trash2, Truck, Search, Pencil, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader, { PageContainer } from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatCurrency } from '../lib/utils';
import '../styles/library-workspace.css';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState({ name: '', freight_charge: '', notes: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try { const res = await getSuppliers(); setSuppliers(res.suppliers || []); }
    catch (err) { setError('Suppliers could not be loaded. Please try again.'); }
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

  const visibleSuppliers = suppliers.filter(supplier => `${supplier.name} ${supplier.notes || ''}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <PageContainer>
      <PageHeader title="Suppliers" subtitle="Keep supplier details and freight rates in one place.">
        <button onClick={openAdd} data-testid="admin-suppliers-add-button" className="lib-button lib-button--primary"><Plus size={15} /> Add supplier</button>
      </PageHeader>

      <div className="library-workspace">
        {error && <div className="lib-error" role="alert"><AlertCircle size={17} /> {error}<button className="lib-button" onClick={fetchData}>Try again</button></div>}
        <div className="lib-split">
          <div>
            <div className="lib-toolbar">
              <div className="lib-search"><Search size={16} /><Input aria-label="Search suppliers" placeholder="Search suppliers…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <span className="lib-toolbar-count" aria-live="polite">{visibleSuppliers.length} supplier{visibleSuppliers.length !== 1 ? 's' : ''}</span>
            </div>
            <section className="lib-panel" data-testid="admin-suppliers-table" aria-label="Supplier directory">
              {loading ? <div className="lib-loading" role="status">Loading suppliers…</div> : error ? null : visibleSuppliers.length === 0 ? (
                <div className="lib-empty">
                  <Truck size={28} strokeWidth={1.4} />
                  <h2>{search ? 'No matching suppliers' : 'Add your first supplier'}</h2>
                  <p>{search ? 'Search by a different name or clear your search.' : 'Connect products to a supplier so freight is included in protocol estimates.'}</p>
                  <button className={`lib-button ${search ? '' : 'lib-button--primary'}`} onClick={search ? () => setSearch('') : openAdd}>{search ? 'Clear search' : 'Add supplier'}</button>
                </div>
              ) : (
                <div className="lib-table-scroll">
                  <table className="lib-table" style={{ minWidth: 550 }}>
                    <thead><tr><th scope="col">Supplier</th><th scope="col" className="lib-numeric">Monthly freight</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{visibleSuppliers.map(supplier => (
                      <tr key={supplier._id}>
                        <td className="lib-name">{supplier.name}<span className="lib-cell-detail">{supplier.notes || 'No additional notes'}</span></td>
                        <td className="lib-numeric">{formatCurrency(supplier.freight_charge || 0)}<span className="lib-cell-detail">per patient plan</span></td>
                        <td><div className="lib-row-actions"><button className="lib-row-action" onClick={() => openEdit(supplier)} aria-label={`Edit ${supplier.name}`}><Pencil size={13} /> Edit</button><button className="lib-row-action lib-row-action--danger" onClick={() => setDeleteId(supplier._id)} aria-label={`Delete ${supplier.name}`}><Trash2 size={13} /></button></div></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
          <aside className="lib-aside">
            <div className="lib-aside-icon"><Truck size={18} strokeWidth={1.5} /></div>
            <h2>How freight is calculated</h2>
            <p>A supplier’s freight charge is included once per month when products from that supplier need to ship for a patient’s plan.</p>
            <dl><div><dt>Multiple products in one shipment</dt><dd>One freight charge per month</dd></div><div><dt>No products need to ship</dt><dd>No freight charge applied</dd></div></dl>
          </aside>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent style={{ '--dialog-width': '480px' }} className="supp-theme lib-dialog max-w-[480px] p-0 gap-0 border hairline">
          <DialogHeader className="px-6 pt-6 pb-4 space-y-1">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                {editId ? 'Edit supplier' : 'Add supplier'}
              </DialogTitle>
              {editId && (
                <button
                  onClick={() => { setEditOpen(false); setDeleteId(editId); }}
                  className="lib-button lib-button--quiet lib-button--danger mr-5"
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
              <Label htmlFor="supplier-name" className="text-[13px] font-medium text-ink-3">Supplier name <span className="text-red-600">*</span></Label>
              <Input
                id="supplier-name"
                value={editData.name}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                className="h-9 text-[13px]"
                placeholder="e.g. Emerson"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-freight" className="text-[13px] font-medium text-ink-3">Freight charge ($)</Label>
              <Input
                id="supplier-freight"
                type="number"
                min="0"
                step="0.01"
                value={editData.freight_charge}
                onChange={(e) => setEditData({ ...editData, freight_charge: e.target.value })}
                className="h-9 text-[13px] tabular-nums"
                placeholder="0.00"
              />
              <p className="text-[12px] text-ink-subtle">Charged once per month when any supplement from this supplier is in a plan.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-notes" className="text-[13px] font-medium text-ink-3">Notes</Label>
              <Input
                id="supplier-notes"
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
              className="lib-button"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="lib-button lib-button--primary"
            >
              {saving ? 'Saving…' : editId ? 'Save changes' : 'Add supplier'}
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
