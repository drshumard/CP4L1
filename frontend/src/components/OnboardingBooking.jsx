/**
 * OnboardingBooking Component (v2)
 *
 * Improvements:
 * - Double-submit prevention (disabled button)
 * - Slot expiry detection with auto-refetch
 * - Smart polling (pauses on form step)
 * - No auto-redirect after success
 * - Better error handling
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  useAvailability,
  useBookSession,
  detectTimezone,
  groupSlotsByDate,
  getTodayString,
  isSlotUnavailableError,
  isSlotValid,
} from '../hooks/useBooking';
import styles from './OnboardingBooking.module.css';

// ============================================================================
// Utility Functions
// ============================================================================

function calculateActivationId(recordId) {
  try {
    const bigInt = BigInt('0x' + recordId);
    const activationBigInt = bigInt + BigInt(4);
    return activationBigInt.toString(16).padStart(recordId.length, '0');
  } catch {
    // Fallback for browsers without BigInt support
    return recordId;
  }
}

function formatDateFull(dateString) {
  const date = new Date(dateString + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();
}

function getMonthYear(dateString) {
  const date = new Date(dateString + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function getDayOfWeek(dateString) {
  const date = new Date(dateString + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function getDayNumber(dateString) {
  const date = new Date(dateString + 'T12:00:00');
  return date.getDate();
}

function isToday(dateString) {
  return dateString === getTodayString();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================================================
// Sub-components
// ============================================================================

function LoadingState() {
  return (
    <div className={styles.stateContainer}>
      <div className={styles.loadingIndicator}>
        <span className={styles.loadingDot} />
        <span className={styles.loadingDot} />
        <span className={styles.loadingDot} />
      </div>
      <p className={styles.stateText}>Finding available times</p>
    </div>
  );
}

function ErrorState({ onRetry, message }) {
  return (
    <div className={styles.stateContainer}>
      <h2 className={styles.stateTitle}>Unable to load</h2>
      <p className={styles.stateText}>{message || 'Please check your connection and try again.'}</p>
      <button onClick={onRetry} className={styles.textButton}>
        Try Again →
      </button>
    </div>
  );
}

function NoAvailability() {
  return (
    <div className={styles.stateContainer}>
      <h2 className={styles.stateTitle}>No availability</h2>
      <p className={styles.stateText}>Please check back later or contact us directly.</p>
    </div>
  );
}

function SlotExpiredBanner({ onRefresh }) {
  return (
    <div className={styles.errorBanner}>
      <span>This time slot is no longer available.</span>
      <button onClick={onRefresh} className={styles.errorRefresh}>
        Select another time →
      </button>
    </div>
  );
}

function SuccessState({
  slot,
  name,
  isNewClient,
  clientRecordId,
  portalBaseUrl,
  onDone,
}) {
  const [countdown, setCountdown] = React.useState(5);
  const [isRedirecting, setIsRedirecting] = React.useState(false);

  React.useEffect(() => {
    if (!onDone) return;
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsRedirecting(true);
          // Trigger the redirect
          setTimeout(() => {
            onDone();
          }, 500);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onDone]);

  return (
    <div className={styles.successContainer}>
      <div className={styles.successContent}>
        <p className={styles.successLabel}>CONFIRMED</p>
        <h1 className={styles.successTitle}>You&apos;re all set{name ? `, ${name}` : ''}</h1>
        <div className={styles.successDivider} />
        {slot && (
          <div className={styles.successDetails}>
            <p className={styles.successDate}>{formatDateFull(slot.start_time.split('T')[0])}</p>
            <p className={styles.successTime}>{formatTime(slot.start_time)}</p>
          </div>
        )}
        <p className={styles.successNote}>Check your email for confirmation details</p>

        {onDone && (
          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            {isRedirecting ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <div className={styles.loadingSpinner} />
                <p style={{ color: '#64748b', fontSize: '14px' }}>Moving you to Step 2...</p>
              </div>
            ) : (
              <>
                <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '12px' }}>
                  Redirecting to Step 2 in {countdown} seconds...
                </p>
                <button onClick={onDone} className={styles.doneButton}>
                  Click here if not automatically redirected
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DateCard({ date, isSelected, onClick }) {
  const dayOfWeek = getDayOfWeek(date);
  const dayNumber = getDayNumber(date);
  const today = isToday(date);

  return (
    <button
      className={`${styles.dateCard} ${isSelected ? styles.dateCardSelected : ''} ${today ? styles.dateCardToday : ''}`}
      onClick={onClick}
      type="button"
    >
      <span className={styles.dateDayOfWeek}>{dayOfWeek}</span>
      <span className={styles.dateDayNumber}>{dayNumber}</span>
      {today && <span className={styles.todayBadge}>Today</span>}
    </button>
  );
}

function TimeSlotButton({ slot, isSelected, onClick }) {
  const timeLabel = formatTime(slot.start_time);

  return (
    <button
      className={`${styles.timeSlot} ${isSelected ? styles.timeSlotSelected : ''}`}
      onClick={onClick}
      type="button"
    >
      {timeLabel}
    </button>
  );
}

function ClientForm({ formData, errors, onChange, selectedSlot }) {
  return (
    <div className={styles.formSection}>
      {selectedSlot && (
        <div className={styles.selectedSummary}>
          <span className={styles.summaryLabel}>Selected Time</span>
          <span className={styles.summaryValue}>
            {formatDateFull(selectedSlot.start_time.split('T')[0])} at {formatTime(selectedSlot.start_time)}
          </span>
        </div>
      )}

      <div className={styles.formDivider} />

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label htmlFor="firstName" className={styles.formLabel}>First Name</label>
          <input
            id="firstName"
            type="text"
            className={`${styles.formInput} ${errors.firstName ? styles.formInputError : ''}`}
            value={formData.firstName}
            onChange={(e) => onChange('firstName', e.target.value)}
            autoComplete="given-name"
          />
          {errors.firstName && <span className={styles.formError}>{errors.firstName}</span>}
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="lastName" className={styles.formLabel}>Last Name</label>
          <input
            id="lastName"
            type="text"
            className={`${styles.formInput} ${errors.lastName ? styles.formInputError : ''}`}
            value={formData.lastName}
            onChange={(e) => onChange('lastName', e.target.value)}
            autoComplete="family-name"
          />
          {errors.lastName && <span className={styles.formError}>{errors.lastName}</span>}
        </div>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="email" className={styles.formLabel}>Email</label>
        <input
          id="email"
          type="email"
          className={`${styles.formInput} ${errors.email ? styles.formInputError : ''}`}
          value={formData.email}
          onChange={(e) => onChange('email', e.target.value)}
          autoComplete="email"
        />
        {errors.email && <span className={styles.formError}>{errors.email}</span>}
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="phone" className={styles.formLabel}>
          Phone <span className={styles.formOptional}>(Optional)</span>
        </label>
        <input
          id="phone"
          type="tel"
          className={styles.formInput}
          value={formData.phone}
          onChange={(e) => onChange('phone', e.target.value)}
          autoComplete="tel"
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="notes" className={styles.formLabel}>
          Notes <span className={styles.formOptional}>(Optional)</span>
        </label>
        <textarea
          id="notes"
          className={styles.formTextarea}
          value={formData.notes}
          onChange={(e) => onChange('notes', e.target.value)}
          rows={3}
          placeholder="What would you like to discuss?"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function OnboardingBooking({
  clientInfo,
  onBookingComplete,  // Called when user clicks redirect button (after 5 sec countdown)
  onBookingSuccess,   // Called immediately when booking succeeds (to advance step)
  onBack,
  portalBaseUrl = 'https://drshumard.practicebetter.io',
}) {
  // State
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [step, setStep] = useState('select-date');
  const [error, setError] = useState(null);
  const [isSlotExpired, setIsSlotExpired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);
  const [hasAdvancedStep, setHasAdvancedStep] = useState(false);

  const [formData, setFormData] = useState({
    firstName: clientInfo?.firstName || '',
    lastName: clientInfo?.lastName || '',
    email: clientInfo?.email || '',
    phone: clientInfo?.phone || '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState({});

  const timezone = useMemo(() => detectTimezone(), []);
  const today = useMemo(() => getTodayString(), []);

  // Smart polling: pause when on form step
  const shouldPoll = step !== 'fill-form' && step !== 'confirming' && step !== 'success';

  const {
    data: availability,
    isLoading: isLoadingAvailability,
    error: availabilityError,
    refetch: refetchAvailability,
  } = useAvailability(today, 60, {  // Fetch 60 days of availability (backend caches this)
    enabled: true,
    refetchInterval: shouldPoll ? 60 * 1000 : false,
  });

  const bookSession = useBookSession();

  // Configuration for availability window
  // Set to null to show ALL available dates, or a number to limit (e.g., 14 for 2 weeks)
  // See /app/rayguide.md for instructions on changing this
  const AVAILABILITY_DAYS = null; // null = show all dates

  // Derived data - filter to only show dates within AVAILABILITY_DAYS (if set)
  const slotsByDate = useMemo(() => {
    if (!availability?.slots) return {};
    return groupSlotsByDate(availability.slots, today, AVAILABILITY_DAYS);
  }, [availability?.slots, today]);

  const slotsForSelectedDate = useMemo(() => {
    if (!selectedDate || !slotsByDate[selectedDate]) return [];
    return slotsByDate[selectedDate];
  }, [selectedDate, slotsByDate]);

  // Filter dates_with_availability to only include dates within the window (if set)
  const filteredDatesWithAvailability = useMemo(() => {
    if (!availability?.dates_with_availability) return [];
    
    // If no limit set, return all dates
    if (!AVAILABILITY_DAYS) {
      return availability.dates_with_availability;
    }
    
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() + AVAILABILITY_DAYS);
    
    return availability.dates_with_availability.filter(date => {
      const d = new Date(date);
      return d < cutoffDate;
    });
  }, [availability?.dates_with_availability, today]);

  const datesByMonth = useMemo(() => {
    if (!filteredDatesWithAvailability.length) return {};
    return filteredDatesWithAvailability.reduce((acc, date) => {
      const monthYear = getMonthYear(date);
      if (!acc[monthYear]) acc[monthYear] = [];
      acc[monthYear].push(date);
      return acc;
    }, {});
  }, [filteredDatesWithAvailability]);

  // Check if selected slot is still valid
  useEffect(() => {
    if (selectedSlot && !isSlotValid(selectedSlot.start_time)) {
      setIsSlotExpired(true);
    }
  }, [selectedSlot]);

  // Handlers
  const handleDateSelect = useCallback((date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    setStep('select-time');
    setError(null);
    setIsSlotExpired(false);
  }, []);

  const handleTimeSelect = useCallback((slot) => {
    if (!isSlotValid(slot.start_time)) {
      setError('This time slot has passed. Please select another.');
      return;
    }
    setSelectedSlot(slot);
    setStep('fill-form');
    setError(null);
    setIsSlotExpired(false);
  }, []);

  const handleFormChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [formErrors]);

  const validateForm = useCallback(() => {
    const errors = {};

    if (!formData.firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    if (!formData.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!isValidEmail(formData.email)) {
      errors.email = 'Please enter a valid email';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  const handleBack = useCallback(() => {
    if (step === 'select-time') {
      setStep('select-date');
      setSelectedSlot(null);
      setSelectedDate(null);
    } else if (step === 'fill-form') {
      setStep('select-time');
    } else if (onBack) {
      onBack();
    }
  }, [step, onBack]);

  const handleSlotExpiredRefresh = useCallback(() => {
    setIsSlotExpired(false);
    setSelectedSlot(null);
    setStep('select-time');
    refetchAvailability();
  }, [refetchAvailability]);

  const handleConfirmBooking = useCallback(async () => {
    if (!selectedSlot) return;
    if (!validateForm()) return;
    if (isSubmitting) return; // Prevent double-submit

    // Check if slot is still valid
    if (!isSlotValid(selectedSlot.start_time)) {
      setIsSlotExpired(true);
      return;
    }

    setIsSubmitting(true);
    setStep('confirming');
    setError(null);

    try {
      const result = await bookSession.mutateAsync({
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || undefined,
        timezone: timezone,
        slot_start_time: selectedSlot.start_time,
        consultant_id: selectedSlot.consultant_id,
        notes: formData.notes.trim() || undefined,
      });

      const bookingData = {
        isNewClient: result.is_new_client,
        clientRecordId: result.client_record_id,
        sessionId: result.session_id,
      };
      
      setBookingResult(bookingData);
      setStep('success');
      
      // Call onBookingSuccess immediately to advance step (only once)
      if (onBookingSuccess && !hasAdvancedStep) {
        setHasAdvancedStep(true);
        onBookingSuccess({
          session_id: result.session_id,
          client_record_id: result.client_record_id,
          is_new_client: result.is_new_client,
        });
      }

    } catch (err) {
      // Check if it's a slot unavailable error
      if (isSlotUnavailableError(err)) {
        setIsSlotExpired(true);
        setStep('fill-form');
        refetchAvailability();
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setStep('fill-form');
        refetchAvailability();
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedSlot, validateForm, isSubmitting, formData, timezone, bookSession, refetchAvailability, onBookingSuccess, hasAdvancedStep]);

  const handleDone = useCallback(() => {
    if (bookingResult && onBookingComplete) {
      // Pass the full booking result including client_record_id for Step 3 activation
      onBookingComplete({
        session_id: bookingResult.sessionId,
        client_record_id: bookingResult.clientRecordId,
        is_new_client: bookingResult.isNewClient,
      });
    }
  }, [bookingResult, onBookingComplete]);

  // Loading
  if (isLoadingAvailability) {
    return <div className={styles.container}><LoadingState /></div>;
  }

  // Error
  if (availabilityError) {
    return (
      <div className={styles.container}>
        <ErrorState
          onRetry={() => refetchAvailability()}
          message={availabilityError instanceof Error ? availabilityError.message : undefined}
        />
      </div>
    );
  }

  // No availability
  if (!availability?.dates_with_availability?.length) {
    return <div className={styles.container}><NoAvailability /></div>;
  }

  // Success
  if (step === 'success') {
    return (
      <div className={styles.container}>
        <SuccessState
          slot={selectedSlot}
          name={formData.firstName}
          isNewClient={bookingResult?.isNewClient || false}
          clientRecordId={bookingResult?.clientRecordId || null}
          portalBaseUrl={portalBaseUrl}
          onDone={onBookingComplete ? handleDone : undefined}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header} style={{ paddingTop: '12px', paddingBottom: step === 'fill-form' ? '8px' : '8px' }}>
        {step === 'fill-form' ? (
          /* Fill Form: Single row with Back, Title centered, Timezone */
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className={styles.backButton} onClick={handleBack} type="button" style={{ margin: 0 }}>
              ← Back
            </button>
            <h1 className={styles.headerTitle} style={{ textAlign: 'center', margin: 0, flex: 1 }}>
              Your Details
            </h1>
            <span className={styles.headerTimezone}>{timezone.replace(/_/g, ' ')}</span>
          </div>
        ) : (
          /* Other steps: Original layout */
          <>
            <div className={styles.headerTop}>
              {step === 'select-time' && (
                <button className={styles.backButton} onClick={handleBack} type="button">
                  ← Back
                </button>
              )}
              {step === 'select-time' && (
                <span className={styles.headerTimezone}>{timezone.replace(/_/g, ' ')}</span>
              )}
            </div>

            <div className={styles.headerMain}>
              <h1 className={styles.headerTitle} style={{ textAlign: 'center', marginBottom: step === 'select-date' ? '4px' : '8px' }}>
                {step === 'select-date' && 'Step 1: Book Your One-On-One Consult'}
                {step === 'select-time' && formatDateFull(selectedDate)}
              </h1>
              {step === 'select-date' && (
                <p className={styles.headerSubtitle} style={{ textAlign: 'center', marginBottom: '0' }}>Select a date and time for your consultation</p>
              )}
            </div>
          </>
        )}
      </header>

      {step !== 'select-date' && <div className={styles.divider} />}

      {/* Slot Expired Banner */}
      {isSlotExpired && (
        <SlotExpiredBanner onRefresh={handleSlotExpiredRefresh} />
      )}

      {/* Error */}
      {error && !isSlotExpired && (
        <div className={styles.errorBanner}>
          {error}
          <button onClick={() => setError(null)} className={styles.errorDismiss} type="button">×</button>
        </div>
      )}

      {/* Date Selection */}
      {step === 'select-date' && (
        <div className={styles.content}>
          {Object.entries(datesByMonth).map(([monthYear, dates]) => (
            <div key={monthYear} className={styles.monthGroup}>
              <h2 className={styles.monthLabel}>{monthYear}</h2>
              <div className={styles.dateGrid}>
                {dates.map((date) => (
                  <DateCard
                    key={date}
                    date={date}
                    isSelected={selectedDate === date}
                    onClick={() => handleDateSelect(date)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Time Selection */}
      {step === 'select-time' && selectedDate && (
        <div className={styles.content}>
          <p className={styles.availabilityCount}>
            {slotsForSelectedDate.length} available
          </p>
          <div className={styles.timeGrid}>
            {slotsForSelectedDate.map((slot, index) => (
              <TimeSlotButton
                key={`${slot.start_time}-${index}`}
                slot={slot}
                isSelected={selectedSlot?.start_time === slot.start_time}
                onClick={() => handleTimeSelect(slot)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      {step === 'fill-form' && (
        <div className={styles.content}>
          <ClientForm
            formData={formData}
            errors={formErrors}
            onChange={handleFormChange}
            selectedSlot={selectedSlot}
          />
        </div>
      )}

      {/* Footer */}
      {step === 'fill-form' && (
        <footer className={styles.footer}>
          <div className={styles.divider} />
          <button
            className={styles.confirmButton}
            onClick={handleConfirmBooking}
            disabled={isSubmitting}
            type="button"
          >
            {isSubmitting ? 'Processing...' : 'Confirm Booking →'}
          </button>
        </footer>
      )}

      {/* Confirming */}
      {step === 'confirming' && (
        <div className={styles.confirmingOverlay}>
          <div className={styles.loadingIndicator}>
            <span className={styles.loadingDot} />
            <span className={styles.loadingDot} />
            <span className={styles.loadingDot} />
          </div>
          <p className={styles.stateText}>Confirming your booking</p>
        </div>
      )}
    </div>
  );
}

export default OnboardingBooking;
