import React, { useState } from 'react';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { adminApi } from './api';
import s from './workspace.module.css';

// Users → "Add user": creates a portal account (it starts at Step 1), optionally sending the welcome email
// a purchase would send. POST /api/admin/users.

const EMPTY = { first_name: '', last_name: '', email: '', phone: '' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELDS = [
  ['first_name', 'First name', { autoComplete: 'given-name' }],
  ['last_name', 'Last name', { autoComplete: 'family-name', optional: true }],
  ['email', 'Email address', { type: 'email', autoComplete: 'email', wide: true, placeholder: 'patient@example.com' }],
  ['phone', 'Phone', { type: 'tel', autoComplete: 'tel', wide: true, optional: true }],
];

export default function AddUserDialog({ open, onOpenChange, onCreated }) {
  const [fields, setFields] = useState(EMPTY);
  const [sendWelcome, setSendWelcome] = useState(true);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const change = (o) => {
    if (!o) { setFields(EMPTY); setSendWelcome(true); setErrors({}); }
    onOpenChange(o);
  };
  const update = (key) => (e) => {
    setFields((f) => ({ ...f, [key]: e.target.value }));
    setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!fields.first_name.trim()) next.first_name = 'Enter their first name.';
    if (!EMAIL_RE.test(fields.email.trim())) next.email = 'Enter a valid email address.';
    setErrors(next);
    const first = ['first_name', 'email'].find((k) => next[k]);
    if (first) { document.getElementById(`add-user-${first}`)?.focus(); return; }

    setSaving(true);
    try {
      const { data } = await adminApi.post('/admin/users', {
        first_name: fields.first_name.trim(),
        last_name: fields.last_name.trim(),
        email: fields.email.trim(),
        phone: fields.phone.trim() || null,
        send_welcome_email: sendWelcome,
      });
      toast.success(sendWelcome ? `${data.user.name} added — welcome email sent` : `${data.user.name} added`);
      change(false);
      onCreated?.(data.user);
    } catch (err) {
      if (err.response?.status === 409) {
        setErrors({ email: 'A user with this email already exists.' });
        document.getElementById('add-user-email')?.focus();
      } else {
        const detail = err.response?.data?.detail;
        toast.error(typeof detail === 'string' ? detail : 'Could not add the user');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className={s.formDialog}>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription className={s.sheetDescription}>Create a portal account. They start at Step 1 · Book session.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className={s.addUserForm}>
          <div className={s.fields}>
            {FIELDS.map(([key, label, opts]) => (
              <div key={key} className={`${s.field} ${opts.wide ? s.wideField : ''}`}>
                <label htmlFor={`add-user-${key}`}>{label}{opts.optional && <span> · optional</span>}</label>
                <input
                  id={`add-user-${key}`}
                  type={opts.type || 'text'}
                  autoComplete={opts.autoComplete}
                  placeholder={opts.placeholder}
                  value={fields[key]}
                  onChange={update(key)}
                  aria-invalid={!!errors[key]}
                  aria-describedby={errors[key] ? `add-user-${key}-error` : undefined}
                />
                {errors[key] && <p id={`add-user-${key}-error`} className={s.fieldError} role="alert">{errors[key]}</p>}
              </div>
            ))}
          </div>
          <div className={s.notificationRow}>
            <div>
              <label htmlFor="add-user-welcome">Send welcome email</label>
              <p>Emails their personal link to the portal so they can get started.</p>
            </div>
            <Switch id="add-user-welcome" checked={sendWelcome} onCheckedChange={setSendWelcome} className="data-[state=checked]:bg-[#3565e9]" />
          </div>
          <div className={s.dialogActions}>
            <button type="button" className={s.secondaryButton} onClick={() => change(false)} disabled={saving}>Cancel</button>
            <button type="submit" className={s.primaryButton} disabled={saving}><UserPlus size={16} />{saving ? 'Adding…' : 'Add user'}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
