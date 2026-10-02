import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { Plus, Search, Snowflake, Trash2, Pencil, Package, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader, { PageContainer } from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import '../styles/library-workspace.css';

const emptySupp = {
  supplement_name: '', company: '', supplier: '', units_per_bottle: '', unit_type: 'caps',
  default_quantity_per_dose: '', default_frequency_per_day: '', default_dosage_display: '',
  cost_per_bottle: '', default_instructions: '', refrigerate: false, notes: '', active: true,
};

export default function SupplementsPage() {
  const [supplements, setSupplements] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState(emptySupp);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [supplierList, setSupplierList] = useState([]);
  const requestSequence = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError('');
    try {
      const [suppRes, compRes] = await Promise.all([getSupplements(search, false), getSuppliers()]);
      if (requestId !== requestSequence.current) return;
      setSupplements(suppRes.supplements || []); setTotal(suppRes.total || 0);
      setSupplierList(compRes.suppliers || []);
    } catch (err) { if (requestId === requestSequence.current) setError('The supplement library could not be loaded. Please try again.'); }
    finally { if (requestId === requestSequence.current) setLoading(false); }
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

  const visibleSupplements = supplements.filter(supp => status === 'all' || (status === 'active' ? supp.active !== false : supp.active === false));

  return (
    <PageContainer>
      <PageHeader title="Supplement library" subtitle="Manage the products, pricing and defaults used in your protocols.">
        <button onClick={openAdd} data-testid="admin-supplements-add-button" className="lib-button lib-button--primary">
          <Plus size={15} /> Add supplement
        </button>
      </PageHeader>

      <div className="library-workspace">
        <div className="lib-toolbar">
          <div className="lib-search">
            <Search size={16} />
            <Input aria-label="Search supplements" placeholder="Search supplements…" value={search}
              onChange={(e) => setSearch(e.target.value)} data-testid="admin-supplements-search-input" />
          </div>
          <div className="lib-tabs" role="group" aria-label="Supplement availability">
            {[['all', 'All products'], ['active', 'Active'], ['inactive', 'Inactive']].map(([value, label]) => (
              <button key={value} className="lib-tab" aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>
            ))}
          </div>
          <span className="lib-toolbar-count" aria-live="polite">{loading ? 'Loading library…' : `${visibleSupplements.length} products`}</span>
        </div>
        {error && <div className="lib-error" role="alert"><AlertCircle size={17} /> {error}<button className="lib-button" onClick={fetchData}>Try again</button></div>}
        <section className="lib-panel" data-testid="admin-supplements-table" aria-label="Supplement catalog">
          {loading ? <div className="lib-loading" role="status">Loading supplements…</div> : error ? null : visibleSupplements.length === 0 ? (
            <div className="lib-empty">
              <Package size={28} strokeWidth={1.4} />
              <h2>{search || status !== 'all' ? 'No matching supplements' : 'Build your supplement library'}</h2>
              <p>{search || status !== 'all' ? 'Try a different search or show all products.' : 'Add a product once, then reuse its pricing and dosage defaults in every protocol.'}</p>
              {search || status !== 'all' ? <button className="lib-button" onClick={() => { setSearch(''); setStatus('all'); }}>Clear filters</button>
                : <button className="lib-button lib-button--primary" onClick={openAdd}><Plus size={15} /> Add supplement</button>}
            </div>
          ) : (
            <div className="lib-table-scroll">
              <table className="lib-table" style={{ minWidth: 850 }}>
                <thead><tr><th scope="col">Supplement</th><th scope="col">Default dosage</th><th scope="col">Bottle size</th><th scope="col" className="lib-numeric">Price / bottle</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{visibleSupplements.map(supp => (
                  <tr key={supp._id}>
                    <td className="lib-name"><div className="lib-product-name">{supp.supplement_name}{supp.refrigerate && <Snowflake size={14} aria-label="Keep refrigerated" />}</div><span className="lib-cell-detail">{supp.company || supp.manufacturer || 'No manufacturer'}</span></td>
                    <td>{supp.default_dosage_display || <span className="text-ink-muted">Not set</span>}<span className="lib-cell-detail">{supp.default_instructions || 'No default instructions'}</span></td>
                    <td className="tabular-nums whitespace-nowrap">{supp.units_per_bottle ? `${supp.units_per_bottle} ${supp.unit_type || ''}` : '—'}</td>
                    <td className="lib-numeric">{formatCurrency(supp.cost_per_bottle)}</td>
                    <td><span className={`lib-badge ${supp.active !== false ? 'lib-badge--active' : ''}`}>{supp.active !== false ? 'Active' : 'Inactive'}</span></td>
                    <td><button className="lib-row-action" onClick={() => openEdit(supp)} aria-label={`Edit ${supp.supplement_name}`}><Pencil size={13} /> Edit</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {!loading && !error && visibleSupplements.length > 0 && <div className="lib-table-footer"><span>{visibleSupplements.length} shown{total > supplements.length ? ` · ${total} matching products; refine your search to see more` : ''}</span><span>Active products are available when building protocols.</span></div>}
        </section>
      </div>

      {/* Edit/Add dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent style={{ '--dialog-width': '680px' }} className="supp-theme lib-dialog max-w-[680px] p-0 gap-0 border hairline">
          <DialogHeader className="px-6 pt-6 pb-3 space-y-1">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em] text-ink truncate">
                {editId ? editData.supplement_name || 'Edit supplement' : 'Add supplement'}
              </DialogTitle>
              {editId && (
                <button
                  onClick={() => setDeleteId(editId)}
                  className="lib-button lib-button--quiet lib-button--danger mr-5"
                >
                  <Trash2 size={11} /> Delete
                </button>
              )}
            </div>
            <DialogDescription className="text-[12.5px] text-ink-muted">Product details and defaults for new protocol entries.</DialogDescription>
          </DialogHeader>
          <section className="lib-dialog-section" aria-labelledby="supp-product-details">
            <h3 id="supp-product-details">Product details</h3>
            <div className="lib-dialog-grid">
              <div className="lib-field lib-field--full"><Label htmlFor="supp-name">Supplement name <span className="text-red-600">*</span></Label><Input id="supp-name" value={editData.supplement_name} onChange={(e) => setEditData({ ...editData, supplement_name: e.target.value })} autoFocus /></div>
              <div className="lib-field"><Label htmlFor="supp-manufacturer">Manufacturer</Label><Input id="supp-manufacturer" value={editData.company} onChange={(e) => setEditData({ ...editData, company: e.target.value })} placeholder="e.g. Quicksilver" /></div>
              <div className="lib-field"><Label htmlFor="supp-supplier">Supplier</Label><Select value={editData.supplier || 'none'} onValueChange={(v) => setEditData({ ...editData, supplier: v })}><SelectTrigger id="supp-supplier"><SelectValue /></SelectTrigger><SelectContent className="supp-theme"><SelectItem value="none">No supplier</SelectItem>{supplierList.map(s => <SelectItem key={s._id} value={s.name}>{s.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="lib-field"><Label htmlFor="supp-units">Units per bottle</Label><Input id="supp-units" type="number" min="0" value={editData.units_per_bottle} onChange={(e) => setEditData({ ...editData, units_per_bottle: e.target.value })} /></div>
              <div className="lib-field"><Label htmlFor="supp-unit-type">Unit type</Label><Select value={editData.unit_type} onValueChange={(v) => setEditData({ ...editData, unit_type: v })}><SelectTrigger id="supp-unit-type"><SelectValue /></SelectTrigger><SelectContent className="supp-theme">{[['caps', 'Capsules'], ['ml', 'ml'], ['serving', 'Serving'], ['scoop', 'Scoop'], ['pump', 'Pump'], ['drop', 'Drop'], ['tablet', 'Tablet'], ['packet', 'Packet'], ['g', 'Grams'], ['lozenge', 'Lozenge']].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="lib-field"><Label htmlFor="supp-cost">Price per bottle ($)</Label><Input id="supp-cost" type="number" min="0" step="0.01" value={editData.cost_per_bottle} onChange={(e) => setEditData({ ...editData, cost_per_bottle: e.target.value })} /></div>
            </div>
          </section>
          <section className="lib-dialog-section" aria-labelledby="supp-defaults">
            <h3 id="supp-defaults">Protocol defaults</h3>
            <div className="lib-dialog-grid">
              <div className="lib-field"><Label htmlFor="supp-quantity">Quantity per dose</Label><Input id="supp-quantity" type="number" min="0" value={editData.default_quantity_per_dose} onChange={(e) => setEditData({ ...editData, default_quantity_per_dose: e.target.value })} /></div>
              <div className="lib-field"><Label htmlFor="supp-frequency">Doses per day</Label><Input id="supp-frequency" type="number" min="0" value={editData.default_frequency_per_day} onChange={(e) => setEditData({ ...editData, default_frequency_per_day: e.target.value })} /></div>
              <div className="lib-field lib-field--full"><Label htmlFor="supp-dosage">Dosage text</Label><Input id="supp-dosage" value={editData.default_dosage_display} onChange={(e) => setEditData({ ...editData, default_dosage_display: e.target.value })} placeholder="e.g. 2 caps, 3 times a day" /></div>
              <div className="lib-field lib-field--full"><Label htmlFor="supp-instructions">Instructions</Label><Input id="supp-instructions" value={editData.default_instructions} onChange={(e) => setEditData({ ...editData, default_instructions: e.target.value })} placeholder="e.g. Take with food" /></div>
              <div className="lib-field lib-field--full"><Label htmlFor="supp-notes">Internal notes</Label><Input id="supp-notes" value={editData.notes} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} placeholder="Optional" /></div>
              <div className="lib-switch-field"><div><Label htmlFor="supp-refrigerate">Refrigerate</Label><p>Requires cold storage</p></div><Switch id="supp-refrigerate" checked={editData.refrigerate} onCheckedChange={(v) => setEditData({ ...editData, refrigerate: v })} /></div>
              <div className="lib-switch-field"><div><Label htmlFor="supp-active">Active product</Label><p>Available for new protocols</p></div><Switch id="supp-active" checked={editData.active} onCheckedChange={(v) => setEditData({ ...editData, active: v })} /></div>
            </div>
          </section>
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
              {saving ? 'Saving…' : editId ? 'Save changes' : 'Add supplement'}
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
