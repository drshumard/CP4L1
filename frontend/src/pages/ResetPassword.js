import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CircleAlert } from 'lucide-react';
import AuthFrame from './auth/AuthFrame';
import frame from './auth/welcome.module.css';
import s from './auth/sign-in.module.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// /reset-password?token=… from a reset email — in the sign-in page's design (user, 2026-09-28). Problems show on the
// page, as on sign-in; success goes back to sign-in.
const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);   // { text, fields: true when it's about what they typed }

  useEffect(() => {
    const previous = document.title;
    document.title = 'Reset Password | Dr. Jason Shumard';
    return () => { document.title = previous; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError({ text: 'Passwords do not match', fields: true });
      return;
    }

    if (password.length < 8) {
      setError({ text: 'Password must be at least 8 characters', fields: true });
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API}/auth/reset-password`, {
        token,
        new_password: password
      });

      toast.success('Password reset successful!');
      navigate('/login');
    } catch (err) {
      setError({ text: err.response?.data?.detail || 'Password reset failed', fields: false });
    } finally {
      setLoading(false);
    }
  };

  const edit = (set) => (event) => { set(event.target.value); setError(null); };
  const invalid = Boolean(error?.fields);

  if (!token) {
    return (
      <AuthFrame mainId="reset-password" skipLabel="Skip to reset password">
        <section className={s.signIn} aria-labelledby="reset-title">
          <div className={s.step}>
            <h1 id="reset-title">This link has<br /><span>expired.</span></h1>
            <p className={s.copy}>This password reset link is invalid or has expired.</p>
            <div className={s.card}>
              <div className={s.form}>
                <Link to="/login" className={s.primary}>Back to sign in <ArrowRight size={18} aria-hidden="true" /></Link>
              </div>
            </div>
          </div>
        </section>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame mainId="reset-password" skipLabel="Skip to reset password">
      <section className={s.signIn} aria-labelledby="reset-title">
        <div className={s.step}>
          <h1 id="reset-title">Reset your<br /><span>password.</span></h1>
          <p id="reset-copy" className={s.copy}>Enter your new password below. It needs at least 8 characters.</p>

          <div className={s.card}>
            <form className={s.form} onSubmit={handleSubmit} noValidate>
              <label htmlFor="password" className={s.label}>New password</label>
              <input
                id="password"
                className={s.input}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={edit(setPassword)}
                required
                aria-invalid={invalid}
                aria-describedby={error ? 'reset-copy reset-error' : 'reset-copy'}
              />
              <label htmlFor="confirmPassword" className={s.label}>Confirm new password</label>
              <input
                id="confirmPassword"
                className={s.input}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={edit(setConfirmPassword)}
                required
                aria-invalid={invalid}
                aria-describedby={error ? 'reset-error' : undefined}
              />
              {error && <p id="reset-error" className={s.error} role="alert"><CircleAlert size={16} aria-hidden="true" />{error.text}</p>}
              <button type="submit" className={s.primary} disabled={loading}>
                {loading ? 'Resetting…' : <>Reset password <ArrowRight size={18} aria-hidden="true" /></>}
              </button>
            </form>
          </div>

          <Link to="/login" className={`${frame.quietButton} ${s.back}`}><ArrowLeft size={13} aria-hidden="true" /> Back to sign in</Link>
        </div>
      </section>
    </AuthFrame>
  );
};

export default ResetPassword;
