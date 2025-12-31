import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Activity, Filter, RefreshCw, Download, ArrowLeft, Clock, User, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ActivityLogs = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: 50,
    total_count: 0,
    total_pages: 0,
    has_next: false,
    has_prev: false
  });
  const [filters, setFilters] = useState({
    event_type: '',
    user_email: ''
  });

  useEffect(() => {
    fetchLogs(1);
  }, []);

  const fetchLogs = async (page = pagination.page) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams();
      
      params.append('page', page);
      params.append('per_page', pagination.per_page);
      if (filters.event_type) params.append('event_type', filters.event_type);
      if (filters.user_email) params.append('user_email', filters.user_email);

      const response = await axios.get(`${API}/admin/activity-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setLogs(response.data.logs);
      setEventTypes(response.data.event_types);
      setPagination(prev => ({
        ...prev,
        ...response.data.pagination
      }));
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

  const handlePerPageChange = (value) => {
    setPagination(prev => ({ ...prev, per_page: parseInt(value), page: 1 }));
  };

  const applyFilters = () => {
    fetchLogs(1);
  };

  const clearFilters = () => {
    setFilters({ event_type: '', user_email: '' });
    setPagination(prev => ({ ...prev, page: 1 }));
    setTimeout(() => fetchLogs(1), 100);
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.total_pages) {
      fetchLogs(page);
    }
  };

  const exportLogs = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams();
      params.append('page', 1);
      params.append('per_page', 500); // Export up to 500 at a time
      if (filters.event_type) params.append('event_type', filters.event_type);
      if (filters.user_email) params.append('user_email', filters.user_email);

      const response = await axios.get(`${API}/admin/activity-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const exportLogs = response.data.logs;
      const csvContent = [
        ['Timestamp', 'Event Type', 'User Email', 'User ID', 'Device', 'Location', 'IP Address', 'Status', 'Details'],
        ...exportLogs.map(log => [
          log.timestamp,
          log.event_type,
          log.user_email || 'N/A',
          log.user_id || 'N/A',
          log.device_info ? `${log.device_info.device_type || ''} / ${log.device_info.browser || ''} / ${log.device_info.os || ''}` : 'N/A',
          log.location_info?.city && log.location_info?.country ? `${log.location_info.city}, ${log.location_info.country}` : 'N/A',
          log.ip_address || 'N/A',
          log.status,
          JSON.stringify(log.details || {}).replace(/,/g, ';')
        ])
      ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity_logs_${new Date().toISOString()}.csv`;
      a.click();
      toast.success(`Exported ${exportLogs.length} logs`);
    } catch (error) {
      toast.error('Failed to export logs');
    }
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

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, pagination.page - Math.floor(maxVisible / 2));
    let end = Math.min(pagination.total_pages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  if (loading && logs.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4F3F2' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading activity logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: '#F4F3F2' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
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
              <p className="text-gray-600 mt-1">
                {pagination.total_count.toLocaleString()} total logs
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => fetchLogs(pagination.page)}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Per Page</label>
                <select
                  value={pagination.per_page}
                  onChange={(e) => handlePerPageChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
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
                      Device
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Location
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
                      <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
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
                          {log.device_info ? (
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-700">
                                {log.device_info.device_type === 'mobile' ? '📱' : 
                                 log.device_info.device_type === 'tablet' ? '📱' : '💻'} 
                                {log.device_info.device_type || 'Unknown'}
                              </span>
                              <span className="text-xs text-gray-500">
                                {log.device_info.browser} / {log.device_info.os}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {log.location_info || log.ip_address ? (
                            <div className="flex flex-col">
                              {log.location_info?.city && log.location_info?.country ? (
                                <>
                                  <span className="font-medium text-gray-700">
                                    📍 {log.location_info.city}, {log.location_info.country}
                                  </span>
                                  {log.location_info.region && (
                                    <span className="text-xs text-gray-500">{log.location_info.region}</span>
                                  )}
                                </>
                              ) : log.ip_address ? (
                                <span className="text-gray-500 text-xs">IP: {log.ip_address}</span>
                              ) : null}
                              {log.ip_address && log.location_info?.city && (
                                <span className="text-gray-400 font-mono text-xs mt-0.5">{log.ip_address}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
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

            {/* Pagination */}
            {pagination.total_pages > 1 && (
              <div className="px-4 py-4 border-t border-gray-200 bg-gray-50">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm text-gray-600">
                    Showing {((pagination.page - 1) * pagination.per_page) + 1} - {Math.min(pagination.page * pagination.per_page, pagination.total_count)} of {pagination.total_count.toLocaleString()} logs
                  </div>
                  <div className="flex items-center gap-1">
                    {/* First Page */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(1)}
                      disabled={!pagination.has_prev || loading}
                      className="px-2"
                    >
                      <ChevronsLeft size={16} />
                    </Button>
                    
                    {/* Previous Page */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(pagination.page - 1)}
                      disabled={!pagination.has_prev || loading}
                      className="px-2"
                    >
                      <ChevronLeft size={16} />
                    </Button>

                    {/* Page Numbers */}
                    {getPageNumbers().map(pageNum => (
                      <Button
                        key={pageNum}
                        variant={pageNum === pagination.page ? "default" : "outline"}
                        size="sm"
                        onClick={() => goToPage(pageNum)}
                        disabled={loading}
                        className={`px-3 ${pageNum === pagination.page ? 'bg-teal-600 text-white' : ''}`}
                      >
                        {pageNum}
                      </Button>
                    ))}

                    {/* Next Page */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(pagination.page + 1)}
                      disabled={!pagination.has_next || loading}
                      className="px-2"
                    >
                      <ChevronRight size={16} />
                    </Button>

                    {/* Last Page */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(pagination.total_pages)}
                      disabled={!pagination.has_next || loading}
                      className="px-2"
                    >
                      <ChevronsRight size={16} />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ActivityLogs;
