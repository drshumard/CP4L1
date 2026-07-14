import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { adminApi } from './api';
import { fmtDate, fmtTime, fmtDateTime } from './format';
import { confirmDialog } from './confirm';
import { Button } from '@/components/ui/button';

// Shared admin booking actions (used by the Scheduling → Bookings list AND the
// Users → user-detail modal). All actions are session-scoped (operate on a booking_id)
// and admin-only; there is no patient-facing path.

const ICON = 1.75;
const patientName = (b) => [b?.patient?.first_name, b?.patient?.last_name].filter(Boolean).join(' ') || 'this patient';

/** The soonest UPCOMING confirmed ledger booking for a patient email, or null.
 *  (date_from=now excludes past confirmed sessions, which never transition out of
 *  'confirmed' on their own.) */
export async function fetchActiveBookingForUser(user) {
  // Match the authoritative ledger by user_id (every booking stores it). Matching by patient
  // email breaks when the booking was made under a different address than the account (e.g. a
  // "+alias"). Falls back to email only when there's no id.
  const userId = user?.id;
  const email = user?.email;
  if (!userId && !email) return null;
  try {
    const params = { status: 'confirmed', date_from: new Date().toISOString(), page_size: 10 };
    if (userId) params.user_id = userId;
    else params.search = email;
    const res = await adminApi.get('/admin/bookings', params);
    let rows = res.data.bookings || [];
    if (!userId && email) {
      rows = rows.filter((b) => (b.patient?.email || '').toLowerCase() === email.toLowerCase());
    }
    rows.sort((a, b) => new Date(a.slot_start_utc) - new Date(b.slot_start_utc));
    return rows[0] || null;
  } catch {
    return null;
  }
}

/** Confirm + cancel a booking. Returns true on success (caller refreshes). */
export async function cancelBooking(booking, { onDone } = {}) {
  const ok = await confirmDialog({
    title: 'Cancel booking?',
    message: `Cancel ${patientName(booking)}'s session on ${fmtDateTime(booking.slot_start_utc)}? This frees the slot, removes the calendar event, and emails the patient.`,
    confirmLabel: 'Cancel booking',
  });
  if (!ok) return false;
  try {
    await adminApi.post(`/admin/bookings/${booking.booking_id}/cancel`);
    toast.success('Booking cancelled');
    onDone?.();
    return true;
  } catch (e) {
    toast.error(e?.response?.data?.detail || 'Could not cancel');
    return false;
  }
}

// Reschedule modal — pick a new time from real available slots (clinic-tz), then
// POST to the admin reschedule endpoint (which keeps the same director).
export function RescheduleModal({ booking, onClose, onDone }) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const res = await adminApi.get('/booking/availability', { start_date: today, days: 60 });
        setSlots(res.data.slots || []);
      } catch {
        toast.error('Failed to load available times');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groups = useMemo(() => {
    const g = {};
    for (const s of slots) {
      const key = fmtDate(s.start_time);
      (g[key] ||= []).push(s);
    }
    return g;
  }, [slots]);

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await adminApi.post(`/admin/bookings/${booking.booking_id}/reschedule`, { slot_start_time: selected });
      toast.success('Booking rescheduled');
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not reschedule');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // admin-geist => Geist/Inter font + shadcn tokens. pointerEvents:auto re-enables clicks
    // when this opens over the vaul user-drawer (which sets pointer-events:none on the body).
    <div className="admin-geist fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog" aria-modal="true" style={{ pointerEvents: 'auto' }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background border rounded-lg shadow-xl w-full max-w-lg flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="flex items-start justify-between p-5 border-b">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">Reschedule booking</h3>
            <p className="text-sm mt-1 text-muted-foreground">
              {patientName(booking)} · currently <span className="tabular-nums text-foreground">{fmtDateTime(booking.slot_start_utc)}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close"><X size={18} strokeWidth={ICON} /></button>
        </div>
        <div className="p-5 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading available times…</p>
          ) : Object.keys(groups).length === 0 ? (
            <p className="text-sm text-muted-foreground">No available times in the next 60 days.</p>
          ) : (
            Object.entries(groups).map(([date, daySlots]) => (
              <div key={date} className="mb-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">{date}</p>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map((s) => {
                    const active = selected === s.start_time;
                    return (
                      <button key={s.start_time} type="button" onClick={() => setSelected(s.start_time)}
                        className={`text-sm tabular-nums px-3 py-1.5 rounded-md border transition-colors ${active
                          ? 'bg-foreground text-background border-foreground'
                          : 'bg-background text-foreground border-input hover:bg-accent'}`}>
                        {fmtTime(s.start_time)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!selected || submitting}>{submitting ? 'Rescheduling…' : 'Reschedule'}</Button>
        </div>
      </div>
    </div>
  );
}
