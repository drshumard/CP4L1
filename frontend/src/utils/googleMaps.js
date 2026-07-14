// Lazy loader for the Google Maps JS API (Places library, "new" API).
// Uses Google's official dynamic-library bootstrap loader, which defines
// google.maps.importLibrary synchronously and loads the script under the hood.
// Resolves with the `places` library; rejects if no API key is configured so
// callers can degrade to a plain text input.

let loaderPromise = null;

export function loadGooglePlaces() {
  if (loaderPromise) return loaderPromise;

  const key = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error('Missing REACT_APP_GOOGLE_MAPS_API_KEY'));

  loaderPromise = new Promise((resolve, reject) => {
    try {
      if (!window.google?.maps?.importLibrary) {
        /* eslint-disable */
        ((g) => { var h, a, k, p = "The Google Maps JavaScript API", c = "google", l = "importLibrary", q = "__ib__", m = document, b = window; b = b[c] || (b[c] = {}); var d = b.maps || (b.maps = {}), r = new Set, e = new URLSearchParams, u = () => h || (h = new Promise(async (f, n) => { await (a = m.createElement("script")); e.set("libraries", [...r] + ""); for (k in g) e.set(k.replace(/[A-Z]/g, t => "_" + t[0].toLowerCase()), g[k]); e.set("callback", c + ".maps." + q); a.src = `https://maps.${c}apis.com/maps/api/js?` + e; d[q] = f; a.onerror = () => h = n(Error(p + " could not load.")); a.nonce = m.querySelector("script[nonce]")?.nonce || ""; m.head.append(a) })); d[l] ? console.warn(p + " only loads once. Ignoring:", g) : d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)) })({ key, v: "weekly" });
        /* eslint-enable */
      }
      window.google.maps.importLibrary('places').then(resolve).catch(reject);
    } catch (err) {
      loaderPromise = null;
      reject(err);
    }
  });

  return loaderPromise;
}
