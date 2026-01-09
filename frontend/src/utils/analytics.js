/**
 * PostHog Analytics Utility
 * Centralized event tracking for the wellness portal
 */

// Check if PostHog is available
const getPostHog = () => {
  if (typeof window !== 'undefined' && window.posthog) {
    return window.posthog;
  }
  return null;
};

// Identify user (call after login) - uses email as primary identifier for readability
export const identifyUser = (userId, properties = {}) => {
  const posthog = getPostHog();
  if (posthog && properties.email) {
    // Use email as the distinct_id so users are identifiable in PostHog
    posthog.identify(properties.email, {
      user_id: userId,  // Store UUID as a property
      ...properties,
      identified_at: new Date().toISOString()
    });
    console.log('[Analytics] User identified:', properties.email);
  } else if (posthog) {
    // Fallback to userId if no email provided
    posthog.identify(userId, {
      ...properties,
      identified_at: new Date().toISOString()
    });
    console.log('[Analytics] User identified by ID:', userId);
  }
};

// Reset user (call after logout)
export const resetUser = () => {
  const posthog = getPostHog();
  if (posthog) {
    posthog.reset();
    console.log('[Analytics] User reset');
  }
};

// Generic event tracking
export const trackEvent = (eventName, properties = {}) => {
  const posthog = getPostHog();
  if (posthog) {
    posthog.capture(eventName, {
      ...properties,
      timestamp: new Date().toISOString(),
      page_url: window.location.href,
      page_path: window.location.pathname
    });
    console.log('[Analytics] Event tracked:', eventName, properties);
  }
};

// ============================================
// AUTHENTICATION EVENTS
// ============================================

export const trackLogin = (userId, email, method = 'password') => {
  trackEvent('user_logged_in', {
    user_id: userId,
    email: email,
    login_method: method
  });
  identifyUser(userId, { email });
};

export const trackLoginFailed = (email, reason) => {
  trackEvent('login_failed', {
    email: email,
    failure_reason: reason
  });
};

export const trackAutoLogin = (userId, email) => {
  trackEvent('auto_login_used', {
    user_id: userId,
    email: email
  });
  identifyUser(userId, { email });
};

export const trackLogout = (userId) => {
  trackEvent('user_logged_out', {
    user_id: userId
  });
  resetUser();
};

export const trackSignupStarted = () => {
  trackEvent('signup_started', {});
};

export const trackPasswordResetRequested = (email) => {
  trackEvent('password_reset_requested', {
    email: email
  });
};

// ============================================
// STEP/PROGRESS EVENTS
// ============================================

export const trackStepViewed = (stepNumber, stepTitle) => {
  trackEvent('step_viewed', {
    step_number: stepNumber,
    step_title: stepTitle
  });
};

export const trackStepCompleted = (stepNumber, stepTitle) => {
  trackEvent('step_completed', {
    step_number: stepNumber,
    step_title: stepTitle
  });
};

export const trackVideoStarted = (stepNumber, videoId, videoTitle) => {
  trackEvent('video_started', {
    step_number: stepNumber,
    video_id: videoId,
    video_title: videoTitle
  });
};

export const trackVideoCompleted = (stepNumber, videoId, videoTitle, watchDuration) => {
  trackEvent('video_completed', {
    step_number: stepNumber,
    video_id: videoId,
    video_title: videoTitle,
    watch_duration_seconds: watchDuration
  });
};

export const trackVideoPaused = (stepNumber, videoId, currentTime) => {
  trackEvent('video_paused', {
    step_number: stepNumber,
    video_id: videoId,
    paused_at_seconds: currentTime
  });
};

export const trackVideoProgress = (stepNumber, videoId, percentComplete) => {
  trackEvent('video_progress', {
    step_number: stepNumber,
    video_id: videoId,
    percent_complete: percentComplete
  });
};

// ============================================
// FORM EVENTS
// ============================================

export const trackFormViewed = (formType, stepNumber = null) => {
  trackEvent('form_viewed', {
    form_type: formType,
    step_number: stepNumber
  });
};

export const trackFormStarted = (formType, stepNumber = null) => {
  trackEvent('form_started', {
    form_type: formType,
    step_number: stepNumber
  });
};

export const trackFormSubmitted = (formType, stepNumber = null, success = true) => {
  trackEvent('form_submitted', {
    form_type: formType,
    step_number: stepNumber,
    success: success
  });
};

export const trackFormError = (formType, errorMessage) => {
  trackEvent('form_error', {
    form_type: formType,
    error_message: errorMessage
  });
};

// ============================================
// BOOKING EVENTS
// ============================================

export const trackBookingCalendarViewed = () => {
  trackEvent('booking_calendar_viewed', {});
};

export const trackBookingStarted = () => {
  trackEvent('booking_started', {});
};

export const trackBookingCompleted = (appointmentDate = null) => {
  trackEvent('booking_completed', {
    appointment_date: appointmentDate
  });
};

export const trackBookingCancelled = (reason = null) => {
  trackEvent('booking_cancelled', {
    cancellation_reason: reason
  });
};

// ============================================
// NAVIGATION EVENTS
// ============================================

export const trackPageView = (pageName, additionalProps = {}) => {
  trackEvent('page_viewed', {
    page_name: pageName,
    ...additionalProps
  });
};

export const trackDashboardViewed = (currentStep) => {
  trackEvent('dashboard_viewed', {
    current_step: currentStep
  });
};

export const trackAdminPanelViewed = (adminId) => {
  trackEvent('admin_panel_viewed', {
    admin_id: adminId
  });
};

// ============================================
// SUPPORT EVENTS
// ============================================

export const trackSupportPopupOpened = () => {
  trackEvent('support_popup_opened', {});
};

export const trackSupportPopupClosed = () => {
  trackEvent('support_popup_closed', {});
};

export const trackSupportRequestSubmitted = (subject, hasPhone) => {
  trackEvent('support_request_submitted', {
    subject: subject,
    has_phone_number: hasPhone
  });
};

export const trackSupportRequestFailed = (errorMessage) => {
  trackEvent('support_request_failed', {
    error_message: errorMessage
  });
};

// ============================================
// UI INTERACTION EVENTS
// ============================================

export const trackButtonClicked = (buttonName, location) => {
  trackEvent('button_clicked', {
    button_name: buttonName,
    location: location
  });
};

export const trackModalOpened = (modalName) => {
  trackEvent('modal_opened', {
    modal_name: modalName
  });
};

export const trackModalClosed = (modalName) => {
  trackEvent('modal_closed', {
    modal_name: modalName
  });
};

export const trackLinkClicked = (linkName, linkUrl, isExternal = false) => {
  trackEvent('link_clicked', {
    link_name: linkName,
    link_url: linkUrl,
    is_external: isExternal
  });
};

// ============================================
// APPOINTMENT COUNTDOWN EVENTS
// ============================================

export const trackAppointmentCountdownViewed = (appointmentDate, daysUntil) => {
  trackEvent('appointment_countdown_viewed', {
    appointment_date: appointmentDate,
    days_until_appointment: daysUntil
  });
};

export const trackAddToCalendarClicked = (calendarType) => {
  trackEvent('add_to_calendar_clicked', {
    calendar_type: calendarType
  });
};

// ============================================
// ERROR EVENTS
// ============================================

export const trackError = (errorType, errorMessage, componentName = null) => {
  trackEvent('error_occurred', {
    error_type: errorType,
    error_message: errorMessage,
    component_name: componentName
  });
};

export const trackApiError = (endpoint, statusCode, errorMessage) => {
  trackEvent('api_error', {
    endpoint: endpoint,
    status_code: statusCode,
    error_message: errorMessage
  });
};

// ============================================
// SESSION EVENTS
// ============================================

export const trackSessionStart = () => {
  trackEvent('session_started', {
    referrer: document.referrer || 'direct',
    user_agent: navigator.userAgent,
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
};

// ============================================
// ADMIN EVENTS
// ============================================

export const trackAdminUserViewed = (targetUserId) => {
  trackEvent('admin_user_viewed', {
    target_user_id: targetUserId
  });
};

export const trackAdminUserEdited = (targetUserId, fieldsChanged) => {
  trackEvent('admin_user_edited', {
    target_user_id: targetUserId,
    fields_changed: fieldsChanged
  });
};

export const trackAdminPasswordReset = (targetUserId) => {
  trackEvent('admin_password_reset', {
    target_user_id: targetUserId
  });
};

export const trackAdminWelcomeEmailSent = (targetUserId) => {
  trackEvent('admin_welcome_email_sent', {
    target_user_id: targetUserId
  });
};

export const trackAdminUserDeleted = (targetUserId) => {
  trackEvent('admin_user_deleted', {
    target_user_id: targetUserId
  });
};

// Default export with all functions
const analytics = {
  identifyUser,
  resetUser,
  trackEvent,
  trackLogin,
  trackLoginFailed,
  trackAutoLogin,
  trackLogout,
  trackSignupStarted,
  trackPasswordResetRequested,
  trackStepViewed,
  trackStepCompleted,
  trackVideoStarted,
  trackVideoCompleted,
  trackVideoPaused,
  trackVideoProgress,
  trackFormViewed,
  trackFormStarted,
  trackFormSubmitted,
  trackFormError,
  trackBookingCalendarViewed,
  trackBookingStarted,
  trackBookingCompleted,
  trackBookingCancelled,
  trackPageView,
  trackDashboardViewed,
  trackAdminPanelViewed,
  trackSupportPopupOpened,
  trackSupportPopupClosed,
  trackSupportRequestSubmitted,
  trackSupportRequestFailed,
  trackButtonClicked,
  trackModalOpened,
  trackModalClosed,
  trackLinkClicked,
  trackAppointmentCountdownViewed,
  trackAddToCalendarClicked,
  trackError,
  trackApiError,
  trackSessionStart,
  trackAdminUserViewed,
  trackAdminUserEdited,
  trackAdminPasswordReset,
  trackAdminWelcomeEmailSent,
  trackAdminUserDeleted
};

export default analytics;
