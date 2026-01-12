/**
 * React Query hooks for Practice Better booking system (v2)
 *
 * Improvements:
 * - Smart polling (pauses when not needed)
 * - Better error handling with error codes
 * - Retry configuration
 * - Correlation ID support
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';

const API_BASE = process.env.REACT_APP_BACKEND_URL + '/api/booking';

// ============================================================================
// Error codes from backend
// ============================================================================

export const ERROR_CODES = {
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  BOOKING_IN_PROGRESS: 'BOOKING_IN_PROGRESS',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
};

// ============================================================================
// API Functions
// ============================================================================

function generateCorrelationId() {
  return Math.random().toString(36).substring(2, 10);
}

async function fetchAvailability(startDate, days = 14) {
  const correlationId = generateCorrelationId();

  const response = await fetch(
    `${API_BASE}/availability?start_date=${startDate}&days=${days}`,
    {
      headers: {
        'X-Correlation-ID': correlationId,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch availability' }));
    throw new Error(error.detail || 'Failed to fetch availability');
  }

  return response.json();
}

async function fetchAvailabilityForDate(date) {
  const correlationId = generateCorrelationId();

  const response = await fetch(
    `${API_BASE}/availability/${date}`,
    {
      headers: {
        'X-Correlation-ID': correlationId,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch availability' }));
    throw new Error(error.detail || 'Failed to fetch availability');
  }

  return response.json();
}

async function bookSession(request) {
  const correlationId = generateCorrelationId();

  const response = await fetch(`${API_BASE}/book`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': correlationId,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      detail: 'Booking failed'
    }));

    // Create error with status code info
    const errorMessage = error.detail || 'Booking failed';
    const bookingError = new Error(errorMessage);
    bookingError.statusCode = response.status;
    bookingError.isSlotUnavailable = response.status === 409;

    throw bookingError;
  }

  return response.json();
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch all availability for the next N days
 * Supports smart polling - can be paused when not needed
 */
export function useAvailability(startDate, days = 14, options = {}) {
  const {
    enabled = true,
    refetchInterval = 60 * 1000, // Default 1 minute
  } = options;

  return useQuery({
    queryKey: ['availability', startDate, days],
    queryFn: () => fetchAvailability(startDate, days),
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    refetchInterval: enabled ? refetchInterval : false,
    enabled,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

/**
 * Fetch availability for a specific date
 */
export function useAvailabilityForDate(date) {
  return useQuery({
    queryKey: ['availability', 'date', date],
    queryFn: () => fetchAvailabilityForDate(date),
    enabled: !!date,
    staleTime: 30 * 1000,
    retry: 2,
  });
}

/**
 * Book a session
 * Automatically invalidates availability queries on success
 * Handles slot unavailable errors specially
 */
export function useBookSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bookSession,
    onSuccess: () => {
      // Invalidate availability queries so they refetch
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
    retry: (failureCount, error) => {
      // Don't retry slot unavailable errors
      if (error.isSlotUnavailable) return false;
      // Retry other errors up to 2 times
      return failureCount < 2;
    },
  });
}

/**
 * Custom hook for managing booking state with smart polling
 */
export function useBookingFlow() {
  const [isOnFormStep, setIsOnFormStep] = useState(false);

  // Pause polling when user is filling out the form
  const shouldPoll = !isOnFormStep;

  const enterFormStep = useCallback(() => setIsOnFormStep(true), []);
  const exitFormStep = useCallback(() => setIsOnFormStep(false), []);

  return {
    shouldPoll,
    enterFormStep,
    exitFormStep,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get user's timezone using Intl API
 */
export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'America/New_York'; // Better default than UTC for US-based service
  }
}

/**
 * Format a date string for display
 */
export function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format a time string for display
 */
export function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a datetime range for display
 */
export function formatTimeRange(startTime, endTime) {
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

/**
 * Group slots by date for calendar display
 * Deduplicates slots with the same start time (picks first available consultant)
 * Sorts slots by time within each date
 * Filters to only include dates within maxDays from startDate
 */
export function groupSlotsByDate(slots, startDate = null, maxDays = 14) {
  // Calculate the cutoff date
  let cutoffDate = null;
  if (startDate && maxDays) {
    const start = new Date(startDate);
    cutoffDate = new Date(start);
    cutoffDate.setDate(cutoffDate.getDate() + maxDays);
  }
  
  const grouped = slots.reduce((acc, slot) => {
    const date = slot.start_time.split('T')[0];
    
    // Filter out dates beyond the cutoff
    if (cutoffDate) {
      const slotDate = new Date(date);
      if (slotDate >= cutoffDate) {
        return acc; // Skip this slot
      }
    }
    
    if (!acc[date]) {
      acc[date] = [];
    }
    
    // Check if we already have a slot at this exact time
    const existingSlotIndex = acc[date].findIndex(
      s => s.start_time === slot.start_time
    );
    
    // Only add if no slot exists at this time (deduplicate)
    if (existingSlotIndex === -1) {
      acc[date].push(slot);
    }
    
    return acc;
  }, {});
  
  // Sort slots within each date by start time
  Object.keys(grouped).forEach(date => {
    grouped[date].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  });
  
  return grouped;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Check if a slot is still valid (not in the past)
 */
export function isSlotValid(slotStartTime) {
  try {
    const slotTime = new Date(slotStartTime);
    const now = new Date();
    return slotTime > now;
  } catch {
    return false;
  }
}

/**
 * Check if error is a slot unavailable error
 */
export function isSlotUnavailableError(error) {
  if (error instanceof Error) {
    return error.isSlotUnavailable === true || error.statusCode === 409;
  }
  return false;
}
