# Cadence — Portal-Owned Scheduling: Implementation Plan

> Status: **PLAN / FOR REVIEW** — no code written yet. Revised after a 3-critic adversarial review against the codebase (see §13). Date: 2026-06-20.
> Goal: move scheduling out of Practice Better (PB) + Zoom into the portal. The portal becomes the **sole front door**: it owns availability rules, holidays, the client calendar, round-robin director assignment, and the **authoritative booking ledger**. Google Calendar becomes the per-director event sink and Meet-link source (replacing Zoom). PB runs on **one shared account** as a clinical record only and is **never polled for availability**.
>
> Line numbers below are anchors from the code map; they drift as edits begin — treat as approximate.

---

## 0. Locked decisions & key deltas

| # | Decision | Choice |
|---|----------|--------|
| Delivery | Sequencing | **Plan/spec first** (this doc), then build in phases |
| PB cancel/reschedule (§10 of spec) | PB API unverified | **Best-effort adapter + `pending`/`cancel_pending` admin queue** |
| GHL inbound webhook | `/api/webhook/appointment` (+ cancel) + `appointments` collection | **Leave live/untouched** (revisit) — but see §12 for the real consequences |
| Admin theme | Look | **Neutral professional light (Inter)**, distinct from teal patient portal |
| Email (D1) | Provider | **Resend** (spec mandate; `main` uses Resend everywhere). Branch SMTP2GO dropped. |
| D2 | Google free/busy | Not used — local ledger is authoritative |
| D4 | Reschedule director | Default **re-roll**; option to keep same director if free |
| D7 | Buffer | `buffer_minutes` default `0` (engine-level only — see §2.2 caveat) |
| D8 | Balancing window | Same calendar day |

**Reality deltas vs the spec doc (verified):**
- Booking code lives in **`backend/booking.py`** (router `/api/booking`), not `server.py` (which mounts it, `~server.py:4310`).
- The `google-calendar-feature` branch already made PB telehealth optional (drops Zoom), added `session_notify`/`mark_confirmed`, and shipped a reusable `services/google_calendar.py` — we port these.
- PB service has **no** cancel/reschedule/list-session methods today (only create-record + create-session).
- **No admin reset/set-password action exists** — system is passwordless. The **"reset" action (`~server.py:3680`) is reset-*progress*, not password**; **"refund" = `set-step → 0`**. There is an **extra action to preserve the spec didn't list: role promote/demote (staff/user)**. The Users page has **no stat cards** (stats are in Analytics). No password endpoints are in scope.
- `backend/service_account.json` (real private key) is **committed**; it is loaded by **both** the (new) Calendar service **and** the live `services/google_drive.py` (hardcoded path, `~google_drive.py:8`, used at `~server.py:2207`).
- Two Mongo clients exist (`~server.py:28` requires `DB_NAME`; `~booking.py:43` defaults to `'client_journey'`). **They converge to the same DB whenever `DB_NAME` is set — which it must be, or `server.py` fails at import.** So there is **no live two-database split**; unifying is hygiene (one pool, removes the dead `'client_journey'` default), not a data-split fix.
- JWT secret mismatch: `~server.py:31` random fallback vs `~booking.py:427` literal `your-secret-key-change-in-production` — fix to one shared source.

---

## 1. Target architecture

```
Patient (teal portal)
   │  GET  /api/booking/availability        (local engine; same JSON shape)
   │  POST /api/booking/book                 (server assigns director; idempotent)
   │  POST /api/booking/{id}/reschedule|cancel  (JWT-owned or signed link)
   │  GET  /api/user/appointment             (now reads the ledger; returns booking_id + meet_link)
   ▼
Portal (FastAPI + MongoDB) ── SOLE booking creator ──┐
   • directors / bookings(authoritative) / settings   │
   • availability = rules − time-off − closures − confirmed bookings
   • round-robin (least-loaded, atomic insert)         │
        │ create event w/ Meet                          │ clinical mirror (best-effort)
        ▼                                                ▼
 Google Calendar (per-director)                  Practice Better (1 shared account)
        │                                          pb_status: synced|pending|cancel_pending
        ▼
 Resend → confirm / reschedule / cancel emails
```

---

## 2. Data model (MongoDB) — single instance, no Postgres split

### 2.1 `directors` (new)
```jsonc
{
  "director_id": "uuid", "name": "Dr. Jane Doe", "active": true,
  "google_calendar_id": "...@group.calendar.google.com",
  "timezone": "America/Los_Angeles",                              // IANA; rules interpreted here
  "weekly_rules": [ { "day_of_week": 1, "start": "09:00", "end": "13:00" } ],  // 0=Mon..6=Sun
  "time_off":     [ { "start_utc": "...", "end_utc": "...", "reason": "Vacation" } ],
  "created_at": "...", "updated_at": "..."
}
```
- All fields editable in UI. No round-robin pointer (fairness via least-loaded + random tiebreak).
- `DELETE` = soft deactivate (`active=false`) so historical bookings keep their director.

### 2.2 `bookings` (new — authoritative ledger)
```jsonc
{
  "booking_id": "uuid",                       // ledger PK — DISTINCT namespace from legacy appointments.booking_id
  "user_id": "uuid|null",                     // null for guest bookings
  "director_id": "uuid", "status": "confirmed",   // confirmed | cancelled
  "slot_start_utc": "...", "slot_end_utc": "...",
  "duration_minutes": 30,                     // CANONICAL unit = minutes (PB uses seconds; UI uses minutes)
  "patient_timezone": "America/New_York",
  "patient": { "first_name","last_name","email","phone" },
  "gcal_calendar_id": "...", "gcal_event_id": "...", "gcal_status": "synced", // synced|pending
  "meet_link": "...",
  "pb_client_record_id": "...", "pb_session_id": "...", "pb_status": "synced", // synced|pending|cancel_pending
  "confirmation_email_sent_at": "...",        // atomic single-send claim (see §3.5)
  "source": "patient",                        // patient | admin
  "notes": "...", "created_at": "...", "updated_at": "..."
}
```
**Indexes** — created in a **dedicated, fail-loud** block (NOT the existing error-swallowing startup block `~server.py:4331-4351`), with a startup assertion that the unique index exists before `/book` serves:
```js
db.bookings.createIndex({ director_id:1, slot_start_utc:1 },
  { unique:true, partialFilterExpression:{ status:"confirmed" } })   // exact-slot guard
db.bookings.createIndex({ slot_start_utc:1, status:1 })   // availability
db.bookings.createIndex({ user_id:1 })
db.bookings.createIndex({ director_id:1, status:1 })
db.bookings.createIndex({ pb_status:1 }, { partialFilterExpression:{ pb_status:{ $in:["pending","cancel_pending"] } } })
```
**Concurrency-guard caveat (corrected):** this unique index makes **exact-slot** double-booking impossible at the storage layer **only when `buffer_minutes == 0`** (the default). With `buffer_minutes > 0`, the conflict is an *adjacent/overlapping* slot at a **different** `slot_start_utc`, which the start-keyed index does **not** block — so buffer protection is **engine-level (soft) and NOT race-safe**. If buffer ever needs to be race-safe, switch the guard to a transactional interval-overlap check (store `slot_end_utc`, query overlap in a session) — out of scope at default.

`users.booking_info` is retained as a denormalized mirror for the journey UI/step logic; `bookings` is authoritative.

### 2.3 `settings.app_settings` (extend singleton `db.settings{_id:'app_settings'}`)
Add every key to `SETTINGS_DEFAULTS` + the PUT whitelist (`~server.py:4254-4297`) or it is silently dropped.
```jsonc
{
  "availability_days": 14,                 // kept (default patient booking window)
  "booking_engine": "pb",                  // pb | local — cutover flag (see §7); flips to "local" at go-live
  "shared_pb_consultant_id": "...", "pb_service_id": "...",
  "slot_minutes": 30, "min_notice_minutes": 120, "max_advance_days": 90, "buffer_minutes": 0,
  "session_title": "Strategy Session", "session_description": "...",
  "clinic_closures": [ { "start_utc":"...", "end_utc":"...", "reason":"Holiday" } ]
}
```
Public settings (`GET /api/settings/public`) expands to: `availability_days`, `slot_minutes`, `min_notice_minutes`, `max_advance_days`.

---

## 3. New / changed backend services

### 3.1 `backend/services/availability.py` (new) — local engine, no external calls
`compute_availability(range_start, range_end, patient_tz) -> [slot_start_utc]` = for each active director, `generate_slots(weekly_rules, director.tz, …, slot_minutes)` (tz-aware via `zoneinfo`, DST-correct) minus `time_off`, `clinic_closures`, and that director's confirmed bookings; count free directors per slot; return sorted slots where count > 0 (capacity hidden, dedup inherent). Clamp to `[now+min_notice, now+max_advance_days]`.
- `buffer_minutes>0`: also subtract slots overlapping `[start, end+buffer)` — **soft/engine-level only** (see §2.2).
- Helper `directors_free_at(slot_start_utc) -> [director]` reused by assignment.
- **Empty-state:** zero active directors (or all on time-off) → returns `[]` gracefully; the patient widget shows "no times available". `/book` then returns a typed `409`. A startup/admin alert fires when active director count is 0.

### 3.2 `backend/services/assignment.py` (new) — round-robin, atomic
`assign_and_hold(slot, patient, user_id, source, forced_director=None) -> (director_id, booking_id)`: recompute `directors_free_at`; if empty → `SlotFull`; order = `[forced_director]` or `sort(eligible, key=load_in_window asc, random tiebreak)`; loop inserting a `confirmed` booking — first success wins, `DuplicateKeyError` → next director; exhausted → `SlotFull`. `load_in_window(d)` = confirmed bookings for `d` same calendar day (D8).
- **Note:** because assignment re-rolls to a *different* director on `DuplicateKeyError`, the unique index does **not** stop the *same* patient double-submitting (two free directors → two bookings). Patient double-submit is handled by an idempotency guard *before* assignment (§4.1).

### 3.3 `backend/services/google_calendar.py` (port from branch, modify)
- **Keep**: DWD service-account auth (`_load_credentials`, `_calendar_service`), `_extract_meet_url`, UTC helpers. Scope `calendar.events`.
- **Change** `attach_meet` (patch-after) → **`create_event_with_meet(calendar_id, summary, description, start_utc, end_utc, director_tz, attendee_email, request_id=booking_id)`** = one `events.insert` with `conferenceData.createRequest` + `conferenceDataVersion=1`; returns `(event_id, meet_link)`.
- **Add** `update_event_time(...)` (events.patch, preserves Meet) and `delete_event(...)`.
- **Auth model**: impersonate a single Workspace user `GOOGLE_CALENDAR_SUBJECT` with write access to every director calendar (Meet creation requires impersonating a real user — see §9.2). Resolve calendar id from `directors`, not env.
- **Remove / do not port**: all watch/sync/webhook/renewal machinery, `consultant_calendar_map`, prefix sniffing, and the entire `google_calendar_routes.py` (`/api/google/*`, `/calendar-webhook`, `calendar_watches`, `start_background_renewal`).

### 3.4 `backend/services/practice_better_v2.py` (keep-modify; large removals)
- **Remove** (availability half): `get_consultants`, `get_availability` + fan-out + `Semaphore` + practitioner-hash key, `slot_in_cache`, `TimeSlot`, `CacheEntry`, `AvailabilityCache`, the `_availability_cache` field + its `.clear()`; drop `practitioner_ids` + `availability_cache_ttl` config.
- **Keep-modify**: `TokenManager`, `_request`, client create/search/get-or-create, `convert_timezone_to_windows`. `book_session`: `asConsultantId = settings.shared_pb_consultant_id`; keep `serviceId`/`serviceType`; **drop `telehealthSettings` (Zoom)**; **inject Meet link into `notes` (D1)**; keep branch's `notify`/`markConfirmed`. `complete_booking`: drop `slot_in_cache`/`cached_availability`.
- **Add (best-effort adapter — all PB mutations isolated here)**: `cancel_session(pb_session_id)`, `reschedule_session(pb_session_id, new_date)` — attempt likely PB endpoints; on unverified/error raise typed errors the caller maps to `pb_status='cancel_pending'|'pending'`. Real endpoints drop in once §10 is confirmed.

### 3.5 `backend/services/booking_email.py` (port rendering, **Resend**, new templates)
- Reuse HTML/text rendering + TZ-aware `_format_when` + PB-activation deep-link math. **Send via `resend.Emails.send`** (matching `server.py`); delete `services/smtp2go.py`. Drop the Google-event param + `_strip_patient_from_summary` (portal knows `session_title`).
- Add **reschedule** + **cancellation** templates. All emails render time via **`bookings.patient_timezone`** (fallback: user signup tz → clinic default).
- **Implement a NET-NEW atomic single-send guard** (not a port — no such code exists today): `find_one_and_update(booking, {confirmation_email_sent_at:{$exists:false}}, {$set:{confirmation_email_sent_at:now}})`; send only if the claim succeeded; unset on send failure to allow retry.

---

## 4. Flows (re-sequenced)

### 4.0 Auth & ownership (NEW — closes IDOR)
- `POST /api/booking/book` stays effectively public (optional JWT), as today.
- `POST /api/booking/{id}/reschedule|cancel`: **JWT-gated with ownership check** — `booking.user_id == token.sub`, else `403`; admin bypass via `get_admin_user`. For **guest bookings (`user_id=null`)** or email-link flows, accept a **signed token** (HMAC of `booking_id` with `JWT_SECRET_KEY`) delivered in the confirmation/reschedule email; mismatch → `403`, unknown id → `404`.
- **How a patient gets their `booking_id`:** upgrade `GET /api/user/appointment` (`~server.py:1062`) to resolve from the **`bookings` ledger** for the logged-in user and return `booking_id`, `meet_link`, `slot_start_utc`, `slot_end_utc`, `status` (keeping the legacy `session_date` field for back-compat). Email links carry the signed token.

### 4.1 Book — `POST /api/booking/book`
Wire shape unchanged (patient UI untouched): `consultant_id` is **accepted but ignored** (server assigns); `/availability` emits sentinel `consultant_id:"auto"`. (Validator is only `not_empty` at `~booking.py:85` — `"auto"` round-trips; no schema change needed.)
0. **Idempotency guard (NEW):** look up an existing `confirmed` booking for `(user_id||email, slot_start_utc)`; if found, return it (handles double-click; survives director re-roll).
1. Validate future + within `[min_notice, max_advance]`.
2. `assign_and_hold(slot)` → `(director_id, booking_id)` (atomic). Empty → typed `409 SlotFull`.
3. Google `create_event_with_meet` → `gcal_event_id, meet_link`, `gcal_status='synced'`. **FAIL → set booking `cancelled` (release hold), `503`.**
4. PB (non-critical): `get_or_create_client` → `book_session(notes incl meet_link)` → `pb_session_id`, `pb_status='synced'`. **FAIL → `pb_status='pending'`, enqueue retry; do NOT cancel patient.**
5. Persist ids on `bookings`; mirror to `users.booking_info`; advance journey (single source — see §4.4); fire `new_booking` automations (parity with GHL webhook) + LeadConnector webhook.
6. Resend confirmation (Meet link, `patient_timezone`) via the atomic single-send guard.
7. Return summary + `meet_link` + `booking_id`. Response: make `client_record_id` and `meet_link` **Optional**; `session_id` falls back to `booking_id` on the PB-pending branch; **`duration` is `slot_minutes` (minutes)**, not PB seconds.

### 4.2 Reschedule — `POST /api/booking/{id}/reschedule {new_slot_start_utc}`
Auth per §4.0. 1. Load `confirmed` booking. 2. Target director: default re-roll (D4); `keep_same` if free.
3. **Google FIRST, then commit** (compensation-safe): for same director, `update_event_time`; for director change, **create new event before deleting old** (capture old id, delete only after new succeeds). If Google fails → `gcal_status='pending'` + admin retry, return `503` (booking row not yet moved) — symmetric to §4.1.
4. Move the booking row to `new_slot_start_utc` (+director); `DuplicateKeyError` → `409` (index protects reschedule). Old slot frees automatically.
5. PB best-effort `reschedule_session` else cancel+recreate; failure → `pb_status='pending'`.
6. **Keep `/api/user/appointment` consistent:** update the matching legacy `appointments` row (if any) + `users.booking_info` mirror. Resend reschedule notice in `patient_timezone`.

### 4.3 Cancel — `POST /api/booking/{id}/cancel`
Auth per §4.0. 1. Load `confirmed`. 2. Google `delete_event` (failure → `gcal_status='pending'` admin queue). 3. PB best-effort `cancel_session`; failure → `pb_status='cancel_pending'`. 4. Set `status='cancelled'` (frees slot). 5. **Update legacy `appointments` row + clear/adjust `users.booking_info`** so the countdown doesn't show a cancelled slot as booked. 6. Fire `cancelled_booking` automations (parity with GHL cancel webhook). 7. Resend cancellation (optional). Journey step left as-is.

### 4.4 Single source of Step-1 advancement (NEW — de-dup)
The identical advance (`current_step 1→2` + `user_progress` + LeadConnector hook) lives in both `~booking.py:619-661` and the GHL `~server.py:906-933`. With the portal as sole creator + GHL left live, one booking could fire both. **Make advancement idempotent:** only advance/fire if not already done (guard on `current_step>1` or a `step1_completed_at`/`leadconnector_fired` flag); the GHL webhook block checks the same guard. Document the portal `/book` as the primary trigger.

---

## 5. Endpoint changes (file-level)

### 5.1 `backend/booking.py`
| Endpoint / symbol | Action |
|---|---|
| `GET /availability`, `/availability/{date}` | Recompute via `availability.py`; preserve `AvailabilityResponse` shape; `consultant_id="auto"`. Gated by `booking_engine` flag (§7). |
| `POST /book` | Rewrite per §4.1; remove cooldown, 429 retention, PB availability read, consultant substitution. Add idempotency guard. |
| `POST /{id}/reschedule`, `POST /{id}/cancel` | **New** (§4.2/§4.3) with §4.0 auth. |
| Cache machinery (`_availability_cache`, TTLs, `refresh_availability_cache`, `start/stop_background_refresh`, `get_cached_availability`, `cache_status`) | **Remove** — but keep dormant behind the `booking_engine` flag until bake-in passes (§7), then delete. Both startup/shutdown call sites are `try/except`-guarded (safe). |
| `GET /health` | Drop `get_consultants`; report Mongo + Google readiness; **do not 503 just because PB is now passive**. |
| `_decode_optional_jwt_user_id` | Keep; fix JWT secret to shared source (no literal default). |
| Own Mongo client | Use shared `db`. |
| `GET /api/user/appointment` (in `server.py:1062`) | **Upgrade** to read the ledger and return `booking_id`/`meet_link`/`slot_end_utc`/`status` (see §4.0). |

### 5.2 `backend/server.py` (admin surface)
| Endpoint | Action |
|---|---|
| `GET/POST /api/admin/directors`, `PUT/DELETE /api/admin/directors/{id}` | **New** CRUD (DELETE = soft). `get_admin_user`. |
| `GET /api/admin/bookings` | **New** list/search (director, status, date, `pb_status`/`gcal_status`, email), paginated. |
| `POST /api/admin/bookings` | **New** manual booking (`forced_director`, `source='admin'`), same §4.1 sequence. |
| `POST /api/admin/bookings/{id}/reschedule|cancel|retry-pb` | **New** (retry-pb drains the `pending`/`cancel_pending` queue). |
| `POST /api/admin/user/{id}/update-booking`, `DELETE …/booking` | **Effectively a rewrite, not an upgrade.** Today they're `user_id`-keyed and dual-write `users.booking_info` + `appointments` with no `booking_id`/director. New behavior: resolve the user's `bookings` row → if present, run §4.2/§4.3; **fallback** (legacy/GHL/admin_manual rows with no ledger row / no `gcal_event_id` / no `pb_session_id`) → operate Mongo-only on `booking_info`+`appointments` (current behavior), skipping Google/PB. Define which is authoritative when both exist (ledger wins if a `booking_id` exists). |
| `GET/PUT /api/admin/settings`, `GET /api/settings/public` | Extend `SETTINGS_DEFAULTS` + whitelist with §2.3 keys incl. `booking_engine`. |
| Existing user/activity/analytics/automations endpoints | Keep; UI re-housed in shell. |
| GHL `/webhook/appointment/cancel` (`~server.py:993`) coexistence | Stays live (decision). **Note:** a GHL cancel frees only `appointments`, not the ledger/Google event — flagged in §12. |

### 5.3 PB-pending retry (D5)
`bookings.pb_status`/`gcal_status` queues surfaced in Scheduling → Bookings with a "Retry" action; optional small bounded periodic task (safe now PB polling is gone — ~1 write/booking).

---

## 6. Frontend — unified admin shell (neutral pro light, Inter)

### 6.1 Shell & routing
- New nested **layout route** in `App.js` replacing the 4 flat `/admin*` routes: `/admin` → `<AdminLayout>` (`<Outlet/>`).
- `pages/admin/AdminLayout.jsx`: grouped **left sidebar** + **topbar** (breadcrumb · contextual search · notifications · user menu/logout). Removes the absolute-centered `<h1>` overlapping-title bug (`~AdminDashboard.js:509`, `~AdminAnalytics.js:214`).
- Sidebar: **Overview** (Analytics) · **Scheduling** (content-level tab strip: Bookings · Directors · Availability · Settings) · **People** (Users) · **Activity log** · **Automations** · **Settings**. Patient `Dashboard.js` admin links still land here.
- `components/ui/sidebar.jsx` (compose from primitives; `sheet.jsx` for mobile drawer). Tab strip uses shadcn `tabs.jsx` styled as the `tab.png` segmented pill.
- **Accessibility/responsive acceptance criteria** (new): keyboard-navigable sidebar + tabs (roving tabindex / `aria-selected`), visible focus rings, sidebar collapses to drawer < `md`, topbar search reachable, color-contrast AA.

### 6.2 Theme
Admin uses the **neutral light** shadcn tokens (already neutral in `index.css`) scoped under an `.admin` wrapper, Inter throughout, bold titles. Patient teal routes untouched (teal is hardcoded in patient JSX).

### 6.3 Pages (preserve every action)
- **Users** (`AdminDashboard.js` → shell): list/search/pagination, user-details modal, edit, resend welcome, **reset-progress** (not password), set-step/**refund=step 0**, **promote/demote staff**, delete, booking update/delete. The inline `availability_days` card moves into Scheduling.
- **Activity log / Analytics / Automations**: keep logic; drop bespoke headers; re-house.
- **Scheduling → Bookings** (new): ledger table (filters, `pb_status`/`gcal_status` badges + Retry), manual booking, row reschedule/cancel.
- **Scheduling → Directors** (new): CRUD + weekly-rules editor + time-off editor + calendar id + tz + active toggle.
- **Scheduling → Availability** (new, **all scheduling rules co-located**): `slot_minutes`, `min_notice_minutes`, `max_advance_days`, `buffer_minutes`, `clinic_closures`, + a **live preview calendar** of computed availability.
- **Scheduling → Settings** (new, **integration/identity only**): `shared_pb_consultant_id`, `pb_service_id`, `session_title`, `session_description`, `availability_days`, `booking_engine` flag.
- **Patient `AppointmentCountdown.js` / `Dashboard.js`** (NOT no-change): replace the hardcoded **60-min** add-to-calendar end (`~AppointmentCountdown.js:143/152/170`) with `slot_end_utc`/`duration_minutes` from the upgraded appointment payload; surface `meet_link`. `OnboardingBooking.jsx` / `useBooking.js` need no change (wire shapes preserved).

---

## 7. Migration, cutover & rollback

1. Provision shared PB account; set `shared_pb_consultant_id` + `pb_service_id`; ensure its service availability won't reject portal-approved times.
2. Create per-director Google calendars; record `google_calendar_id`.
3. Enable Calendar API + `calendar.events` scope on the delegated SA; confirm the subject can write each calendar.
4. **Seed `directors` BEFORE retargeting `/availability`** (else empty schedule).
5. **Seed `bookings` from future appointments** (precondition: unique index already created):
   - Preferred source = PB future-sessions list — **but PB has no verified list endpoint** (§9.5). **Fallback if none:** seed from `db.appointments` / `users.booking_info` / GHL, or accept a "start-empty + short freeze on pre-cutover slots" window. State the chosen path explicitly.
   - Seed must: assert the index exists; **de-dup `(director_id, slot_start_utc)` before insert**; use `ordered=false` bulk tolerating/counting `DuplicateKeyError`; **escalate true collisions** (two real PB patients, same director+time = a pre-existing PB double-book) to an admin review list — never silently drop.
   - Ensure each seeded row has a Google event (create if missing). Leave in-flight sessions under original practitioners.
6. **Cutover behind the `booking_engine` flag** (`pb`→`local`): flip `/availability` + `/book` to the local engine, stop PB polling. Keep the deleted PB read path **dormant (not removed)** until a bake-in window passes.
   - **Go/no-go checks** before flip: engine returns non-empty slots for a known director; a test Google event + Meet link creates successfully; index assertion passes.
   - **Rollback:** flip `booking_engine` back to `pb` (no redeploy); the `"auto"` sentinel is backward-compatible. Document exact revert steps.
7. After bake-in, delete dormant PB-availability code + retired endpoints/env.

---

## 8. Security & config (§12 of spec)
- **`service_account.json`**: stop tracking + `.gitignore`; load via `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` in **both** the new Calendar service **and `services/google_drive.py`** (currently a hardcoded path, `~google_drive.py:8`, live at `~server.py:2207`) — otherwise PDF upload breaks. The physical key must exist at the configured path on deploy or **both** modules fail.
- **Key rotation is your GCP action** (generate new, deploy via secret/env, delete old id). Confirm the rotated DWD key grants **both** `drive`/`drive.file` (subject `drjason@drshumard.com`) **and** `calendar.events` (subject `GOOGLE_CALENDAR_SUBJECT`) — possibly the same user with both scope grants. History purge (BFG) is destructive; I will **not** run it without explicit go-ahead.
- **JWT_SECRET_KEY**: remove the insecure literal default in `booking.py`; require env; single shared resolution with `server.py`.
- New env: `GOOGLE_CALENDAR_SUBJECT`, `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`, `EMAIL_FROM_ADDRESS`/`EMAIL_FROM_NAME`. **Remove** `PB_CONSULTANT_CALENDAR_MAP`, `MEET_EVENT_SUMMARY_PREFIX`, `GOOGLE_CALENDAR_WATCH_TOKEN`, `PRACTICE_BETTER_PRACTITIONER_IDS`, `AVAILABILITY_CACHE_TTL`, `BACKGROUND_REFRESH_INTERVAL` — **after** grepping deploy configs/monitors for them and for the `/api/booking/cache-status` endpoint.

---

## 9. Dependencies I need from you (blocking the build)
1. Per-director **Google calendar IDs**.
2. The **Workspace user** the SA impersonates (`GOOGLE_CALENDAR_SUBJECT`) with write access to all director calendars (Meet creation needs a real-user impersonation).
3. **Calendar API enabled** + `calendar.events` scope on the delegated SA; confirm both Drive and Calendar scopes survive key rotation.
4. Shared PB account id + `serviceId`; confirmation its availability won't reject portal times.
5. (When available) PB cancel/reschedule/get + **future-sessions list** endpoints (§10) — the last one gates backfill source.
6. Go/no-go on untracking `service_account.json` now (rotation is your GCP action regardless).

---

## 10. Testing & verification
- **Availability engine** (unit): DST spring-forward/fall-back, notice/advance clamping, rule→slot in director tz, subtraction (time-off, closures, bookings, buffer), multi-director dedup, **empty-directors → []**.
- **Assignment**: least-loaded order, random tiebreak, simulated `DuplicateKeyError` race → one winner + `SlotFull`; **patient double-submit → one booking** (idempotency guard).
- **Book**: Google fail → 503 + hold released; PB fail → `pending`, patient kept; success persists ids, mirrors `booking_info`, advances step **once**, fires `new_booking` + LeadConnector, sends email **once** (atomic claim, NEW).
- **Reschedule/cancel**: same vs different director; Google-fail compensation (row not moved / new-before-delete); `DuplicateKey`→409; cancel frees slot + updates `appointments`+`booking_info` so `/user/appointment` is consistent; fires `cancelled_booking`; auth/ownership 403/404; legacy fallback (no ledger row) → Mongo-only.
- **Index**: unique blocks 2nd confirmed insert; cancelled rows don't block; **fail-loud creation**; seed dedup.
- **Regression**: update `backend/tests/*` + `backend_test.py` that exercise PB availability/cache (removed). Patient booking + countdown smoke (slot_end-driven calendar links).
- **Frontend**: shell routing + each tab; every preserved Users action; a11y/keyboard/responsive criteria.

---

## 11. Phasing (after approval)
- **P1 — Data + engine**: collections + **fail-loud** indexes + settings (incl. `booking_engine`); `availability.py` (+empty-state); `/availability` behind flag; tests.
- **P2 — Booking core**: `google_calendar.py` port (Meet-on-insert); `assignment.py`; `/book` rewrite + idempotency + PB adapter (book/pending) + automations parity; Resend confirmation (atomic single-send); Step-1 de-dup (§4.4); cache machinery dormant-behind-flag; unify Mongo client + JWT secret.
- **P3 — Reschedule/cancel + admin APIs**: booking reschedule/cancel (auth, compensation, appointments consistency); upgrade `/user/appointment`; directors CRUD; `/api/admin/bookings` (+manual, retry); rewrite user update/delete-booking (+legacy fallback); extend settings.
- **P4 — Migration + cutover**: seed scripts (dedup/escalate/fallback) + cutover/rollback runbook + GHL-gap mitigation decision.
- **P5 — Admin UI**: shell + theme + routing + a11y; re-house Users/Activity/Analytics/Automations; build Scheduling tabs; fix AppointmentCountdown.
- **P6 — Security**: untrack key + `.gitignore` + env loading (Calendar **and** Drive); JWT fix; env cleanup (post-grep); delete dormant PB code after bake-in.

---

## 12. Risks & open items
- **GHL coexistence (your "revisit" choice) — bidirectional & live:** `/webhook/appointment(+cancel)` stay **live**, writing `db.appointments`, which the engine never reads; `bookings` and `appointments` share **no director/slot key**, so collisions are **undetectable, not just uncounted** — double-book risk both directions, and a GHL cancel won't free the ledger/Google event. Interim mitigation option: have the engine also subtract overlapping `appointments` rows mapped to a director. **Needs an owner + decision date**, not open-ended deferral.
- **Cutover is reversible** via the `booking_engine` flag + dormant PB code + go/no-go checks (§7).
- **Backfill** depends on an unverified PB list endpoint; fallback source defined (§7.5).
- **PB cancel/reschedule** unverified → adapter + `pending` queue.
- **Google Meet** needs DWD impersonation of a real Workspace user (§9.2).
- **Shared key** serves Drive + Calendar; rotation is your action; both modules need the env path (§8).
- **Buffer>0** overlap protection is engine-level only, not race-safe (§2.2).
- DST correctness hinges on tz-aware `zoneinfo` throughout.

---

## 13. Adversarial review — findings → resolutions

| Sev | Finding | Resolved in |
|-----|---------|-------------|
| blocker | Countdown reads `appointments` first → stale after ledger reschedule/cancel | §4.2/§4.3 update `appointments`+`booking_info`; §4.0 upgrades `/user/appointment` to ledger |
| blocker | `buffer_minutes` not enforceable by start-keyed unique index | §2.2 caveat (engine-level only; "impossible" scoped to buffer=0) |
| blocker | New reschedule/cancel = IDOR by `booking_id` | §4.0 JWT-ownership + admin bypass + signed email-link token |
| blocker | No way for patient to obtain `booking_id` | §4.0 upgraded `/user/appointment` returns it |
| blocker | Duplicate Step-1 advance + LeadConnector in `/book` and GHL webhook | §4.4 idempotent single-source advancement |
| blocker | Seed vs unique index ordering can abort mid-run | §7.5 index-first, dedup, `ordered=false`, escalate collisions |
| major | Reschedule partial-failure compensation undefined | §4.2 Google-first / new-before-delete / 503 + status defined |
| major | Admin update/delete-booking "upgrade" is a rewrite (no ledger linkage) | §5.2 lookup/create + legacy Mongo-only fallback + authority rule |
| major | Legacy/GHL booking cancel/reschedule fallback unspecified | §5.2 fallback branch |
| major | GHL cancel webhook + `cancelled_booking` automations omitted | §4.3 parity fire; §12 GHL coexistence |
| major | AppointmentCountdown hardcodes 60-min | §6.3 driven by `slot_end_utc`/`duration_minutes` |
| major | `duration` unit undefined (sec vs min) | §2.2 canonical `duration_minutes`; §4.1 response = minutes |
| major | Empty/zero active directors unspecified | §3.1 empty-state; §4.1 typed 409; §7.4 seed-first |
| major | Patient tz for reschedule/cancel emails not sourced | §3.5/§4.2/§4.3 render via `patient_timezone` + fallback |
| major | Double-submit idempotency dropped (re-roll defeats index) | §4.1 step 0 guard on (user/email, slot) |
| major | `google_drive.py` shares the committed key on a live path | §8 migrate it to the same env loader |
| major | Wrong claim: two Mongo clients → different prod DBs | §0 corrected (converge when `DB_NAME` set) |
| major | No cutover rollback/feature-flag | §2.3 `booking_engine` flag; §7 runbook |
| minor | `consultant_id:"auto"` framing inverted (validator permissive) | §4.1 reworded |
| minor | BookSessionResponse required str fields on PB-pending branch | §4.1 make Optional; `session_id`→`booking_id` fallback |
| minor | "atomic single-send" is net-new, not a port | §3.5 reworded as NEW |
| minor | `/health` 503 on passive PB | §5.1 redefined |
| minor | Seed fallback if no PB list endpoint | §7.5 alt source / freeze window |
| minor | `booking_id` namespace collision with legacy `appointments` | §2.2 distinct namespace note |
| minor | Index created in error-swallowing block | §2.2 dedicated fail-loud block + startup assertion |
| minor | Availability vs Settings split incoherent | §6.3 rules co-located under Availability; Settings = identity |
| minor | Cache env-var removal: confirm no external consumers | §8 grep deploy/monitors before removal |
| nit | Clarify reset=progress, refund=step 0, no password endpoints | §0 |
| nit | Line refs drift | Treated as approximate anchors (§ header note) |
```
