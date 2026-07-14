import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, X, Search, Info } from 'lucide-react';
import { loadGooglePlaces } from '../../utils/googleMaps';

// Street-address autocomplete powered by the Google Places "new" API
// (AutocompleteSuggestion). Suggestions render in our own branded panel that sits
// IN FLOW directly below the field — never floating/fixed — so it can never cover the
// input and always pushes the rest of the form down (mobile-safe, keyboard-safe).
// On pick, the structured addressComponents are parsed into the form columns via
// onPick({ street, town, state, postalCode, country }). If the API key is missing /
// fails to load, it degrades to a plain text input.

// Google reports US territories as their own country and uses an alternate USVI spelling;
// the form treats territories as US states, so normalize both to match the dropdown options.
const STATE_ALIASES = { 'United States Virgin Islands': 'U.S. Virgin Islands' };
const US_TERRITORY_AS_STATE = {
  'Puerto Rico': 'Puerto Rico',
  Guam: 'Guam',
  'American Samoa': 'American Samoa',
  'Northern Mariana Islands': 'Northern Mariana Islands',
  'United States Virgin Islands': 'U.S. Virgin Islands',
  'U.S. Virgin Islands': 'U.S. Virgin Islands',
};

function parseComponents(components = []) {
  const get = (type, short = false) => {
    const c = components.find((x) => x.types?.includes(type));
    return c ? (short ? c.shortText : c.longText) : '';
  };
  const city = get('locality') || get('postal_town') || get('sublocality_level_1')
    || get('sublocality') || get('administrative_area_level_2');
  let state = get('administrative_area_level_1'); // long name, e.g. "California"
  let country = get('country'); // long name, e.g. "United States"
  if (US_TERRITORY_AS_STATE[country]) {
    state = state || US_TERRITORY_AS_STATE[country];
    country = 'United States';
  }
  state = STATE_ALIASES[state] || state;
  return {
    street: [get('street_number'), get('route')].filter(Boolean).join(' '),
    unit: get('subpremise'),
    town: city,
    state,
    postalCode: get('postal_code'),
    country,
  };
}

// Render a Google prediction's text with the query-matched portion emphasized
// (bold + ink) and the rest muted — mirroring the reference design.
function renderMatched(ft) {
  const full = ft?.text || '';
  const raw = Array.isArray(ft?.matches) ? ft.matches : [];
  // Clamp offsets to the string, drop empty/invalid ranges, sort, and merge overlaps so the
  // bold (matched) and muted spans never skip or double-count characters.
  const ranges = raw
    .map((m) => [Math.max(0, m.startOffset ?? 0), Math.min(full.length, m.endOffset ?? 0)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])
    .reduce((acc, r) => {
      const last = acc[acc.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else acc.push([...r]);
      return acc;
    }, []);
  if (!ranges.length) return <span className="proto-addr-item__sec">{full}</span>;
  const spans = [];
  let cursor = 0;
  ranges.forEach(([s, e], i) => {
    if (s > cursor) spans.push(<span key={`s${i}`} className="proto-addr-item__sec">{full.slice(cursor, s)}</span>);
    spans.push(<span key={`m${i}`} className="proto-addr-item__main">{full.slice(s, e)}</span>);
    cursor = e;
  });
  if (cursor < full.length) spans.push(<span key="tail" className="proto-addr-item__sec">{full.slice(cursor)}</span>);
  return spans;
}

export default function AddressAutocomplete({ value, onChange, onPick, placeholder, id }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const placesRef = useRef(null);
  const sessionRef = useRef(null);
  const debounceRef = useRef(null);
  const mountedRef = useRef(true);
  const reqIdRef = useRef(0);

  const menuId = `${id || 'addr'}-suggestions`;

  useEffect(() => {
    mountedRef.current = true; // reset on (re)mount — StrictMode mounts twice in dev
    let alive = true;
    loadGooglePlaces()
      .then((places) => { if (alive) placesRef.current = places; })
      .catch(() => { /* no key / load failed — stays a plain input */ });
    return () => {
      alive = false;
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const fetchSuggestions = useCallback(async (input) => {
    const places = placesRef.current;
    if (!places || input.trim().length < 3) { setSuggestions([]); setOpen(false); return; }
    if (!sessionRef.current) sessionRef.current = new places.AutocompleteSessionToken();
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const { suggestions: res } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: sessionRef.current,
      });
      if (!mountedRef.current || reqId !== reqIdRef.current) return; // unmounted or stale response
      const preds = (res || []).map((s) => s.placePrediction).filter(Boolean);
      setSuggestions(preds);
      setActiveIdx(-1);
      setOpen(preds.length > 0);
    } catch {
      if (mountedRef.current && reqId === reqIdRef.current) { setSuggestions([]); setOpen(false); }
    } finally {
      if (mountedRef.current && reqId === reqIdRef.current) setLoading(false);
    }
  }, []);

  const onType = (v) => {
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 250);
  };

  const closeMenu = () => { setOpen(false); setSuggestions([]); };

  const choose = async (pred) => {
    setOpen(false);
    setSuggestions([]);
    try {
      const p = pred.toPlace();
      await p.fetchFields({ fields: ['addressComponents'] });
      if (mountedRef.current) onPick(parseComponents(p.addressComponents));
    } catch { /* ignore — keep whatever they typed */ }
    sessionRef.current = null; // a place selection ends the billing session
    inputRef.current?.focus();
  };

  // Close when tapping/clicking anywhere outside the field + suggestions.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) { setOpen(false); setSuggestions([]); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); choose(suggestions[activeIdx]); }
    else if (e.key === 'Escape') { closeMenu(); }
  };

  return (
    <div ref={wrapperRef} className="proto-addr-field">
      <div className="proto-addr-inputwrap">
        <input ref={inputRef} id={id} className="proto-input proto-addr-input" placeholder={placeholder}
          autoComplete="off" role="combobox" aria-expanded={open} aria-controls={menuId} aria-autocomplete="list"
          aria-activedescendant={open && activeIdx >= 0 ? `${menuId}-opt-${activeIdx}` : undefined}
          value={value}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => { if (suggestions.length) setOpen(true); }} />
        <span className="proto-addr-icon" aria-hidden="true">
          {loading ? <Loader2 size={16} className="proto-spin" /> : <Search size={16} />}
        </span>
      </div>

      <p className="proto-addr-hint"><Info size={14} className="proto-addr-hint__ico" /> Add a house number if you have one</p>

      {open && (
        <div id={menuId} className="proto-addr-menu" role="listbox" aria-label="Address suggestions">
          <div className="proto-addr-menu__head">
            <span className="proto-addr-menu__title">Suggestions</span>
            <button type="button" className="proto-addr-menu__close" aria-label="Close suggestions"
              onMouseDown={(e) => e.preventDefault()}
              onClick={closeMenu}>
              <X size={16} />
            </button>
          </div>
          <div className="proto-addr-menu__list">
            {suggestions.map((s, i) => (
              <button type="button" key={s.placeId || i} id={`${menuId}-opt-${i}`} role="option" aria-selected={i === activeIdx}
                className={`proto-addr-item ${i === activeIdx ? 'is-active' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}>
                {renderMatched(s.text)}
              </button>
            ))}
          </div>
          <div className="proto-addr-menu__credit">powered by Google</div>
        </div>
      )}
    </div>
  );
}
