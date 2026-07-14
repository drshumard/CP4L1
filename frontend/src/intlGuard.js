// Some browsers — and notably certain session-recording / privacy / anti-fingerprint
// browser extensions — wrap `Intl.DateTimeFormat` and FORCE a `null` timeZone into every
// call (even when the caller passes a valid one). That makes any `new Intl.DateTimeFormat(...)`
// throw "Invalid time zone specified: null" and white-screens the whole app at startup.
//
// We can't satisfy such a wrapper from this realm (it overrides whatever we pass), so the only
// reliable fix is to BYPASS it: recover a pristine `Intl` from a same-origin about:blank iframe
// (content scripts don't run there by default) and route formatting through that instead. The
// recovered copy resolves the REAL system timezone, so timezones keep working correctly.
//
// This guard is OPT-IN: it only acts when the current environment is actually broken. On healthy
// browsers it does nothing, and it is wrapped so it can never itself break the app. Imported
// first in index.js so it runs before any module touches Intl at load time.
(function guardIntl() {
  try {
    if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') return;

    const ctorBroken = (() => {
      try { new Intl.DateTimeFormat().resolvedOptions(); return false; } catch { return true; }
    })();
    const tlsBroken = (() => {
      try { new Date().toLocaleString('en-US'); return false; } catch { return true; }
    })();
    if (!ctorBroken && !tlsBroken) return;

    // Recover a pristine Intl from an about:blank iframe (usually not touched by content scripts).
    let nativeIntl = null;
    try {
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:0;height:0;border:0;visibility:hidden';
      (document.body || document.documentElement).appendChild(frame);
      const candidate = frame.contentWindow && frame.contentWindow.Intl;
      if (candidate && typeof candidate.DateTimeFormat === 'function') {
        new candidate.DateTimeFormat().resolvedOptions(); // throws if the iframe is also broken
        nativeIntl = candidate;
      }
      // Intentionally leave the iframe attached so the recovered realm stays alive.
    } catch {
      nativeIntl = null;
    }

    if (nativeIntl) {
      const NDF = nativeIntl.DateTimeFormat;
      if (ctorBroken) Intl.DateTimeFormat = NDF;
      if (tlsBroken) {
        const fmt = (date, locales, options) => new NDF(locales, options).format(date);
        // eslint-disable-next-line no-extend-native
        Date.prototype.toLocaleString = function (l, o) {
          return fmt(this, l, o || { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
        };
        // eslint-disable-next-line no-extend-native
        Date.prototype.toLocaleDateString = function (l, o) {
          return fmt(this, l, o || { year: 'numeric', month: 'numeric', day: 'numeric' });
        };
        // eslint-disable-next-line no-extend-native
        Date.prototype.toLocaleTimeString = function (l, o) {
          return fmt(this, l, o || { hour: 'numeric', minute: 'numeric', second: 'numeric' });
        };
      }
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[intlGuard] A browser extension had broken Intl.DateTimeFormat; recovered a pristine copy from an iframe. Timezones work normally.');
      }
      return;
    }

    // Last resort: the iframe was patched too. Keep the app ALIVE (no white-screen) with a
    // degraded, non-throwing formatter. Dates may render imprecisely while the extension is active.
    if (ctorBroken) {
      const Broken = Intl.DateTimeFormat;
      const STUB = {
        format: (d) => (d instanceof Date ? d.toISOString() : String(d)),
        formatToParts: () => [],
        resolvedOptions: () => ({ timeZone: 'UTC', locale: 'en-US' }),
      };
      function PatchedDateTimeFormat(locales, options) {
        try { return new Broken(locales, options); } catch { return STUB; }
      }
      PatchedDateTimeFormat.prototype = Broken.prototype;
      if (typeof Broken.supportedLocalesOf === 'function') {
        PatchedDateTimeFormat.supportedLocalesOf = (...a) => Broken.supportedLocalesOf(...a);
      }
      Intl.DateTimeFormat = PatchedDateTimeFormat;
    }
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[intlGuard] Intl.DateTimeFormat is broken by an extension and could not be recovered; using a degraded fallback so the app still loads.');
    }
  } catch {
    /* never let the guard itself break the app */
  }
})();
