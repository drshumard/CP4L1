import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Plus, Trash2, Edit2, Play, Check, X, 
  Zap, Calendar, CalendarX, ExternalLink, Clock, 
  CheckCircle, XCircle, ChevronDown, ChevronUp
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AutomationsPage = () => {
  const navigate = useNavigate();
  const [automations, setAutomations] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [activeTab, setActiveTab] = useState('automations'); // 'automations' or 'logs'
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    trigger: 'new_booking',
    url: '',
    method: 'POST',
    includeData: true,
    enabled: true
  });

  const fetchAutomations = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${API}/admin/automations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAutomations(response.data.automations || []);
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error('Admin access required');
        navigate('/');
      } else if (error.response?.status === 401) {
        localStorage.clear();
        navigate('/login');
      } else {
        toast.error('Failed to load automations');
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const fetchLogs = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${API}/admin/automation-logs?limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLogs(response.data.logs || []);
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  }, []);

  useEffect(() => {
    fetchAutomations();
    fetchLogs();
  }, [fetchAutomations, fetchLogs]);

  const resetForm = () => {
    setFormData({
      name: '',
      trigger: 'new_booking',
      url: '',
      method: 'POST',
      includeData: true,
      enabled: true
    });
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.url) {
      toast.error('Name and URL are required');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      await axios.post(`${API}/admin/automations`, {
        name: formData.name,
        trigger: formData.trigger,
        action: {
          type: 'webhook',
          url: formData.url,
          method: formData.method,
          include_data: formData.includeData
        },
        enabled: formData.enabled
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Automation created successfully');
      setShowCreateModal(false);
      resetForm();
      fetchAutomations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create automation');
    }
  };

  const handleUpdate = async () => {
    if (!formData.name || !formData.url) {
      toast.error('Name and URL are required');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      await axios.put(`${API}/admin/automations/${editingAutomation.id}`, {
        name: formData.name,
        trigger: formData.trigger,
        action: {
          type: 'webhook',
          url: formData.url,
          method: formData.method,
          include_data: formData.includeData
        },
        enabled: formData.enabled
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Automation updated successfully');
      setEditingAutomation(null);
      resetForm();
      fetchAutomations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update automation');
    }
  };

  const handleDelete = async (automation) => {
    if (!window.confirm(`Are you sure you want to delete "${automation.name}"?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      await axios.delete(`${API}/admin/automations/${automation.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Automation deleted');
      fetchAutomations();
    } catch (error) {
      toast.error('Failed to delete automation');
    }
  };

  const handleToggleEnabled = async (automation) => {
    try {
      const token = localStorage.getItem('access_token');
      await axios.put(`${API}/admin/automations/${automation.id}`, {
        enabled: !automation.enabled
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(`Automation ${automation.enabled ? 'disabled' : 'enabled'}`);
      fetchAutomations();
    } catch (error) {
      toast.error('Failed to update automation');
    }
  };

  const handleTest = async (automation) => {
    setTestingId(automation.id);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(`${API}/admin/automations/${automation.id}/test`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        toast.success(`Test successful! Status: ${response.data.status_code}`);
      } else {
        toast.error(`Test failed: ${response.data.error || `Status ${response.data.status_code}`}`);
      }
      
      fetchLogs();
    } catch (error) {
      toast.error('Test failed: ' + (error.response?.data?.detail || error.message));
    } finally {
      setTestingId(null);
    }
  };

  const openEditModal = (automation) => {
    setFormData({
      name: automation.name,
      trigger: automation.trigger,
      url: automation.action?.url || '',
      method: automation.action?.method || 'POST',
      includeData: automation.action?.include_data !== false,
      enabled: automation.enabled
    });
    setEditingAutomation(automation);
  };

  const getTriggerIcon = (trigger) => {
    switch (trigger) {
      case 'new_booking':
        return <Calendar className="w-4 h-4 text-green-500" />;
      case 'cancelled_booking':
        return <CalendarX className="w-4 h-4 text-red-500" />;
      default:
        return <Zap className="w-4 h-4" />;
    }
  };

  const getTriggerLabel = (trigger) => {
    switch (trigger) {
      case 'new_booking':
        return 'New Booking';
      case 'cancelled_booking':
        return 'Cancelled Booking';
      default:
        return trigger;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading automations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin/logs')}
                className="flex items-center gap-2"
                data-testid="back-to-logs-btn"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Logs
              </Button>
              <div className="h-6 w-px bg-gray-300" />
              <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Zap className="w-5 h-5 text-teal-600" />
                Automations
              </h1>
            </div>
            <Button
              onClick={() => { resetForm(); setShowCreateModal(true); }}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700"
              data-testid="create-automation-btn"
            >
              <Plus className="w-4 h-4" />
              Create Automation
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === 'automations' ? 'default' : 'outline'}
            onClick={() => setActiveTab('automations')}
            className={activeTab === 'automations' ? 'bg-teal-600 hover:bg-teal-700' : ''}
          >
            Automations ({automations.length})
          </Button>
          <Button
            variant={activeTab === 'logs' ? 'default' : 'outline'}
            onClick={() => setActiveTab('logs')}
            className={activeTab === 'logs' ? 'bg-teal-600 hover:bg-teal-700' : ''}
          >
            Execution Logs ({logs.length})
          </Button>
        </div>

        {activeTab === 'automations' && (
          <>
            {/* Info Card */}
            <Card className="mb-6 bg-blue-50 border-blue-200">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-blue-900">How Automations Work</h3>
                    <p className="text-sm text-blue-700 mt-1">
                      When a booking webhook is received, all enabled automations matching the trigger will execute. 
                      The webhook data (booking details, user info) will be sent to your configured URL.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Automations List */}
            {automations.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Automations Yet</h3>
                  <p className="text-gray-500 mb-4">Create your first automation to forward booking data to external services.</p>
                  <Button 
                    onClick={() => { resetForm(); setShowCreateModal(true); }}
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Automation
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {automations.map((automation) => (
                  <motion.div
                    key={automation.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className={`${!automation.enabled ? 'opacity-60' : ''}`}>
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg ${automation.enabled ? 'bg-teal-100' : 'bg-gray-100'}`}>
                              {getTriggerIcon(automation.trigger)}
                            </div>
                            <div>
                              <h3 className="font-medium text-gray-900 flex items-center gap-2">
                                {automation.name}
                                {!automation.enabled && (
                                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Disabled</span>
                                )}
                              </h3>
                              <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                                <span className="flex items-center gap-1">
                                  {getTriggerIcon(automation.trigger)}
                                  {getTriggerLabel(automation.trigger)}
                                </span>
                                <span className="text-gray-300">→</span>
                                <span className="flex items-center gap-1">
                                  <ExternalLink className="w-3 h-3" />
                                  {automation.action?.method || 'POST'} {automation.action?.url?.substring(0, 50)}...
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTest(automation)}
                              disabled={testingId === automation.id}
                              className="flex items-center gap-1"
                              data-testid={`test-automation-${automation.id}`}
                            >
                              {testingId === automation.id ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                              ) : (
                                <Play className="w-3 h-3" />
                              )}
                              Test
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleEnabled(automation)}
                              className={automation.enabled ? 'text-orange-600 hover:text-orange-700' : 'text-green-600 hover:text-green-700'}
                            >
                              {automation.enabled ? 'Disable' : 'Enable'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditModal(automation)}
                              data-testid={`edit-automation-${automation.id}`}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(automation)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              data-testid={`delete-automation-${automation.id}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-3">
            {logs.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Execution Logs Yet</h3>
                  <p className="text-gray-500">Logs will appear here when automations are triggered.</p>
                </CardContent>
              </Card>
            ) : (
              logs.map((log) => (
                <Card key={log.id} className={`${log.success ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500'}`}>
                  <CardContent className="py-3">
                    <div 
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                    >
                      <div className="flex items-center gap-3">
                        {log.success ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{log.automation_name}</p>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            {getTriggerIcon(log.trigger)}
                            <span>{getTriggerLabel(log.trigger)}</span>
                            <span>•</span>
                            <span>{formatDate(log.executed_at)}</span>
                            {log.trigger_data?._test && (
                              <>
                                <span>•</span>
                                <span className="text-orange-600">Test</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {log.response_status && (
                          <span className={`text-sm px-2 py-0.5 rounded ${
                            log.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {log.response_status}
                          </span>
                        )}
                        {expandedLogId === log.id ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                    
                    <AnimatePresence>
                      {expandedLogId === log.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                            {log.error && (
                              <div>
                                <Label className="text-xs text-red-600">Error</Label>
                                <pre className="mt-1 p-2 bg-red-50 rounded text-xs text-red-800 overflow-auto">
                                  {log.error}
                                </pre>
                              </div>
                            )}
                            <div>
                              <Label className="text-xs text-gray-500">Trigger Data Sent</Label>
                              <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-auto max-h-40">
                                {JSON.stringify(log.trigger_data, null, 2)}
                              </pre>
                            </div>
                            {log.response_body && (
                              <div>
                                <Label className="text-xs text-gray-500">Response</Label>
                                <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-auto max-h-40">
                                  {log.response_body}
                                </pre>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </main>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {(showCreateModal || editingAutomation) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => { setShowCreateModal(false); setEditingAutomation(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingAutomation ? 'Edit Automation' : 'Create Automation'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Configure when and where to send booking data
                </p>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Send to CRM"
                    className="mt-1"
                    data-testid="automation-name-input"
                  />
                </div>
                
                <div>
                  <Label>Trigger *</Label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, trigger: 'new_booking' })}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        formData.trigger === 'new_booking' 
                          ? 'border-teal-500 bg-teal-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      data-testid="trigger-new-booking"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-green-500" />
                        <span className="font-medium">New Booking</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        When a new appointment is booked
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, trigger: 'cancelled_booking' })}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        formData.trigger === 'cancelled_booking' 
                          ? 'border-teal-500 bg-teal-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      data-testid="trigger-cancelled-booking"
                    >
                      <div className="flex items-center gap-2">
                        <CalendarX className="w-5 h-5 text-red-500" />
                        <span className="font-medium">Cancelled Booking</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        When an appointment is cancelled
                      </p>
                    </button>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="url">Webhook URL *</Label>
                  <Input
                    id="url"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    placeholder="https://your-service.com/webhook"
                    className="mt-1"
                    data-testid="automation-url-input"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The URL where booking data will be sent
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="method">HTTP Method</Label>
                    <select
                      id="method"
                      value={formData.method}
                      onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                      className="mt-1 w-full p-2 border border-gray-300 rounded-md"
                      data-testid="automation-method-select"
                    >
                      <option value="POST">POST</option>
                      <option value="GET">GET</option>
                    </select>
                  </div>
                  <div>
                    <Label>Include Data</Label>
                    <div className="mt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.includeData}
                          onChange={(e) => setFormData({ ...formData, includeData: e.target.checked })}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">Send booking data in request</span>
                      </label>
                    </div>
                  </div>
                </div>
                
                <div>
                  <Label>Status</Label>
                  <div className="mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.enabled}
                        onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">Enabled (automation will run when triggered)</span>
                    </label>
                  </div>
                </div>
                
                {/* Data Preview */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <Label className="text-xs text-gray-500">Sample Data That Will Be Sent</Label>
                  <pre className="mt-2 text-xs overflow-auto max-h-32">
{formData.trigger === 'new_booking' ? `{
  "trigger": "new_booking",
  "booking_id": "abc123",
  "session_date": "2026-02-15T10:00:00Z",
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "mobile_phone": "+1234567890",
  "user_found": true,
  "step_advanced": true,
  "timestamp": "2026-02-14T..."
}` : `{
  "trigger": "cancelled_booking",
  "booking_id": "abc123",
  "session_date": "2026-02-15T10:00:00Z",
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "timestamp": "2026-02-14T..."
}`}
                  </pre>
                </div>
              </div>
              
              <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setShowCreateModal(false); setEditingAutomation(null); resetForm(); }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={editingAutomation ? handleUpdate : handleCreate}
                  className="bg-teal-600 hover:bg-teal-700"
                  data-testid="save-automation-btn"
                >
                  {editingAutomation ? 'Save Changes' : 'Create Automation'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AutomationsPage;
