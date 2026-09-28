import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Activity, Calendar, CalendarX, CheckCircle, ChevronDown, CreditCard, Key, Link2, Loader2, Pencil, Play, Plus, RotateCcw, Trash2, XCircle, Zap } from 'lucide-react';
import { confirmDialog } from './admin/confirm';
import { fmtDate, fmtTime } from './admin/format';
import { EYEBROW, INK, IconTile, LYRA_CARD, LYRA_GOLD_BUTTON, LYRA_INPUT, LYRA_INSET, LYRA_OUTLINE_BUTTON, MUTED, PageHeader, Pill, SWITCH } from './admin/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
// crypto.randomUUID only exists in secure contexts (https / localhost) — e.g. not on http://<LAN IP>:3007, where
// calling it in the form's initial state crashed the page. Same fallback as scheduling/Events.jsx.
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `a_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
const API = `${BACKEND_URL}/api`;

// Admin > Automations: brand colours (./admin/brand) in shadcncraft's Lyra style — square corners, crisp
// borders, no shadows — with the portal's own font.
const TRIGGERS = [
  { value: 'new_booking', icon: Calendar, label: 'New booking', desc: 'When a new appointment is booked', tone: 'teal' },
  { value: 'cancelled_booking', icon: CalendarX, label: 'Cancelled booking', desc: 'When an appointment is cancelled', tone: 'red' },
  { value: 'checkout_purchase', icon: CreditCard, label: 'Checkout purchase', desc: 'When someone pays on the /checkout page', tone: 'blue' },
];

const AutomationsPage = () => {
  const navigate = useNavigate();
  const [automations, setAutomations] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [retryingLogId, setRetryingLogId] = useState(null);
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [activeTab, setActiveTab] = useState('automations');

  const [formData, setFormData] = useState({
    name: '', trigger: 'new_booking',
    actions: [{ id: newId(), name: '', url: '', method: 'POST', includeData: true, headers: [{ key: '', value: '' }] }],
    enabled: true,
  });

  const fetchAutomations = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${API}/admin/automations`, { headers: { Authorization: `Bearer ${token}` } });
      setAutomations(response.data.automations || []);
    } catch (error) {
      if (error.response?.status === 403) { toast.error('Admin access required'); navigate('/'); }
      else if (error.response?.status === 401) { localStorage.clear(); navigate('/login'); }
      else { toast.error('Failed to load automations'); }
    } finally { setLoading(false); }
  }, [navigate]);

  const fetchLogs = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${API}/admin/automation-logs?limit=100`, { headers: { Authorization: `Bearer ${token}` } });
      setLogs(response.data.logs || []);
    } catch (error) { console.error('Failed to load logs:', error); }
  }, []);

  useEffect(() => { fetchAutomations(); fetchLogs(); }, [fetchAutomations, fetchLogs]);

  const resetForm = () => setFormData({
    name: '', trigger: 'new_booking',
    actions: [{ id: newId(), name: '', url: '', method: 'POST', includeData: true, headers: [{ key: '', value: '' }] }],
    enabled: true,
  });

  const addAction = () => setFormData({
    ...formData,
    actions: [...formData.actions, { id: newId(), name: '', url: '', method: 'POST', includeData: true, headers: [{ key: '', value: '' }] }],
  });

  const removeAction = (index) => {
    if (formData.actions.length <= 1) { toast.error('At least one action is required'); return; }
    setFormData({ ...formData, actions: formData.actions.filter((_, i) => i !== index) });
  };

  const updateAction = (index, field, value) => {
    const newActions = [...formData.actions];
    newActions[index] = { ...newActions[index], [field]: value };
    setFormData({ ...formData, actions: newActions });
  };

  const addHeader = (actionIndex) => {
    const newActions = [...formData.actions];
    newActions[actionIndex].headers = [...(newActions[actionIndex].headers || []), { key: '', value: '' }];
    setFormData({ ...formData, actions: newActions });
  };

  const removeHeader = (actionIndex, headerIndex) => {
    const newActions = [...formData.actions];
    newActions[actionIndex].headers = newActions[actionIndex].headers.filter((_, i) => i !== headerIndex);
    setFormData({ ...formData, actions: newActions });
  };

  const updateHeader = (actionIndex, headerIndex, field, value) => {
    const newActions = [...formData.actions];
    newActions[actionIndex].headers[headerIndex] = { ...newActions[actionIndex].headers[headerIndex], [field]: value };
    setFormData({ ...formData, actions: newActions });
  };

  const headersArrayToObject = (headers) => {
    if (!headers || headers.length === 0) return null;
    const obj = {};
    headers.forEach((h) => { if (h.key && h.key.trim()) obj[h.key.trim()] = h.value || ''; });
    return Object.keys(obj).length > 0 ? obj : null;
  };

  const headersObjectToArray = (headersObj) => {
    if (!headersObj || typeof headersObj !== 'object') return [{ key: '', value: '' }];
    const arr = Object.entries(headersObj).map(([key, value]) => ({ key, value: value || '' }));
    return arr.length > 0 ? arr : [{ key: '', value: '' }];
  };

  const buildPayload = () => ({
    name: formData.name,
    trigger: formData.trigger,
    actions: formData.actions.filter((a) => a.url).map((a) => ({
      id: a.id, name: a.name || null, type: 'webhook', url: a.url, method: a.method,
      headers: headersArrayToObject(a.headers), include_data: a.includeData,
    })),
    enabled: formData.enabled,
  });

  const handleCreate = async () => {
    if (!formData.name) { toast.error('Name is required'); return; }
    if (formData.actions.filter((a) => a.url).length === 0) { toast.error('At least one action with a URL is required'); return; }
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(`${API}/admin/automations`, buildPayload(), { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Automation created successfully');
      setShowCreateModal(false); resetForm(); fetchAutomations();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed to create automation'); }
  };

  const handleUpdate = async () => {
    if (!formData.name) { toast.error('Name is required'); return; }
    if (formData.actions.filter((a) => a.url).length === 0) { toast.error('At least one action with a URL is required'); return; }
    try {
      const token = localStorage.getItem('access_token');
      await axios.put(`${API}/admin/automations/${editingAutomation.id}`, buildPayload(), { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Automation updated successfully');
      setEditingAutomation(null); resetForm(); fetchAutomations();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed to update automation'); }
  };

  const handleDelete = async (automation) => {
    if (!(await confirmDialog({ title: 'Delete automation?', message: `Delete "${automation.name}". This can't be undone.`, confirmLabel: 'Delete' }))) return;
    try {
      const token = localStorage.getItem('access_token');
      await axios.delete(`${API}/admin/automations/${automation.id}`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Automation deleted'); fetchAutomations();
    } catch (error) { toast.error('Failed to delete automation'); }
  };

  const handleToggleEnabled = async (automation) => {
    try {
      const token = localStorage.getItem('access_token');
      await axios.put(`${API}/admin/automations/${automation.id}`, { enabled: !automation.enabled }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`Automation ${automation.enabled ? 'disabled' : 'enabled'}`); fetchAutomations();
    } catch (error) { toast.error('Failed to update automation'); }
  };

  const handleTest = async (automation) => {
    setTestingId(automation.id);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(`${API}/admin/automations/${automation.id}/test`, {}, { headers: { Authorization: `Bearer ${token}` } });
      const { success, actions_tested, results } = response.data;
      if (success) toast.success(`All ${actions_tested} action(s) succeeded!`);
      else toast.error(`${results.filter((r) => !r.success).length} of ${actions_tested} action(s) failed`);
      fetchLogs();
    } catch (error) { toast.error('Test failed: ' + (error.response?.data?.detail || error.message)); }
    finally { setTestingId(null); }
  };

  const openEditModal = (automation) => {
    const actions = automation.actions || (automation.action ? [automation.action] : []);
    setFormData({
      name: automation.name, trigger: automation.trigger,
      actions: actions.map((a) => ({
        id: a.id || newId(), name: a.name || '', url: a.url || '', method: a.method || 'POST',
        includeData: a.include_data !== false, headers: headersObjectToArray(a.headers),
      })),
      enabled: automation.enabled,
    });
    setEditingAutomation(automation);
  };

  const handleRetryLog = async (log) => {
    if (!log.trigger_data || !log.action_url) { toast.error('Cannot retry: missing data'); return; }
    setRetryingLogId(log.id);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(`${API}/admin/automation-logs/${log.id}/retry`, {}, { headers: { Authorization: `Bearer ${token}` } });
      if (response.data.success) toast.success(`Retry successful! Status: ${response.data.status_code}`);
      else toast.error(`Retry failed: ${response.data.error || `Status ${response.data.status_code}`}`);
      fetchLogs();
    } catch (error) { toast.error('Retry failed: ' + (error.response?.data?.detail || error.message)); }
    finally { setRetryingLogId(null); }
  };

  const getTriggerLabel = (trigger) => TRIGGERS.find((t) => t.value === trigger)?.label || trigger;
  const triggerOf = (trigger) => TRIGGERS.find((t) => t.value === trigger) || { icon: Zap, label: trigger, tone: 'gray' };
  const actionsOf = (a) => a.actions || (a.action ? [a.action] : []);
  const actionLabel = (x) => { if (x.name) return x.name; try { return new URL(x.url).host; } catch { return x.url || 'Webhook'; } };
  const lastRunOf = (automationId) => logs.find((l) => l.automation_id === automationId);   // logs are newest first
  const when = (iso) => (iso ? `${fmtDate(iso)} · ${fmtTime(iso)}` : 'N/A');
  const openCreate = () => { resetForm(); setShowCreateModal(true); };

  const closeModal = () => { setShowCreateModal(false); setEditingAutomation(null); resetForm(); };

  if (loading) return <div className={`py-16 text-center text-sm ${MUTED}`}>Loading automations...</div>;

  return (
    <div className="w-full space-y-6">
      <PageHeader title="Workflow" accent="automations"
        description="Send bookings and checkout purchases to GHL, n8n and any other webhook.">
        <Button className={`h-10 ${LYRA_GOLD_BUTTON}`} onClick={openCreate}><Plus className="size-4" /> Create automation</Button>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === 'logs') fetchLogs(); }} className="space-y-5">
        <TabsList className="h-10 !rounded-none border border-[#dde2e9] bg-white p-1">
          {[['automations', 'Automations', automations.length], ['logs', 'Execution logs', logs.length]].map(([value, label, count]) => (
            <TabsTrigger key={value} value={value}
              className="group gap-2 !rounded-none px-4 text-[#4b5566] data-[state=active]:bg-[#3565e9] data-[state=active]:text-white data-[state=active]:shadow-none">
              {label}
              <span className="bg-[#eef1f5] px-1.5 text-[11px] font-semibold text-[#5f6b7c] group-data-[state=active]:bg-white/20 group-data-[state=active]:text-white">{count}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Automations */}
        <TabsContent value="automations" className="mt-0 space-y-4">
          {automations.length === 0 ? (
            <div className={`${LYRA_CARD} py-14 text-center`}>
              <IconTile icon={Zap} tone="blue" className="mx-auto size-12" iconClass="size-5" />
              <h3 className={`mt-4 font-semibold ${INK}`}>No automations yet</h3>
              <p className={`mt-1 text-sm ${MUTED}`}>Create your first automation to forward bookings and purchases to other tools.</p>
              <Button className={`mt-5 h-10 ${LYRA_GOLD_BUTTON}`} onClick={openCreate}><Plus className="size-4" /> Create automation</Button>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {automations.map((automation) => {
                const t = triggerOf(automation.trigger);
                const actions = actionsOf(automation);
                const lastRun = lastRunOf(automation.id);
                return (
                  <div key={automation.id} className={`${LYRA_CARD} flex flex-col p-5`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <IconTile icon={t.icon} tone={automation.enabled ? t.tone : 'gray'} className="size-10" iconClass="size-5" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={`truncate text-[15px] font-semibold ${INK}`}>{automation.name}</p>
                            <Pill square tone={automation.enabled ? 'green' : 'gray'}>{automation.enabled ? 'Active' : 'Off'}</Pill>
                          </div>
                          <p className={`mt-0.5 text-sm ${MUTED}`}>{t.label} → {actions.length} webhook{actions.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <Switch checked={!!automation.enabled} onCheckedChange={() => handleToggleEnabled(automation)} className={SWITCH}
                        aria-label={`${automation.enabled ? 'Turn off' : 'Turn on'} ${automation.name}`} />
                    </div>

                    <div className="mb-4 mt-4 flex flex-wrap gap-1.5">
                      {actions.map((x, i) => (
                        <span key={x.id || i} className="inline-flex max-w-full items-center gap-1.5 border border-[#e6e9ef] bg-[#f7f9fc] px-2.5 py-1 text-xs text-[#4b5566]" title={x.url}>
                          <Link2 className="size-3 shrink-0 text-[#3565e9]" /><span className="truncate">{actionLabel(x)}</span>
                        </span>
                      ))}
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f5] pt-3">
                      <span className={`flex items-center gap-1.5 text-xs ${MUTED}`}>
                        {lastRun
                          ? <>{lastRun.success ? <CheckCircle className="size-3.5 text-[#17794a]" /> : <XCircle className="size-3.5 text-[#b42318]" />} Last run {when(lastRun.executed_at)}</>
                          : 'No runs yet'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" className={LYRA_OUTLINE_BUTTON} onClick={() => handleTest(automation)} disabled={testingId === automation.id}>
                          {testingId === automation.id ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Test
                        </Button>
                        <Button variant="outline" size="sm" className={LYRA_OUTLINE_BUTTON} onClick={() => openEditModal(automation)}><Pencil className="size-3.5" /> Edit</Button>
                        <Button variant="ghost" size="icon" className="size-8 !rounded-none text-[#8a94a6] hover:bg-[#fdecec] hover:text-[#b42318]"
                          onClick={() => handleDelete(automation)} aria-label={`Delete ${automation.name}`}><Trash2 className="size-4" /></Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Logs */}
        <TabsContent value="logs" className="mt-0">
          <div className={`${LYRA_CARD} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="flex items-center gap-3">
                <IconTile icon={Activity} tone="blue" className="size-9" />
                <div>
                  <p className={`text-sm font-semibold ${INK}`}>Execution logs</p>
                  <p className={`text-xs ${MUTED}`}>The last 100 webhook calls. Click one to see what was sent and returned.</p>
                </div>
              </div>
              <Button variant="outline" size="icon" className={`size-9 shrink-0 text-[#3565e9] ${LYRA_OUTLINE_BUTTON}`} onClick={fetchLogs} aria-label="Refresh logs"><RotateCcw className="size-4" /></Button>
            </div>
            {logs.length === 0 ? (
              <div className={`border-t border-[#eef1f5] py-14 text-center text-sm ${MUTED}`}>No execution logs yet. They appear here when automations run.</div>
            ) : (
              <div className="divide-y divide-[#eef1f5] border-t border-[#eef1f5]">
                {logs.map((log) => {
                  const t = triggerOf(log.trigger);
                  const open = expandedLogId === log.id;
                  return (
                    <div key={log.id}>
                      <div className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 hover:bg-[#f5f8ff]" onClick={() => setExpandedLogId(open ? null : log.id)}>
                        <IconTile icon={log.success ? CheckCircle : XCircle} tone={log.success ? 'green' : 'red'} className="size-8" />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-medium ${INK}`}>
                            {log.automation_name}{log.action_name && log.action_name !== log.automation_name && <span className={`font-normal ${MUTED}`}> › {log.action_name}</span>}
                          </p>
                          <p className={`text-xs ${MUTED}`}>{when(log.executed_at)}{log.duration_ms ? ` · ${log.duration_ms}ms` : ''}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Pill square tone={t.tone}>{getTriggerLabel(log.trigger)}</Pill>
                          {log.trigger_data?._test && <Pill square tone="gold" dot={false}>Test</Pill>}
                          {log.manual && <Pill square tone="blue" dot={false}>Manual</Pill>}
                          {log.is_retry && <Pill square tone="gray" dot={false}>Retry</Pill>}
                          <Pill square tone={log.success ? 'green' : 'red'} dot={false}>{log.response_status || log.error_type || 'Error'}</Pill>
                        </div>
                        <div className="flex items-center gap-2">
                          {!log.success && log.action_url && (
                            <Button variant="outline" size="sm" className={LYRA_OUTLINE_BUTTON} onClick={(e) => { e.stopPropagation(); handleRetryLog(log); }} disabled={retryingLogId === log.id}>
                              {retryingLogId === log.id ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Retry
                            </Button>
                          )}
                          <ChevronDown className={`size-4 text-[#b5bfcd] transition-transform ${open ? 'rotate-180 text-[#3565e9]' : ''}`} />
                        </div>
                      </div>
                      {open && (
                        <div className="space-y-3 bg-[#fafbfd] px-5 pb-5 pt-1">
                          {log.action_url && (
                            <div>
                              <p className={`mb-1.5 ${EYEBROW} ${MUTED}`}>Webhook</p>
                              <p className={`${LYRA_INSET} break-all px-3 py-2 font-mono text-xs ${INK}`}><span className="font-semibold text-[#2654cc]">{log.action_method || 'POST'}</span> {log.action_url}</p>
                            </div>
                          )}
                          {log.error && (
                            <div>
                              <p className={`mb-1.5 ${EYEBROW} text-[#b42318]`}>Error</p>
                              <pre className="overflow-auto border border-[#f6cfcc] bg-[#fdecec] px-3 py-2 text-xs text-[#8f1d13]">{log.error_type && <span className="font-bold">{log.error_type}: </span>}{log.error}</pre>
                            </div>
                          )}
                          <div>
                            <p className={`mb-1.5 ${EYEBROW} ${MUTED}`}>Data sent</p>
                            <pre className={`${LYRA_INSET} max-h-48 overflow-auto px-3 py-2 text-xs ${INK}`}>{JSON.stringify(log.trigger_data, null, 2)}</pre>
                          </div>
                          {log.response_body && (
                            <div>
                              <p className={`mb-1.5 ${EYEBROW} ${MUTED}`}>Response</p>
                              <pre className={`${LYRA_INSET} max-h-48 overflow-auto px-3 py-2 text-xs ${INK}`}>{log.response_body}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create / edit dialog */}
      <Dialog open={showCreateModal || !!editingAutomation} onOpenChange={(o) => { if (!o) closeModal(); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto !rounded-none border-[#dde2e9] bg-white">
          <DialogHeader>
            <p className={`flex items-center gap-2 ${EYEBROW} text-[#2d5fdc]`}><Zap className="size-3.5" /> Automation</p>
            <DialogTitle className={`text-xl tracking-[-0.5px] ${INK}`}>{editingAutomation ? 'Edit automation' : 'Create automation'}</DialogTitle>
            <DialogDescription className={`text-sm ${MUTED}`}>Pick what triggers it, then add one or more webhooks to send to.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="a-name" className={INK}>Automation name</Label>
              <Input id="a-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Checkout to GHL" className={LYRA_INPUT} />
            </div>

            <div className="space-y-1.5">
              <Label className={INK}>Trigger</Label>
              <div className="grid gap-3 sm:grid-cols-3">
                {TRIGGERS.map((t) => {
                  const on = formData.trigger === t.value;
                  return (
                    <button key={t.value} type="button" onClick={() => setFormData({ ...formData, trigger: t.value })}
                      className={cn('border p-3 text-left transition-colors', on ? 'border-[#3565e9] bg-[#f5f8ff] ring-1 ring-[#3565e9]' : 'border-[#e6e9ef] hover:border-[#c4cbd7]')}>
                      <IconTile icon={t.icon} tone={on ? t.tone : 'gray'} className="size-8" />
                      <p className={`mt-2 text-sm font-medium ${INK}`}>{t.label}</p>
                      <p className={`mt-0.5 text-xs ${MUTED}`}>{t.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className={INK}>Webhooks</Label>
                <Button type="button" variant="outline" size="sm" className={LYRA_OUTLINE_BUTTON} onClick={addAction}><Plus className="size-3.5" /> Add webhook</Button>
              </div>
              <div className="space-y-3">
                {formData.actions.map((action, index) => (
                  <div key={action.id} className={`${LYRA_INSET} p-4`}>
                    <div className="mb-3 flex items-center justify-between">
                      <span className={`${EYEBROW} ${MUTED}`}>Webhook {index + 1}</span>
                      {formData.actions.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="size-7 !rounded-none text-[#8a94a6] hover:bg-[#fdecec] hover:text-[#b42318]" onClick={() => removeAction(index)}><Trash2 className="size-4" /></Button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className={`text-xs ${INK}`}>Label (optional)</Label>
                        <Input value={action.name} onChange={(e) => updateAction(index, 'name', e.target.value)} placeholder="e.g. Post-purchase workflow" className={LYRA_INPUT} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className={`text-xs ${INK}`}>Webhook URL</Label>
                        <Input value={action.url} onChange={(e) => updateAction(index, 'url', e.target.value)} placeholder="https://your-service.com/webhook" className={LYRA_INPUT} />
                      </div>
                      <div className="flex flex-wrap items-end gap-4">
                        <div className="space-y-1.5">
                          <Label className={`text-xs ${INK}`}>Method</Label>
                          <Select value={action.method} onValueChange={(v) => updateAction(index, 'method', v)}>
                            <SelectTrigger className={`w-28 ${LYRA_INPUT}`}><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="POST">POST</SelectItem><SelectItem value="GET">GET</SelectItem></SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2 pb-2">
                          <Switch id={`inc-${action.id}`} checked={action.includeData} onCheckedChange={(v) => updateAction(index, 'includeData', v)} className={SWITCH} />
                          <Label htmlFor={`inc-${action.id}`} className={`cursor-pointer text-sm font-normal ${INK}`}>Send the event data</Label>
                        </div>
                      </div>
                      <div className="border-t border-[#e6e9ef] pt-3">
                        <div className="mb-2 flex items-center justify-between">
                          <Label className={`flex items-center gap-1 text-xs ${INK}`}><Key className="size-3 text-[#3565e9]" /> Headers (optional)</Label>
                          <Button type="button" variant="ghost" size="sm" className="!rounded-none text-[#2654cc] hover:bg-[#e8efff]" onClick={() => addHeader(index)}><Plus className="size-3" /> Add header</Button>
                        </div>
                        <div className="space-y-2">
                          {(action.headers || []).map((header, hIndex) => (
                            <div key={hIndex} className="flex items-center gap-2">
                              <Input value={header.key} onChange={(e) => updateHeader(index, hIndex, 'key', e.target.value)} placeholder="Header name (e.g. X-API-Key)" className={`h-8 flex-1 text-xs ${LYRA_INPUT}`} />
                              <Input value={header.value} onChange={(e) => updateHeader(index, hIndex, 'value', e.target.value)} placeholder="Value" className={`h-8 flex-1 text-xs ${LYRA_INPUT}`}
                                type={header.key?.toLowerCase().includes('key') || header.key?.toLowerCase().includes('secret') ? 'password' : 'text'} />
                              <Button type="button" variant="ghost" size="icon" className="size-8 !rounded-none text-[#8a94a6] hover:bg-[#fdecec] hover:text-[#b42318]" onClick={() => removeHeader(index, hIndex)}><Trash2 className="size-3.5" /></Button>
                            </div>
                          ))}
                          {(!action.headers || action.headers.length === 0) && (
                            <p className={`text-xs italic ${MUTED}`}>No custom headers. Content-Type: application/json is sent by default.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 border border-[#e6e9ef] px-4 py-3">
              <Switch id="a-enabled" checked={formData.enabled} onCheckedChange={(v) => setFormData({ ...formData, enabled: v })} className={SWITCH} />
              <Label htmlFor="a-enabled" className={`cursor-pointer font-normal ${INK}`}>On — runs automatically when triggered</Label>
            </div>

            <div>
              <p className={`mb-1.5 ${EYEBROW} ${MUTED}`}>Sample data that will be sent</p>
              <pre className={`${LYRA_INSET} max-h-40 overflow-auto px-3 py-2 text-xs ${INK}`}>{formData.trigger === 'checkout_purchase'
                ? '{\n  "trigger": "checkout_purchase",\n  "first_name": "John",\n  "last_name": "Doe",\n  "email": "john@example.com",\n  "mobile_phone": "+1234567890",\n  "amount": 97.0,\n  "currency": "usd",\n  "booking_id": "abc123",\n  "session_date": "2026-02-15T10:00:00Z",\n  "timezone": "America/Chicago",\n  "outcome": "booked",\n  "new_account": true,\n  "stripe_session_id": "cs_...",\n  "stripe_payment_intent_id": "pi_...",\n  "user_id": "...",\n  "timestamp": "2026-02-14T..."\n}'
                : formData.trigger === 'new_booking'
                ? '{\n  "trigger": "new_booking",\n  "booking_id": "abc123",\n  "session_date": "2026-02-15T10:00:00Z",\n  "first_name": "John",\n  "last_name": "Doe",\n  "email": "john@example.com",\n  "mobile_phone": "+1234567890",\n  "user_found": true,\n  "step_advanced": true,\n  "timestamp": "2026-02-14T..."\n}'
                : '{\n  "trigger": "cancelled_booking",\n  "booking_id": "abc123",\n  "session_date": "2026-02-15T10:00:00Z",\n  "first_name": "John",\n  "last_name": "Doe",\n  "email": "john@example.com",\n  "timestamp": "2026-02-14T..."\n}'}</pre>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className={LYRA_OUTLINE_BUTTON} onClick={closeModal}>Cancel</Button>
            <Button className={LYRA_GOLD_BUTTON} onClick={editingAutomation ? handleUpdate : handleCreate}>{editingAutomation ? 'Save changes' : 'Create automation'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AutomationsPage;
