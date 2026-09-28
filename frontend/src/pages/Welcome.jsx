import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { loadPortal, stashWelcomeData } from '../utils/welcomePrefetch';
import AuthFrame from './auth/AuthFrame';
import WelcomeScreen from './auth/WelcomeScreen';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
// The welcome waits this long at most for the portal's details; past it the page loads them itself.
const PREFETCH_CAP_MS = 5000;

// Only in-app paths — `next` arrives in the URL.
const safeNext = (value) => (value && value.startsWith('/') && !value.startsWith('//') ? value : '/');
// A first name to greet by; GHL signups can carry a placeholder ("there") instead of one.
const firstNameOf = (user) => {
  const name = (user?.first_name || '').trim();
  return name && name.toLowerCase() !== 'there' ? name : null;
};

// /welcome — on the way into the portal after signing in (code or email link) and after the /checkout signup: two
// seconds, then straight on to `next`. It's also the portal's loader: it stays until the page after it has what it
// opens with (utils/welcomePrefetch), so that page shows straight away.
export default function Welcome() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const previous = document.title;
    document.title = 'Welcome | Dr. Jason Shumard';
    const me = axios.get(`${API}/user/me`, { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } });
    me.then((res) => setUser(res.data))
      .catch(() => {})   // the portal handles an expired session; the welcome just greets without a name
      .finally(() => setLoaded(true));
    loadPortal(me)
      .then((data) => { if (alive) stashWelcomeData(data); })
      .catch(() => {})   // the page loads for itself
      .finally(() => setReady(true));
    const cap = window.setTimeout(() => setReady(true), PREFETCH_CAP_MS);
    return () => {
      alive = false;
      document.title = previous;
      window.clearTimeout(cap);
    };
  }, []);

  const done = useCallback(() => navigate(next, { replace: true }), [navigate, next]);

  return (
    <AuthFrame mainId="welcome">
      {loaded && <WelcomeScreen firstName={firstNameOf(user)} ready={ready} brief onDone={done} />}
    </AuthFrame>
  );
}
