// API client for the absorbed Supplement Protocol Manager. Same call surface as the
// standalone app's lib/api.js, but pointed at the portal backend's /api/supplements/*
// mount and authenticated with the portal session token (Clerk removed).
const API_BASE = (process.env.REACT_APP_BACKEND_URL || '') + '/api/supplements';

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('access_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { headers: getHeaders(), ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/pdf')) {
    return res.blob();
  }
  return res.json();
}

// Supplements
export const getSupplements = (search = '', activeOnly = true) =>
  request(`/supplements?search=${encodeURIComponent(search)}&active_only=${activeOnly}&limit=200`);

export const createSupplement = (data) =>
  request('/supplements', { method: 'POST', body: JSON.stringify(data) });

export const updateSupplement = (id, data) =>
  request(`/supplements/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteSupplement = (id) =>
  request(`/supplements/${id}`, { method: 'DELETE' });

// Templates
export const getTemplates = (programName = '') =>
  request(`/templates?program_name=${encodeURIComponent(programName)}`);

export const getTemplate = (id) =>
  request(`/templates/${id}`);

export const updateTemplate = (id, data) =>
  request(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const createTemplate = (data) =>
  request('/templates', { method: 'POST', body: JSON.stringify(data) });

export const deleteTemplate = (id) =>
  request(`/templates/${id}`, { method: 'DELETE' });

export const savePlanAsTemplate = (data) =>
  request('/templates/save-from-plan', { method: 'POST', body: JSON.stringify(data) });

// Plans
export const getPlans = (search = '', program = '', status = '', createdBy = '') =>
  request(`/plans?search=${encodeURIComponent(search)}&program=${encodeURIComponent(program)}&status=${encodeURIComponent(status)}&created_by=${encodeURIComponent(createdBy)}`);

export const getPlanCreators = () =>
  request('/plans/creators');

export const getPlan = (id) =>
  request(`/plans/${id}`);

export const createPlan = (data) =>
  request('/plans', { method: 'POST', body: JSON.stringify(data) });

export const updatePlan = (id, data) =>
  request(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deletePlan = (id) =>
  request(`/plans/${id}`, { method: 'DELETE' });

export const duplicatePlan = (id, body = {}) =>
  request(`/plans/${id}/duplicate`, { method: 'POST', body: JSON.stringify(body) });

export const finalizePlan = (id) =>
  request(`/plans/${id}/finalize`, { method: 'POST' });

export const reopenPlan = (id) =>
  request(`/plans/${id}/reopen`, { method: 'POST' });

// PDF Export
export const exportPatientPDF = (planId) =>
  fetch(`${API_BASE}/plans/${planId}/export/patient`, { headers: getHeaders() }).then((r) => {
    if (!r.ok) throw new Error('Export failed');
    return r.blob();
  });

export const exportHCPDF = (planId) =>
  fetch(`${API_BASE}/plans/${planId}/export/hc`, { headers: getHeaders() }).then((r) => {
    if (!r.ok) throw new Error('Export failed');
    return r.blob();
  });

// Cloud save (Dropbox)
export const saveToDrive = (planId) =>
  request(`/plans/${planId}/save-to-cloud`, { method: 'POST' });

// Patients
export const getPatients = (search = '') =>
  request(`/patients?search=${encodeURIComponent(search)}`);

export const getPatient = (id) =>
  request(`/patients/${id}`);

export const createPatient = (data) =>
  request('/patients', { method: 'POST', body: JSON.stringify(data) });

export const searchPbClients = (search = '') =>
  request(`/pb-clients?search=${encodeURIComponent(search)}&limit=10`);

export const updatePatient = (id, data) =>
  request(`/patients/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deletePatient = (id) =>
  request(`/patients/${id}`, { method: 'DELETE' });

export const saveAllPlansToDrive = (patientId) =>
  request(`/patients/${patientId}/save-all-to-cloud`, { method: 'POST' });

// Suppliers
export const getSuppliers = () =>
  request('/suppliers');

export const createSupplier = (data) =>
  request('/suppliers', { method: 'POST', body: JSON.stringify(data) });

export const updateSupplier = (id, data) =>
  request(`/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteSupplier = (id) =>
  request(`/suppliers/${id}`, { method: 'DELETE' });

// Seed
export const seedData = () =>
  request('/seed', { method: 'POST' });
