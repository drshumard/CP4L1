import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Activity, Filter, RefreshCw, Download, ArrowLeft, Clock, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ActivityLogs = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    event_type: '',
    user_email: '',
    limit: 100
  });

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams();
      
      if (filters.event_type) params.append('event_type', filters.event_type);
      if (filters.user_email) params.append('user_email', filters.user_email);
      params.append('limit', filters.limit);

      const response = await axios.get(`${API}/admin/activity-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setLogs(response.data.logs);
      setEventTypes(response.data.event_types);
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        toast.error('Unauthorized access');
        navigate('/login');
      } else {
        toast.error('Failed to fetch activity logs');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    fetchLogs();
  };

  const clearFilters = () => {
    setFilters({ event_type: '', user_email: '', limit: 100 });
    setTimeout(() => fetchLogs(), 100);
  };

  const exportLogs = () => {
    const csvContent = [
      ['Timestamp', 'Event Type', 'User Email', 'User ID', 'Status', 'Details'],
      ...logs.map(log => [
        log.timestamp,
        log.event_type,
        log.user_email || 'N/A',
        log.user_id || 'N/A',
        log.status,
        JSON.stringify(log.details || {})
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity_logs_${new Date().toISOString()}.csv`;
    a.click();
    toast.success('Logs exported successfully');
  };

  const getEventIcon = (eventType) => {
    switch (eventType) {
      case 'USER_CREATED':
        return <User className="text-teal-600" size={18} />;
      case 'LOGIN_SUCCESS':
      case 'SIGNUP_SUCCESS':
        return <CheckCircle2 className="text-green-600" size={18} />;
      case 'LOGIN_FAILED':
      case 'SIGNUP_FAILED':
        return <AlertCircle className="text-red-600" size={18} />;
      case 'EMAIL_SENT':
        return <CheckCircle2 className="text-blue-600" size={18} />;
      case 'EMAIL_FAILED':
        return <AlertCircle className="text-orange-600" size={18} />;
      default:
        return <Activity className="text-gray-600" size={18} />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failure':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 50%, #A5F3FC 100%)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading activity logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: 'linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 50%, #A5F3FC 100%)' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2"
            >
              <ArrowLeft size={18} />
              Back to Admin
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                <Activity className="text-teal-600" size={32} />
                Activity Logs
              </h1>
              <p className="text-gray-600 mt-1">Monitor all backend events and user activities</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={fetchLogs}
              className="flex items-center gap-2"
            >
              <RefreshCw size={18} />
              Refresh
            </Button>
            <Button
              onClick={exportLogs}
              className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white flex items-center gap-2"
            >
              <Download size={18} />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6 border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="text-teal-600" size={20} />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Event Type</label>
                <select
                  value={filters.event_type}
                  onChange={(e) => handleFilterChange('event_type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">All Events</option>
                  {eventTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">User Email</label>
                <Input
                  type="email"
                  placeholder="Filter by email"
                  value={filters.user_email}
                  onChange={(e) => handleFilterChange('user_email', e.target.value)}
                  className="border-gray-300 focus:border-teal-500 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Limit</label>
                <select
                  value={filters.limit}
                  onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="250">250</option>
                  <option value="500">500</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  onClick={applyFilters}
                  className="flex-1 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white"
                >
                  Apply
                </Button>
                <Button
                  variant="outline"
                  onClick={clearFilters}
                >
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card className="border-0 shadow-xl">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-cyan-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Event Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                        No activity logs found
                      </td>
                    </tr>
                  ) : (
                    logs.map((log, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-gray-400" />
                            {formatTimestamp(log.timestamp)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            {getEventIcon(log.event_type)}
                            <span className="font-medium text-gray-800">{log.event_type}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {log.user_email || <span className="text-gray-400">N/A</span>}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(log.status)}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <div className="max-w-xs truncate" title={JSON.stringify(log.details, null, 2)}>
                            {log.details && Object.keys(log.details).length > 0 ? (
                              Object.entries(log.details).slice(0, 2).map(([key, value]) => (
                                <div key={key} className="text-xs">
                                  <span className="font-medium">{key}:</span> {String(value)}
                                </div>
                              ))
                            ) : (
                              <span className="text-gray-400">No details</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Stats Footer */}
        <div className="mt-4 text-center text-sm text-gray-600">
          Showing {logs.length} of {logs.length} logs
        </div>
      </div>
    </div>
  );
};

export default ActivityLogs;
