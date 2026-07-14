import React from 'react';

// Geist-style spinner (12 rotating spokes with a trailing opacity fade), dependency-free.
// Size is controlled by the CSS var `--proto-spinner-size` — pass `size` (px) to set it
// inline, or omit it and size via a class (e.g. for responsive web/mobile sizing).
export default function ProtoSpinner({ size, className = '', style = {} }) {
  const merged = size != null ? { '--proto-spinner-size': `${size}px`, ...style } : style;
  return (
    <span className={`proto-spinner ${className}`} role="status" aria-label="Loading" style={merged}>
      {Array.from({ length: 12 }).map((_, i) => <span key={i} />)}
    </span>
  );
}
