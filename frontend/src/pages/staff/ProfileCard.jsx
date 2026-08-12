import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { adminApi } from '../admin/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const EYEBROW = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

function initialsOf(name, email) {
  const n = (name || '').trim();
  if (n) return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (email || '?').slice(0, 2).toUpperCase();
}

// Personal profile editor (photo, name, phone) — lives on the workspace home so every team
// member can edit their own details; moved out of Scheduling → Settings, which is org config.
export default function ProfileCard({ profile: initial, onSaved }) {
  const [profile, setProfile] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const setP = (k, v) => { setProfile((p) => ({ ...p, [k]: v })); setDirty(true); };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error('Image too large (max 8MB)'); e.target.value = ''; return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await adminApi.post('/user/me/avatar', fd);
      setProfile((p) => ({ ...p, avatar_url: r.data.avatar_url || '' }));
      window.dispatchEvent(new Event('profile-updated'));
      toast.success('Photo updated');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not upload that photo');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await adminApi.put('/user/me', {
        first_name: profile.first_name || '', last_name: profile.last_name || '',
        phone: profile.phone || '', avatar_url: profile.avatar_url || '',
      });
      setProfile(r.data);
      setDirty(false);
      window.dispatchEvent(new Event('profile-updated'));
      onSaved?.(r.data);
      toast.success('Profile saved');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <p className={EYEBROW}>Your profile</p>
      <p className="mt-1 text-sm text-muted-foreground">Your name and photo appear across the workspace and admin. Visible to the team only.</p>
      <div className="mt-4 flex items-center gap-4">
        <Avatar className="size-16">
          <AvatarImage src={profile.avatar_url || undefined} alt={profile.name} />
          <AvatarFallback className="text-lg">{initialsOf(profile.name, profile.email)}</AvatarFallback>
        </Avatar>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> {uploading ? 'Uploading...' : 'Upload photo'}
          </Button>
          {profile.avatar_url && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setP('avatar_url', '')}>Remove</Button>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="p-fn">First name</Label><Input id="p-fn" value={profile.first_name || ''} onChange={(e) => setP('first_name', e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="p-ln">Last name</Label><Input id="p-ln" value={profile.last_name || ''} onChange={(e) => setP('last_name', e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="p-ph">Phone</Label><Input id="p-ph" value={profile.phone || ''} onChange={(e) => setP('phone', e.target.value)} placeholder="Optional" /></div>
        <div className="space-y-1.5"><Label htmlFor="p-em">Email</Label><Input id="p-em" value={profile.email} disabled /></div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save profile'}</Button>
      </div>
    </section>
  );
}
