import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays, CheckCircle2, ChevronRight, CircleAlert, CircleDashed, CreditCard, ExternalLink, MailCheck, RefreshCw,
  Send, Tag, UserPlus, XCircle,
} from 'lucide-react';
import { adminApi } from './api';
import { fmtDate, fmtTime } from './format';
import { NoResults, SearchBox, TablePager, keepSheetOpen, useLastRecord } from './workspace-ui';
import s from './workspace.module.css';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Admin > Purchases: every /checkout and /session (Stripe) payment the webhook processed. Design:
// shumard-checkout-portal/app/admin/purchases/page.tsx (overview strip, purchase ledger, details sheet).
// A row opens the sheet: booking, account, receipt, each automation run, and "Send to automations"
// (resend to chosen Checkout-purchase webhooks, e.g. a purchase made while automations were off).
// GHL-checkout purchases aren't here: they live in GHL.

const PAGE_SIZE = 25;
const money = (cents) => `$${((cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fullName = (p) => [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email;
const initials = (p) => ((p.first_name?.[0] || '') + (p.last_name?.[0] || '')).toUpperCase() || (p.email?.[0] || '?').toUpperCase();
const stripeUrl = (p) => `https://dashboard.stripe.com/${p.id.startsWith('cs_test_') ? 'test/' : ''}payments/${p.payment_intent}`;
const driveUrl = (id) => `https://drive.google.com/file/d/${id}/view`;
const share = (n, total) => (total ? `${Math.round((n / total) * 100)}% of purchases` : 'No purchases yet');
const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

// [tone, label]: success (green) · review (amber) · none (grey) — the ledger's status chip.
function status(p) {
  if (p.status !== 'fulfilled') return ['none', 'Processing'];
  if (p.outcome === 'needs_new_time') return ['review', 'Needs a new time'];
  if (!p.receipt_sent || !p.receipt_filed) return ['review', 'Receipt issue'];
  return ['success', 'Complete'];
}

// Latest run per automation webhook (a resend after a failure counts as fixed). [tone, label]: sent · failed · none.
const latestRuns = (p) => Object.values(p.automations.reduce((m, a) => ({ ...m, [`${a.automation_name}|${a.action_name}`]: a }), {}));
function automationStatus(p) {
  if (!p.automations_fired) return ['none', 'Not run'];
  const runs = latestRuns(p);
  if (!runs.length) return ['none', 'None sent'];
  const failed = runs.filter((a) => !a.success).length;
  return failed ? ['failed', `${failed} failed`] : ['sent', `Sent to ${runs.length}`];
}

const STATUS_ICON = { success: CheckCircle2, review: CircleAlert, none: CircleDashed };
const AUTOMATION_ICON = { sent: MailCheck, failed: CircleAlert, none: CircleDashed };

function StatusChip({ p }) {
  const [tone, label] = status(p);
  const Icon = STATUS_ICON[tone];
  return <span className={s.logStatus} data-tone={tone}><Icon size={12} />{label}</span>;
}

function AutomationChip({ p }) {
  const [tone, label] = automationStatus(p);
  const Icon = AUTOMATION_ICON[tone];
  return <span className={s.automationStatus} data-tone={tone}><Icon size={13} />{label}</span>;
}

function Person({ p }) {
  return (
    <div className={s.purchasePerson}>
      <span>{initials(p)}</span>
      <div><strong>{fullName(p)}</strong><small>{p.email}</small></div>
    </div>
  );
}

function PurchaseSheet({ purchase, onClose, onSend }) {
  const p = useLastRecord(purchase);
  const b = p?.booking;
  return (
    <Sheet open={!!purchase} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className={s.detailSheet} onInteractOutside={keepSheetOpen} onEscapeKeyDown={keepSheetOpen}>
        <SheetHeader>
          <SheetTitle>Purchase details</SheetTitle>
          <SheetDescription className={s.sheetDescription}>Payment, booking, and follow-up information.</SheetDescription>
        </SheetHeader>
        {p && (
          <>
            <div className={s.purchaseSheetHeader}>
              <span>{initials(p)}</span>
              <div>
                {p.payment_intent && <small>{p.payment_intent}</small>}
                <h3>{fullName(p)}</h3>
                <p>{[p.email, p.phone].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <dl className={s.detailList}>
              <div><dt>Payment</dt><dd>{money(p.amount)} · {p.promo ? 'Promo' : 'Full price'}</dd></div>
              <div><dt>Paid</dt><dd>{fmtDate(p.paid_at)} at {fmtTime(p.paid_at)}</dd></div>
              <div>
                <dt>Strategy session</dt>
                <dd>{b ? <>{fmtDate(b.slot_start_utc)} at {fmtTime(b.slot_start_utc)}{b.host && <> with {b.host}</>}</>
                  : p.outcome === 'needs_new_time' ? 'Picking a new time' : '—'}</dd>
              </div>
              <div><dt>Account</dt><dd>{p.new_account ? 'New' : 'Existing'}{p.current_step != null && ` · Step ${p.current_step}`}</dd></div>
              <div>
                <dt>Receipt</dt>
                <dd>
                  {p.receipt_sent ? 'Emailed' : <span className={s.textDanger}>Not emailed</span>}
                  {' · '}
                  {p.receipt_filed && p.receipt_drive_file_id
                    ? <a href={driveUrl(p.receipt_drive_file_id)} target="_blank" rel="noreferrer" className={s.textLink}>PDF in Drive</a>
                    : <span className={s.textDanger}>No PDF</span>}
                </dd>
              </div>
              {p.payment_intent && (
                <div><dt>Stripe</dt><dd><a href={stripeUrl(p)} target="_blank" rel="noreferrer" className={s.textLink}>View payment <ExternalLink size={12} /></a></dd></div>
              )}
              <div><dt>Status</dt><dd><StatusChip p={p} /></dd></div>
            </dl>

            <section className={s.sheetSection} aria-labelledby="purchase-automations">
              <div className={s.sheetSectionHead}><h3 id="purchase-automations">Automations</h3><AutomationChip p={p} /></div>
              {!p.automations.length
                ? <p className={s.detailNote}>{p.automations_fired ? 'Nothing sent — no automations were on.' : 'Not run yet.'}</p>
                : (
                  <div className={s.runList}>
                    {p.automations.map((a, i) => {
                      const Icon = a.success ? CheckCircle2 : XCircle;
                      return (
                        <div key={i} className={s.runRow} data-ok={a.success}>
                          <span><Icon size={15} /></span>
                          <div>
                            <strong>{a.automation_name}</strong>
                            <small title={a.error || ''}>
                              {[a.action_name !== a.automation_name && a.action_name, a.success ? null : (a.response_status ? `HTTP ${a.response_status}` : 'error'),
                                `${fmtDate(a.executed_at)} ${fmtTime(a.executed_at)}`, a.manual && 'manual', a.is_retry && 'retry'].filter(Boolean).join(' · ')}
                            </small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </section>

            {p.status === 'fulfilled' && (
              <button type="button" className={`${s.primaryButton} ${s.fullWidthButton}`} onClick={() => onSend(p)}><Send size={16} />Send to automations</button>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
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
      <DialogContent className={s.formDialog}>
        <DialogHeader>
          <DialogTitle>Send {fullName(purchase)}’s purchase</DialogTitle>
          <DialogDescription className={s.sheetDescription}>
            Goes to the webhooks you tick, with the same data a live purchase sends (marked manual). Works even if the automation is off.
          </DialogDescription>
        </DialogHeader>
        {automations === null ? <p className={s.detailNote}>Loading automations…</p>
          : !automations.length ? <p className={s.detailNote}>No “Checkout purchase” automations yet — create one on the Automations page.</p>
            : (
              <div className={s.sendList}>
                {automations.map((a) => (
                  <div key={a.id} className={s.sendGroup}>
                    <strong>{a.name}{!a.enabled && <span className={s.personTag}>Off</span>}</strong>
                    {actionsOf(a).filter((x) => x.id).map((x) => {
                      const key = `${a.id}|${x.id}`;
                      return (
                        <label key={key}>
                          <Checkbox checked={!!picked[key]} onCheckedChange={(v) => setPicked((m) => ({ ...m, [key]: v === true }))}
                            className="border-[#c4cbd7] data-[state=checked]:border-[#3565e9] data-[state=checked]:bg-[#3565e9] data-[state=checked]:text-white" />
                          <span>{label(x)}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
        <div className={s.dialogActions}>
          <button type="button" className={s.secondaryButton} onClick={onClose} disabled={sending}>Cancel</button>
          <button type="button" className={s.primaryButton} onClick={send} disabled={!targets.length || sending}>
            <Send size={16} />{sending ? 'Sending…' : `Send${targets.length ? ` to ${targets.length}` : ''}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState(null);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');        // all | promo | full
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);     // purchase shown in the details sheet
  const [sendFor, setSendFor] = useState(null);   // purchase whose "Send to automations" dialog is open

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

  const stats = useMemo(() => {
    const all = purchases || [];
    const promo = all.filter((p) => p.promo).length;
    return { count: all.length, newPatients: all.filter((p) => p.new_account).length, promo, fullPrice: all.length - promo };
  }, [purchases]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (purchases || []).filter((p) => (kind === 'all' || (kind === 'promo') === !!p.promo)
      && (!q || [p.first_name, p.last_name, p.email, p.phone].join(' ').toLowerCase().includes(q)));
  }, [purchases, search, kind]);
  const rows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const open = (purchases || []).find((p) => p.id === openId) || null;
  const changeKind = (v) => { setKind(v); setPage(1); };
  const changeSearch = (v) => { setSearch(v); setPage(1); };
  const reset = () => { changeSearch(''); changeKind('all'); };

  return (
    <div className={s.purchasesLyra}>
      <div className={s.heading}>
        <div>
          <h1>Checkout purchases</h1>
          <p>Every payment with its booking, receipt, and follow-up status.</p>
        </div>
        <div className={s.headingActions}>
          <button type="button" className={s.secondaryButton} onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh
          </button>
        </div>
      </div>

      <section className={`${s.purchaseOverview} ${s.overviewThree}`} aria-label="Purchase overview">
        <div className={s.purchaseHero}><span>NEW PATIENTS</span><UserPlus size={21} /><strong>{purchases ? stats.newPatients : '—'}</strong><p>Portal accounts created by checkout</p></div>
        <div className={s.purchaseMetric}><span>FULL PRICE</span><CreditCard size={19} /><strong>{purchases ? stats.fullPrice : '—'}</strong><p>{share(stats.fullPrice, stats.count)}</p></div>
        <div className={s.purchaseMetric}><span>PROMO SALES</span><Tag size={19} /><strong>{purchases ? stats.promo : '—'}</strong><p>{share(stats.promo, stats.count)}</p></div>
      </section>

      <Tabs value={kind} onValueChange={changeKind} className={`${s.surface} ${s.analyticsSurface}`}>
        <div className={`${s.analyticsToolbar} ${s.usersToolbar}`}>
          <div>
            <span className={s.analyticsKicker}>PURCHASE LEDGER</span>
            <h2>All purchases<span className={s.peopleCount}>{plural(shown.length, 'purchase')}</span></h2>
          </div>
          <div className={s.usersSearchRow}>
            <div className={s.usersSearch}><SearchBox value={search} onChange={changeSearch} label="Search name, email or phone" placeholder="Name, email or phone" /></div>
          </div>
          <TabsList className={s.lyraTabs} aria-label="Purchase type">
            <TabsTrigger value="all">All <span className={s.tabCount}>{stats.count}</span></TabsTrigger>
            <TabsTrigger value="promo">Promo <span className={s.tabCount}>{stats.promo}</span></TabsTrigger>
            <TabsTrigger value="full">Full price <span className={s.tabCount}>{stats.fullPrice}</span></TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={kind} className="mt-0" aria-busy={loading}>
          {purchases === null ? (
            <p className={s.loadingRow} role="status">Loading purchases…</p>
          ) : rows.length ? (
            <div className={s.tableArea} data-busy={loading}>
              <div className={s.desktopTable}>
                <Table className={`${s.table} ${s.purchaseTable}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead><TableHead>Paid</TableHead><TableHead>Session</TableHead><TableHead>Amount</TableHead>
                      <TableHead>Automations</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Details</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => {
                      const b = p.booking;
                      return (
                        <TableRow key={p.id} className={s.purchaseRow} onClick={() => setOpenId(p.id)}>
                          <TableCell><Person p={p} /></TableCell>
                          <TableCell><span className={s.monoDate}>{fmtDate(p.paid_at)}</span><span className={s.monoTime}>{fmtTime(p.paid_at)}</span></TableCell>
                          <TableCell>
                            {b ? <>
                              <span className={s.sessionCell}>{fmtDate(b.slot_start_utc)}</span>
                              <span className={s.monoTime}>{fmtTime(b.slot_start_utc)}{b.host && <> · <span className={s.hostName}>{b.host}</span></>}</span>
                            </> : <span className={s.monoTime}>{p.outcome === 'needs_new_time' ? 'Picking a new time' : '—'}</span>}
                          </TableCell>
                          <TableCell>
                            <div className={s.purchaseAmount}><strong>{money(p.amount)}</strong><span data-tone={p.promo ? 'promo' : 'full'}>{p.promo ? 'Promo' : 'Full price'}</span></div>
                          </TableCell>
                          <TableCell><AutomationChip p={p} /></TableCell>
                          <TableCell><StatusChip p={p} /></TableCell>
                          <TableCell>
                            <button type="button" className={s.iconButton} aria-label={`View ${fullName(p)}’s purchase`} onClick={(e) => { e.stopPropagation(); setOpenId(p.id); }}><ChevronRight size={17} /></button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className={s.mobileList}>
                {rows.map((p) => (
                  <button key={p.id} type="button" className={s.purchaseMobileRow} onClick={() => setOpenId(p.id)}>
                    <div className={s.purchaseMobileTop}><Person p={p} /><strong>{money(p.amount)}</strong></div>
                    <div className={s.purchaseMobileMeta}>
                      <span><CalendarDays size={14} />{p.booking ? `${fmtDate(p.booking.slot_start_utc)} · ${fmtTime(p.booking.slot_start_utc)}` : '—'}</span>
                      <StatusChip p={p} />
                    </div>
                    <div className={s.purchaseMobileBottom}>
                      <span data-tone={p.promo ? 'promo' : 'full'}>{p.promo ? 'Promo' : 'Full price'}</span>
                      <AutomationChip p={p} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : purchases.length ? (
            <NoResults reset={reset} />
          ) : (
            <p className={s.loadingRow}>No purchases through /checkout or /session yet. GHL checkout purchases are in GHL.</p>
          )}
          <TablePager page={page} count={shown.length} pageSize={PAGE_SIZE} onChange={setPage} />
        </TabsContent>
      </Tabs>

      <PurchaseSheet purchase={open} onClose={() => setOpenId(null)} onSend={setSendFor} />
      {sendFor && <SendDialog purchase={sendFor} onClose={() => setSendFor(null)} onSent={() => { setSendFor(null); load(); }} />}
    </div>
  );
}
