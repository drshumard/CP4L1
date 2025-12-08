/**
 * Safely extract error message from API response
 * Handles both string errors and Pydantic validation error objects
 */
export const getErrorMessage = (error, fallbackMessage = 'An error occurred') => {
  if (!error || !error.response) {
    return fallbackMessage;
  }

  const { data } = error.response;

  // If detail is a string, return it
  if (typeof data?.detail === 'string') {
    return data.detail;
  }

  // If detail is an array of Pydantic validation errors
  if (Array.isArray(data?.detail)) {
    const messages = data.detail.map(err => {
      if (typeof err === 'string') return err;
      if (err.msg) return err.msg;
      return JSON.stringify(err);
    });
    return messages.join(', ');
  }

  // If detail is an object (Pydantic error)
  if (typeof data?.detail === 'object' && data.detail !== null) {
    if (data.detail.msg) return data.detail.msg;
    return JSON.stringify(data.detail);
  }

  // Fallback to generic message from response
  if (data?.message) return data.message;

  return fallbackMessage;
};
