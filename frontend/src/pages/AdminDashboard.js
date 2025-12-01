import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Home, Users, TrendingUp, BarChart3, RefreshCw, Trash2 } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const [usersRes, analyticsRes] = await Promise.all([
        axios.get(`${API}/admin/users`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/admin/analytics`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setUsers(usersRes.data.users);
      setAnalytics(analyticsRes.data);
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error('Admin access required');
        navigate('/');
      } else if (error.response?.status === 401) {
        localStorage.clear();
        navigate('/login');
      } else {
        toast.error('Failed to load admin data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetUser = async (userId) => {
    if (!window.confirm('Are you sure you want to reset this user\'s progress?')) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${API}/admin/user/${userId}/reset`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('User progress reset successfully');
      fetchData();
    } catch (error) {
      toast.error('Failed to reset user progress');
    }
  };

  const handleDeleteUser = async (userId, userName, userEmail) => {
    if (!window.confirm(`Are you sure you want to permanently delete user "${userName}" (${userEmail})?\n\nThis will delete:\n- User account\n- All progress data\n\nThis action CANNOT be undone!`)) {
      return;
    }

    // Double confirmation for safety
    if (!window.confirm('Final confirmation: Delete this user permanently?')) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      await axios.delete(
        `${API}/admin/user/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('User deleted successfully');
      fetchData();
    } catch (error) {
      if (error.response?.status === 400) {
        toast.error('Cannot delete your own admin account');
      } else {
        toast.error(error.response?.data?.detail || 'Failed to delete user');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 50%, #A5F3FC 100%)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 50%, #A5F3FC 100%)' }}>
      {/* Header */}
      <div className="glass-dark border-b border-gray-200" data-testid="admin-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 sm:gap-3">
              <img 
                src="https://customer-assets.emergentagent.com/job_wellness-steps-2/artifacts/na68tuph_trans_sized.png" 
                alt="Logo" 
                className="h-6 w-auto sm:h-7 md:h-8 object-contain flex-shrink-0"
              />
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 truncate">Admin Dashboard</h1>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={() => navigate('/')} className="flex items-center gap-2" data-testid="home-button">
                <Home size={16} />
                Home
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Analytics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="glass-dark border-0 shadow-lg" data-testid="total-users-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="text-teal-600" size={20} />
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-gray-800">{analytics?.total_users || 0}</p>
            </CardContent>
          </Card>

          <Card className="glass-dark border-0 shadow-lg" data-testid="completed-steps-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="text-green-600" size={20} />
                Completed Steps
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-gray-800">{analytics?.completed_steps || 0}</p>
            </CardContent>
          </Card>

          <Card className="glass-dark border-0 shadow-lg" data-testid="completion-rate-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="text-cyan-600" size={20} />
                Avg Completion
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-gray-800">
                {analytics?.total_users ? Math.round((analytics.completed_steps / (analytics.total_users * 7)) * 100) : 0}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Step Distribution */}
        <Card className="glass-dark border-0 shadow-lg mb-8" data-testid="step-distribution">
          <CardHeader>
            <CardTitle className="text-xl">Step Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              {[1, 2, 3, 4, 5, 6, 7].map(step => (
                <div key={step} className="bg-gradient-to-br from-teal-50 to-cyan-100 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600 mb-1">{step === 7 ? 'Outcome' : `Step ${step}`}</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {analytics?.step_distribution?.[`step_${step}`] || 0}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">users</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card className="glass-dark border-0 shadow-lg" data-testid="users-table">
          <CardHeader>
            <CardTitle className="text-xl">All Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Current Step</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Role</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map(user => (
                    <tr key={user.id} className="hover:bg-gray-50" data-testid={`user-row-${user.id}`}>
                      <td className="px-4 py-4 text-sm text-gray-800">{user.name}</td>
                      <td className="px-4 py-4 text-sm text-gray-600">{user.email}</td>
                      <td className="px-4 py-4 text-sm">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Step {user.current_step}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => handleResetUser(user.id)}
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1"
                            data-testid={`reset-button-${user.id}`}
                          >
                            <RefreshCw size={14} />
                            Reset
                          </Button>
                          <Button
                            onClick={() => handleDeleteUser(user.id, user.name, user.email)}
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
                            data-testid={`delete-button-${user.id}`}
                          >
                            <Trash2 size={14} />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;