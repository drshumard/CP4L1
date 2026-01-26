import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { 
  Home, Users, TrendingUp, BarChart3, RefreshCw, Activity, Clock
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminAnalytics = () => {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyticsStartDate, setAnalyticsStartDate] = useState('');
  const [analyticsEndDate, setAnalyticsEndDate] = useState('');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // Auto-refresh analytics every 30 seconds for realtime data
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetchAnalytics();
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [autoRefresh, analyticsStartDate, analyticsEndDate]);

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const analyticsRes = await axios.get(`${API}/admin/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          start_date: analyticsStartDate || undefined,
          end_date: analyticsEndDate || undefined
        }
      });
      setAnalytics(analyticsRes.data);
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error('Admin access required', { id: 'admin-access-required' });
        navigate('/');
      } else if (error.response?.status === 401) {
        localStorage.clear();
        navigate('/login');
      } else {
        toast.error('Failed to load analytics', { id: 'analytics-error' });
      }
    } finally {
      setLoading(false);
      setAnalyticsLoading(false);
    }
  };

  const handleApplyFilter = () => {
    setAnalyticsLoading(true);
    fetchAnalytics();
  };

  const clearDateFilter = () => {
    setAnalyticsStartDate('');
    setAnalyticsEndDate('');
    setTimeout(() => {
      setAnalyticsLoading(true);
      fetchAnalytics();
    }, 100);
  };

  // Step distribution data for horizontal bar chart
  const stepDistribution = [
    { label: 'Refunded', count: analytics?.step_distribution?.refunded || 0, color: 'bg-red-500' },
    { label: 'Step 1', count: analytics?.step_distribution?.step_1 || 0, color: 'bg-blue-500' },
    { label: 'Step 2', count: analytics?.step_distribution?.step_2 || 0, color: 'bg-purple-500' },
    { label: 'Step 3', count: analytics?.step_distribution?.step_3 || 0, color: 'bg-amber-500' },
    { label: 'Complete', count: analytics?.step_distribution?.step_4 || 0, color: 'bg-green-500' },
  ];

  const maxStepCount = Math.max(...stepDistribution.map(s => s.count), 1);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4F3F2' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40" data-testid="admin-analytics-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
              <img 
                src="https://portal-drshumard.b-cdn.net/logo.png" 
                alt="Logo" 
                className="h-8 object-contain"
              />
              <div className="flex items-center gap-3 md:hidden">
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/admin')} 
                  className="flex items-center gap-2"
                  size="sm"
                >
                  <Users size={16} />
                </Button>
                <Button variant="outline" onClick={() => navigate('/')} className="flex items-center gap-2" size="sm">
                  <Home size={16} />
                </Button>
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-800 text-center w-full md:w-auto md:absolute md:left-1/2 md:-translate-x-1/2">Analytics</h1>
            <div className="hidden md:flex items-center gap-3">
              <Button 
                variant="outline" 
                onClick={() => navigate('/admin')} 
                className="flex items-center gap-2"
              >
                <Users size={16} />
                <span>Users</span>
              </Button>
              <Button 
                variant="outline" 
                onClick={() => navigate('/admin/logs')} 
                className="flex items-center gap-2"
              >
                <Activity size={16} />
                <span>Logs</span>
              </Button>
              <Button variant="outline" onClick={() => navigate('/')} className="flex items-center gap-2">
                <Home size={16} />
                <span>Home</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Analytics Section with Date Filter */}
        <Card className="bg-white border border-gray-200 shadow-sm mb-6">
          <CardHeader className="border-b border-gray-100 pb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="text-teal-600" size={20} />
                Analytics Overview
              </CardTitle>
              {/* Date Filter */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500">From:</label>
                  <input
                    type="date"
                    value={analyticsStartDate}
                    onChange={(e) => setAnalyticsStartDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500">To:</label>
                  <input
                    type="date"
                    value={analyticsEndDate}
                    onChange={(e) => setAnalyticsEndDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                  />
                </div>
                <Button 
                  size="sm" 
                  onClick={handleApplyFilter}
                  disabled={analyticsLoading}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  {analyticsLoading ? <RefreshCw size={14} className="animate-spin" /> : 'Apply'}
                </Button>
                {(analyticsStartDate || analyticsEndDate) && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={clearDateFilter}
                  >
                    Clear
                  </Button>
                )}
                {/* Auto-refresh toggle */}
                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-300">
                  <label className="text-xs text-gray-500 flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="flex items-center gap-1">
                      Auto-refresh
                      {autoRefresh && <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>}
                    </span>
                  </label>
                </div>
              </div>
            </div>
            {analytics?.filters_applied?.start_date && (
              <p className="text-xs text-gray-500 mt-2">
                Showing data from {analytics.filters_applied.start_date} to {analytics.filters_applied.end_date || 'now'}
              </p>
            )}
          </CardHeader>
          <CardContent className="p-6">
            {/* Summary Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-gray-800">{analytics?.total_users || 0}</div>
                <div className="text-sm text-gray-500">Total Users</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{analytics?.completion_stats?.completed || 0}</div>
                <div className="text-sm text-gray-500">Completed ({analytics?.completion_stats?.completion_rate || 0}%)</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{analytics?.completion_stats?.in_progress || 0}</div>
                <div className="text-sm text-gray-500">In Progress ({analytics?.completion_stats?.in_progress_rate || 0}%)</div>
              </div>
              <div className="bg-red-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-red-600">{analytics?.completion_stats?.refunded || 0}</div>
                <div className="text-sm text-gray-500">Refunded ({analytics?.completion_stats?.refund_rate || 0}%)</div>
              </div>
            </div>

            {/* Step Distribution */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Users size={16} />
                Step Distribution
              </h3>
              <div className="space-y-3">
                {stepDistribution.map((step, index) => {
                  const percentage = analytics?.total_users 
                    ? Math.round((step.count / analytics.total_users) * 100) 
                    : 0;
                  const barWidth = maxStepCount > 0 
                    ? Math.round((step.count / maxStepCount) * 100) 
                    : 0;
                  
                  return (
                    <div key={step.label} className="flex items-center gap-4">
                      <div className="w-20 text-sm font-medium text-gray-700 flex-shrink-0">
                        {step.label}
                      </div>
                      <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden relative">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${barWidth}%` }}
                          transition={{ duration: 0.6, delay: index * 0.1 }}
                          className={`h-full ${step.color} rounded-lg flex items-center`}
                        >
                          {barWidth > 15 && (
                            <span className="text-white text-sm font-medium px-3">
                              {step.count}
                            </span>
                          )}
                        </motion.div>
                        {barWidth <= 15 && step.count > 0 && (
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600 text-sm font-medium">
                            {step.count}
                          </span>
                        )}
                      </div>
                      <div className="w-12 text-right text-sm text-gray-500 flex-shrink-0">
                        {percentage}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Two Column Layout for Funnel and Transition Times */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Completion Funnel */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <TrendingUp size={16} />
                  Completion Funnel
                </h3>
                <div className="space-y-3">
                  {[
                    { label: 'Started', data: analytics?.funnel_data?.started, color: 'bg-gray-500' },
                    { label: 'Booked Consultation', data: analytics?.funnel_data?.completed_booking, color: 'bg-blue-500' },
                    { label: 'Submitted Intake', data: analytics?.funnel_data?.completed_intake, color: 'bg-purple-500' },
                    { label: 'Activated Portal', data: analytics?.funnel_data?.activated_portal, color: 'bg-green-500' }
                  ].map((stage, index) => (
                    <div key={stage.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${stage.color}`}></div>
                        <span className="text-sm text-gray-700">{stage.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{stage.data?.count || 0}</span>
                        <span className="text-xs text-gray-500 w-12 text-right">
                          {stage.data?.percentage || 0}%
                        </span>
                        {stage.data?.drop_off > 0 && (
                          <span className="text-xs text-red-500">
                            (-{stage.data.drop_off})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step Transition Times */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Clock size={16} />
                  Average Time Between Steps
                </h3>
                <div className="space-y-3">
                  {[
                    { 
                      label: 'Booking → Intake Form', 
                      data: analytics?.step_transition_times?.booking_to_intake,
                      icon: '📅→📝'
                    },
                    { 
                      label: 'Intake → Completion', 
                      data: analytics?.step_transition_times?.intake_to_completion,
                      icon: '📝→✓'
                    },
                    { 
                      label: 'Completion → Activated', 
                      data: analytics?.step_transition_times?.completion_to_activated,
                      icon: '✓→🚀'
                    },
                    { 
                      label: 'Total Journey', 
                      data: analytics?.step_transition_times?.total_journey,
                      icon: '🏁',
                      highlight: true
                    }
                  ].map((transition) => (
                    <div 
                      key={transition.label} 
                      className={`flex items-center justify-between ${transition.highlight ? 'bg-teal-50 -mx-2 px-2 py-1 rounded' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{transition.icon}</span>
                        <span className={`text-sm ${transition.highlight ? 'font-medium text-teal-700' : 'text-gray-700'}`}>
                          {transition.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {transition.data?.avg_formatted ? (
                          <>
                            <span className={`text-sm font-medium ${transition.highlight ? 'text-teal-700' : ''}`}>
                              {transition.data.avg_formatted}
                            </span>
                            <span className="text-xs text-gray-400">
                              ({transition.data.count} users)
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-gray-400">No data</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Realtime Stats Row */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-blue-600 uppercase">Today</span>
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                </div>
                <div className="text-2xl font-bold text-blue-700">{analytics?.realtime_stats?.today?.signups || 0}</div>
                <div className="text-xs text-blue-600">New Signups</div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-purple-600 uppercase">Today</span>
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                </div>
                <div className="text-2xl font-bold text-purple-700">{analytics?.realtime_stats?.today?.logins || 0}</div>
                <div className="text-xs text-purple-600">Logins</div>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border border-amber-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-amber-600 uppercase">Today</span>
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                </div>
                <div className="text-2xl font-bold text-amber-700">{analytics?.realtime_stats?.today?.bookings || 0}</div>
                <div className="text-xs text-amber-600">Bookings</div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-green-600 uppercase">Today</span>
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                </div>
                <div className="text-2xl font-bold text-green-700">{analytics?.realtime_stats?.today?.form_submissions || 0}</div>
                <div className="text-xs text-green-600">Forms Submitted</div>
              </div>
            </div>

            {/* Signup Trends Chart */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <TrendingUp size={16} />
                Signup Trends (Last 30 Days)
              </h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-end gap-1 h-32">
                  {analytics?.signup_trends?.map((day, index) => {
                    const maxCount = Math.max(...(analytics?.signup_trends?.map(d => d.count) || [1]), 1);
                    const height = day.count > 0 ? Math.max((day.count / maxCount) * 100, 8) : 4;
                    const isToday = index === (analytics?.signup_trends?.length || 0) - 1;
                    
                    return (
                      <div 
                        key={day.date} 
                        className="flex-1 flex flex-col items-center group relative"
                      >
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${height}%` }}
                          transition={{ duration: 0.5, delay: index * 0.02 }}
                          className={`w-full rounded-t ${isToday ? 'bg-teal-500' : day.count > 0 ? 'bg-teal-400' : 'bg-gray-200'}`}
                        />
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                          <div className="bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                            {day.date}: {day.count} signups
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>{analytics?.signup_trends?.[0]?.date || ''}</span>
                  <span>Today</span>
                </div>
              </div>
            </div>

            {/* Recent Activity Feed */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Activity size={16} />
                Recent Activity
                <span className="text-xs font-normal text-gray-400">
                  (Last updated: {analytics?.realtime_stats?.last_updated ? new Date(analytics.realtime_stats.last_updated).toLocaleTimeString() : 'N/A'})
                </span>
              </h3>
              <div className="bg-gray-50 rounded-lg divide-y divide-gray-200">
                {analytics?.realtime_stats?.recent_activity?.length > 0 ? (
                  analytics.realtime_stats.recent_activity.map((activity, index) => (
                    <div key={index} className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          activity.event.includes('Signup') ? 'bg-blue-500' :
                          activity.event.includes('Login') ? 'bg-purple-500' :
                          activity.event.includes('Booked') ? 'bg-amber-500' :
                          activity.event.includes('Form') ? 'bg-teal-500' :
                          activity.event.includes('Portal') ? 'bg-green-500' : 'bg-gray-500'
                        }`}></div>
                        <span className="text-sm text-gray-700">{activity.event}</span>
                        <span className="text-sm text-gray-500">{activity.email}</span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {activity.time ? new Date(activity.time).toLocaleString() : ''}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-sm text-gray-500">No recent activity</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminAnalytics;
