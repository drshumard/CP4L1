import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, RefreshCw, Search, Send, XCircle } from 'lucide-react';
import { adminApi } from './api';
import { fmtDate, fmtTime } from './format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Admin > Purchases: every /checkout (Stripe) payment the webhook processed, with what fulfillment did
// for it — booking, account, receipt, automations — so nobody needs the Stripe dashboard to check an order.
// GHL-checkout purchases aren't here: they're paid and recorded in GHL. "Send to automations" resends a
// purchase to chosen Checkout-purchase automation webhooks (e.g. one made while automations were off).

const HEADER_GRADIENT = 'linear-gradient(to top, #F8F8F8, #F8F8F899, #00000000)';
const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;
const stripeUrl = (p) => `https://dashboard.stripe.com/${p.id.startsWith('cs_test_') ? 'test/' : ''}payments/${p.payment_intent}`;
const driveUrl = (id) => `https://drive.google.com/file/d/${id}/view`;

function Check({ ok, children }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return <span className={`flex items-center gap-1.5 ${ok ? 'text-emerald-700' : 'text-red-600'}`}><Icon className="size-3.5 shrink-0" />{children}</span>;
}

function Session({ p }) {
  if (p.status !== 'fulfilled') return <Badge variant="outline">Processing</Badge>;
  if (p.outcome === 'needs_new_time') return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Needs a new time</Badge>;
  const b = p.booking;
  if (!b) return <span className="text-muted-foreground">—</span>;
  return (
    <div>
      <div className="cad-mono whitespace-nowrap">{fmtDate(b.slot_start_utc)}</div>
      <div className="whitespace-nowrap text-xs text-muted-foreground"><span className="cad-mono">{fmtTime(b.slot_start_utc)}</span> · {b.host || 'Host not set'}</div>
      {b.status !== 'confirmed' && <Badge variant="outline" className="mt-1 capitalize">{String(b.status || '').replace('_', ' ')}</Badge>}
    </div>
  );
}

function Automations({ p }) {
  if (!p.automations_fired) return <span className="text-muted-foreground">Not run yet</span>;
  if (!p.automations.length) return <span className="text-muted-foreground">None were on</span>;
  return (
    <div className="space-y-1">
      {p.automations.map((a, i) => (
        <Check key={i} ok={a.success}>
          <span title={a.error || `HTTP ${a.response_status}`}>
            {a.automation_name}
            {a.action_name && a.action_name !== a.automation_name && <span className="text-muted-foreground"> › {a.action_name}</span>}
            {a.success ? '' : ` · ${a.response_status || 'error'}`}{a.is_retry ? ' (retry)' : ''}{a.manual ? ' (manual)' : ''}
          </span>
        </Check>
      ))}
    </div>
  );
}

function SendDialog({ purchase, onClose, onSent }) {
  const [automations, setAutomations] = useState(null);
  const [picked, setPicked] = useState({});   // "automationId|actionId" -> true
  const [sending, setSending] = useState(false);
  useEffect(() => {
    adminApi.get('/admin/automations')
      .then((r) => setAutomations((r.data.automations || []).filter((a) => a.trigger === 'checkout_purchase')))
      .catch(() => { toast.error('Failed to load automations'); setAutomations([]); });
  }, []);
  const actionsOf = (a) => a.actions || (a.action ? [a.action] : []);
  const targets = Object.keys(picked).filter((k) => picked[k]).map((k) => { const [automation_id, action_id] = k.split('|'); return { automation_id, action_id }; });
  const label = (x) => { if (x.name) return x.name; try { return new URL(x.url).host; } catch { return x.url || 'Webhook'; } };

  const send = async () => {
    setSending(true);
    try {
      const r = await adminApi.post(`/admin/purchases/${purchase.id}/automations`, { targets });
      const results = r.data.results || [];
      const failed = results.filter((x) => !x.success);
      if (failed.length) toast.error(`${failed.length} of ${results.length} failed: ${failed.map((x) => x.automation_name).join(', ')}`);
      else toast.success(`Sent to ${results.length} webhook${results.length === 1 ? '' : 's'}`);
      onSent();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send to automations</DialogTitle>
          <DialogDescription>
            {[purchase.first_name, purchase.last_name].filter(Boolean).join(' ')}’s purchase goes to the webhooks you tick, with the same data a live purchase sends (marked manual). Works even if the automation is switched off.
          </DialogDescription>
        </DialogHeader>
        {automations === null ? <p className="py-4 text-sm text-muted-foreground">Loading automations...</p>
          : !automations.length ? <p className="py-4 text-sm text-muted-foreground">No “Checkout purchase” automations yet — create one on the Automations page.</p>
            : (
              <div className="max-h-80 space-y-4 overflow-y-auto py-1">
                {automations.map((a) => (
                  <div key={a.id}>
                    <p className="flex items-center gap-2 text-sm font-medium">{a.name}{!a.enabled && <Badge variant="outline">Off</Badge>}</p>
                    <div className="mt-2 space-y-2 pl-1">
                      {actionsOf(a).filter((x) => x.id).map((x) => {
                        const key = `${a.id}|${x.id}`;
                        return (
                          <label key={key} className="flex cursor-pointer items-center gap-2.5 text-sm">
                            <Checkbox checked={!!picked[key]} onCheckedChange={(v) => setPicked((m) => ({ ...m, [key]: v === true }))} />
                            <span>{label(x)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={!targets.length || sending}>{sending ? 'Sending...' : `Send${targets.length ? ` (${targets.length})` : ''}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendFor, setSendFor] = useState(null);   // the purchase whose "Send to automations" dialog is open

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.get('/admin/purchases');
      setPurchases(r.data.purchases || []);
    } catch (e) {
      toast.error(e?.response?.status === 403 ? 'Admin access required' : 'Failed to load purchases');
      setPurchases((p) => p || []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!purchases || !q) return purchases || [];
    return purchases.filter((p) => [p.first_name, p.last_name, p.email, p.phone].join(' ').toLowerCase().includes(q));
  }, [purchases, search]);
  const total = shown.reduce((sum, p) => sum + (p.amount || 0), 0);

  if (purchases === null) return <div className="py-16 text-center text-muted-foreground">Loading purchases...</div>;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-5 sm:p-8 2xl:max-w-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name, email or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <p className="text-sm text-muted-foreground sm:ml-auto">{shown.length} purchase{shown.length === 1 ? '' : 's'} · {money(total)}</p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b hover:bg-transparent" style={{ backgroundImage: HEADER_GRADIENT }}>
              {['Paid', 'Customer', 'Amount', 'Session', 'Account', 'Receipt', 'Automations'].map((h) => (
                <TableHead key={h} className="h-14 px-4 align-middle text-[13px] font-semibold text-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length ? shown.map((p) => (
              <TableRow key={p.id} className="align-top">
                <TableCell className="whitespace-nowrap px-4 py-3 text-sm">
                  <div className="cad-mono">{fmtDate(p.paid_at)}</div>
                  <div className="cad-mono text-xs text-muted-foreground">{fmtTime(p.paid_at)}</div>
                </TableCell>
                <TableCell className="px-4 py-3 text-sm">
                  <div className="font-medium">{[p.first_name, p.last_name].filter(Boolean).join(' ') || '—'}</div>
                  <div className="text-xs text-muted-foreground">{p.email}</div>
                  {p.phone && <div className="text-xs text-muted-foreground">{p.phone}</div>}
                </TableCell>
                <TableCell className="px-4 py-3 text-sm">
                  <div className="font-medium">{money(p.amount)}</div>
                  {p.promo && <Badge className="mt-1 bg-amber-100 text-amber-800 hover:bg-amber-100">Promo</Badge>}
                  {p.payment_intent && (
                    <a href={stripeUrl(p)} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground hover:text-foreground">
                      Stripe <ExternalLink className="size-3" />
                    </a>
                  )}
                </TableCell>
                <TableCell className="px-4 py-3 text-sm"><Session p={p} /></TableCell>
                <TableCell className="px-4 py-3 text-sm">
                  <div className="whitespace-nowrap">{p.new_account ? 'New account' : 'Existing account'}</div>
                  {p.current_step != null && <div className="text-xs text-muted-foreground">Step {p.current_step}</div>}
                </TableCell>
                <TableCell className="space-y-1 px-4 py-3 text-sm">
                  <Check ok={p.receipt_sent}><span className="whitespace-nowrap">{p.receipt_sent ? 'Emailed' : 'Not emailed'}</span></Check>
                  {p.receipt_filed && p.receipt_drive_file_id
                    ? <a href={driveUrl(p.receipt_drive_file_id)} target="_blank" rel="noreferrer" className="block"><Check ok><span className="whitespace-nowrap">PDF in Drive</span></Check></a>
                    : <Check ok={false}><span className="whitespace-nowrap">Not in Drive</span></Check>}
                </TableCell>
                <TableCell className="min-w-[240px] px-4 py-3 text-sm">
                  <Automations p={p} />
                  {p.status === 'fulfilled' && (
                    <Button variant="outline" size="sm" className="mt-2 h-7 px-2 text-xs" onClick={() => setSendFor(p)}><Send className="size-3" /> Send to automations</Button>
                  )}
                </TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {purchases.length ? 'No purchases match your search.' : 'No purchases through /checkout yet. GHL checkout purchases are in GHL.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {sendFor && <SendDialog purchase={sendFor} onClose={() => setSendFor(null)} onSent={() => { setSendFor(null); load(); }} />}
    </div>
  );
}
