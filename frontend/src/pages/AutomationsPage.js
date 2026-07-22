import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Trash2, Play, RotateCcw, Zap, Calendar, CalendarX, CheckCircle, XCircle, ChevronDown, ChevronUp, Key, MoreHorizontalIcon, Loader2 } from 'lucide-react';
import { confirmDialog } from './admin/confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const TRIGGERS = [
  { value: 'new_booking', icon: Calendar, label: 'New booking', desc: 'When a new appointment is booked', color: 'text-emerald-600' },
  { value: 'cancelled_booking', icon: CalendarX, label: 'Cancelled booking', desc: 'When an appointment is cancelled', color: 'text-red-600' },
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
    actions: [{ id: crypto.randomUUID(), name: '', url: '', method: 'POST', includeData: true, headers: [{ key: '', value: '' }] }],
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
    actions: [{ id: crypto.randomUUID(), name: '', url: '', method: 'POST', includeData: true, headers: [{ key: '', value: '' }] }],
    enabled: true,
  });

  const addAction = () => setFormData({
    ...formData,
    actions: [...formData.actions, { id: crypto.randomUUID(), name: '', url: '', method: 'POST', includeData: true, headers: [{ key: '', value: '' }] }],
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
        id: a.id || crypto.randomUUID(), name: a.name || '', url: a.url || '', method: a.method || 'POST',
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

  const getTriggerIcon = (trigger, cls = 'size-4') => {
    if (trigger === 'new_booking') return <Calendar className={`${cls} text-emerald-600`} />;
    if (trigger === 'cancelled_booking') return <CalendarX className={`${cls} text-red-600`} />;
    return <Zap className={cls} />;
  };
  const getTriggerLabel = (trigger) => TRIGGERS.find((t) => t.value === trigger)?.label || trigger;
  const getActionsCount = (a) => (a.actions || (a.action ? [a.action] : [])).length;
  const formatDate = (dateString) => (dateString
    ? new Date(dateString).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    : 'N/A');

  const closeModal = () => { setShowCreateModal(false); setEditingAutomation(null); resetForm(); };

  if (loading) return <div className="py-16 text-center text-muted-foreground">Loading automations...</div>;

  return (
    <div className="p-5 sm:p-8 max-w-7xl 2xl:max-w-none mx-auto w-full">
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === 'logs') fetchLogs(); }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="automations">Automations<Badge variant="secondary" className="ml-1.5">{automations.length}</Badge></TabsTrigger>
            <TabsTrigger value="logs">Execution logs<Badge variant="secondary" className="ml-1.5">{logs.length}</Badge></TabsTrigger>
          </TabsList>
          <Button onClick={() => { resetForm(); setShowCreateModal(true); }}><Plus className="size-4" /> Create automation</Button>
        </div>

        {/* Automations */}
        <TabsContent value="automations" className="mt-4 space-y-4">
          <div className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm">
            <Zap className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <h3 className="font-semibold text-foreground">How automations work</h3>
              <p className="mt-1 text-sm text-muted-foreground">When a booking webhook is received, all enabled automations matching the trigger run. Each automation can have <strong className="text-foreground">multiple actions</strong>, executed in parallel.</p>
            </div>
          </div>

          {automations.length === 0 ? (
            <div className="rounded-xl border bg-card py-12 text-center shadow-sm">
              <Zap className="mx-auto mb-3 size-10 text-muted-foreground/40" />
              <h3 className="font-medium text-foreground">No automations yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">Create your first automation to forward booking data to external services.</p>
              <Button className="mt-4" onClick={() => { resetForm(); setShowCreateModal(true); }}><Plus className="size-4" /> Create automation</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {automations.map((automation) => (
                <div key={automation.id} className={cn('flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4 shadow-sm', !automation.enabled && 'opacity-70')}>
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-muted">{getTriggerIcon(automation.trigger)}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{automation.name}</span>
                        <span className={`text-xs font-semibold ${automation.enabled ? 'text-emerald-600' : 'text-muted-foreground'}`}>{automation.enabled ? 'Active' : 'Disabled'}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{getTriggerLabel(automation.trigger)}</span>
                        <span className="text-muted-foreground/50">&rarr;</span>
                        <span>{getActionsCount(automation)} webhook{getActionsCount(automation) !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleTest(automation)} disabled={testingId === automation.id}>
                      {testingId === automation.id ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Test
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8"><MoreHorizontalIcon /><span className="sr-only">Open menu</span></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditModal(automation)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleEnabled(automation)}>{automation.enabled ? 'Disable' : 'Enable'}</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(automation)}>Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Logs */}
        <TabsContent value="logs" className="mt-4 space-y-3">
          {logs.length === 0 ? (
            <div className="rounded-xl border bg-card py-12 text-center shadow-sm">
              <h3 className="font-medium text-foreground">No execution logs yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">Logs appear here when automations are triggered.</p>
            </div>
          ) : logs.map((log) => (
            <div key={log.id} className={cn('rounded-xl border border-l-4 bg-card shadow-sm', log.success ? 'border-l-emerald-500' : 'border-l-red-500')}>
              <div className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4" onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}>
                <div className="flex items-center gap-3">
                  {log.success ? <CheckCircle className="size-5 text-emerald-500" /> : <XCircle className="size-5 text-red-500" />}
                  <div>
                    <p className="font-medium text-foreground">{log.automation_name}{log.action_name && <span className="font-normal text-muted-foreground"> &rarr; {log.action_name}</span>}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{getTriggerLabel(log.trigger)}</span><span>·</span><span>{formatDate(log.executed_at)}</span>
                      {log.duration_ms && <><span>·</span><span>{log.duration_ms}ms</span></>}
                      {log.trigger_data?._test && <><span>·</span><span className="font-medium text-amber-600">Test</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!log.success && log.action_url && (
                    <Button variant="outline" size="sm" className="text-amber-600 hover:text-amber-700" onClick={(e) => { e.stopPropagation(); handleRetryLog(log); }} disabled={retryingLogId === log.id}>
                      {retryingLogId === log.id ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Retry
                    </Button>
                  )}
                  {log.response_status && <span className={`text-sm font-semibold ${log.success ? 'text-emerald-600' : 'text-red-600'}`}>{log.response_status}</span>}
                  {expandedLogId === log.id ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                </div>
              </div>
              {expandedLogId === log.id && (
                <div className="space-y-3 border-t px-4 pb-4 pt-3">
                  {log.action_url && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Webhook URL</Label>
                      <p className="mt-1 break-all rounded bg-muted p-2 font-mono text-sm">{log.action_method || 'POST'} {log.action_url}</p>
                    </div>
                  )}
                  {log.error && (
                    <div>
                      <Label className="text-xs text-red-600">Error</Label>
                      <pre className="mt-1 overflow-auto rounded bg-red-50 p-2 text-xs text-red-800">{log.error_type && <span className="font-bold">{log.error_type}: </span>}{log.error}</pre>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs text-muted-foreground">Trigger data sent</Label>
                    <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(log.trigger_data, null, 2)}</pre>
                  </div>
                  {log.response_body && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Response body</Label>
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">{log.response_body}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {/* Create / edit dialog */}
      <Dialog open={showCreateModal || !!editingAutomation} onOpenChange={(o) => { if (!o) closeModal(); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAutomation ? 'Edit automation' : 'Create automation'}</DialogTitle>
            <DialogDescription>Configure the trigger and one or more webhook actions.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="a-name">Automation name</Label>
              <Input id="a-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Sync to CRM" />
            </div>

            <div className="space-y-1.5">
              <Label>Trigger</Label>
              <div className="grid grid-cols-2 gap-3">
                {TRIGGERS.map((t) => (
                  <button key={t.value} type="button" onClick={() => setFormData({ ...formData, trigger: t.value })}
                    className={cn('rounded-lg border p-3 text-left transition-colors', formData.trigger === t.value ? 'border-primary bg-accent ring-1 ring-primary' : 'hover:border-muted-foreground/40')}>
                    <div className="flex items-center gap-2"><t.icon className={`size-5 ${t.color}`} /><span className="font-medium">{t.label}</span></div>
                    <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Webhook actions</Label>
                <Button type="button" variant="outline" size="sm" onClick={addAction}><Plus className="size-3.5" /> Add action</Button>
              </div>
              <div className="space-y-3">
                {formData.actions.map((action, index) => (
                  <div key={action.id} className="rounded-lg border bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Action {index + 1}</span>
                      {formData.actions.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => removeAction(index)}><Trash2 className="size-4" /></Button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Label (optional)</Label>
                        <Input value={action.name} onChange={(e) => updateAction(index, 'name', e.target.value)} placeholder="e.g. Send to Slack" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Webhook URL</Label>
                        <Input value={action.url} onChange={(e) => updateAction(index, 'url', e.target.value)} placeholder="https://your-service.com/webhook" />
                      </div>
                      <div className="flex flex-wrap items-end gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Method</Label>
                          <Select value={action.method} onValueChange={(v) => updateAction(index, 'method', v)}>
                            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="POST">POST</SelectItem><SelectItem value="GET">GET</SelectItem></SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2 pb-2">
                          <Switch id={`inc-${action.id}`} checked={action.includeData} onCheckedChange={(v) => updateAction(index, 'includeData', v)} />
                          <Label htmlFor={`inc-${action.id}`} className="cursor-pointer text-sm font-normal">Send booking data</Label>
                        </div>
                      </div>
                      <div className="border-t pt-3">
                        <div className="mb-2 flex items-center justify-between">
                          <Label className="flex items-center gap-1 text-xs"><Key className="size-3" /> Headers (optional)</Label>
                          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => addHeader(index)}><Plus className="size-3" /> Add header</Button>
                        </div>
                        <div className="space-y-2">
                          {(action.headers || []).map((header, hIndex) => (
                            <div key={hIndex} className="flex items-center gap-2">
                              <Input value={header.key} onChange={(e) => updateHeader(index, hIndex, 'key', e.target.value)} placeholder="Header name (e.g. X-API-Key)" className="h-8 flex-1 text-xs" />
                              <Input value={header.value} onChange={(e) => updateHeader(index, hIndex, 'value', e.target.value)} placeholder="Value" className="h-8 flex-1 text-xs"
                                type={header.key?.toLowerCase().includes('key') || header.key?.toLowerCase().includes('secret') ? 'password' : 'text'} />
                              <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => removeHeader(index, hIndex)}><Trash2 className="size-3.5" /></Button>
                            </div>
                          ))}
                          {(!action.headers || action.headers.length === 0) && (
                            <p className="text-xs italic text-muted-foreground">No custom headers. Content-Type: application/json is sent by default.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <Switch id="a-enabled" checked={formData.enabled} onCheckedChange={(v) => setFormData({ ...formData, enabled: v })} />
              <Label htmlFor="a-enabled" className="cursor-pointer font-normal">Enabled (runs when triggered)</Label>
            </div>

            <div className="rounded-lg bg-muted/40 p-4">
              <Label className="text-xs text-muted-foreground">Sample payload that will be sent</Label>
              <pre className="mt-2 max-h-32 overflow-auto text-xs">{formData.trigger === 'new_booking'
                ? '{\n  "trigger": "new_booking",\n  "booking_id": "abc123",\n  "session_date": "2026-02-15T10:00:00Z",\n  "first_name": "John",\n  "last_name": "Doe",\n  "email": "john@example.com",\n  "mobile_phone": "+1234567890",\n  "user_found": true,\n  "step_advanced": true,\n  "timestamp": "2026-02-14T..."\n}'
                : '{\n  "trigger": "cancelled_booking",\n  "booking_id": "abc123",\n  "session_date": "2026-02-15T10:00:00Z",\n  "first_name": "John",\n  "last_name": "Doe",\n  "email": "john@example.com",\n  "timestamp": "2026-02-14T..."\n}'}</pre>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={editingAutomation ? handleUpdate : handleCreate}>{editingAutomation ? 'Save changes' : 'Create automation'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AutomationsPage;
