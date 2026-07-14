import "@/intlGuard"; // MUST be first — neutralizes extensions that break Intl.DateTimeFormat
import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// "ResizeObserver loop completed with undelivered notifications" is a benign browser notice
// (the observer simply re-delivers on the next animation frame) — fired by Radix Select's popper
// measuring long lists (e.g. the timezone picker) inside a drawer. It is NOT a real error, but
// CRA's dev overlay treats it as fatal, so swallow just this message before it reaches the overlay.
const RESIZE_OBSERVER_NOISE = /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/;
window.addEventListener("error", (e) => {
  if (e.message && RESIZE_OBSERVER_NOISE.test(e.message)) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
