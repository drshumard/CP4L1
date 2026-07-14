# Cadence cutover runbook

The app runs **two first-class booking engines** behind one Settings toggle
(Admin → Scheduling → Settings → Booking engine):

- **Practice Better (legacy)** — availability polled from each active director's own PB
  schedule (their `pb_consultant_id` on the Directors page), sessions created in PB with
  telehealth/Zoom + PB's own confirmation email. Bookings are also recorded in the
  portal's ledger, so the admin table, dashboard, cancel, and reschedule work on them.
- **Portal (local)** — the portal owns availability (directors' weekly rules), creates
  Google Meet spaces (Host Management ON, auto-recording, director co-host), and sends
  branded emails.

Cutover AND rollback are that one toggle — everything else (frontend, journey, admin) is
identical in both modes. Decisions locked: **start-empty ledger** and **GHL stops sending
bookings**.

> ⚠️ Deploy behavior change vs old prod: legacy availability now comes from the ACTIVE
> DIRECTORS' PB consultant ids, not the `PRACTICE_BETTER_PRACTITIONER_IDS` env list.
> **Seed directors before (or immediately at) deploy** or patients see zero slots.

Sibling doc: `CADENCE_MIGRATION_PLAN.md` (architecture + phase detail).

---

## 1. Before deploy — environment

Backend env (`.env` on the server):

| Var | Why | Missing means |
|---|---|---|
| `MONGO_URL`, `DB_NAME`, `JWT_SECRET_KEY` | core | app won't run |
| `PRACTICE_BETTER_CLIENT_ID` / `_SECRET` / `_SERVICE_ID` | PB mirror | mirror fails |
| `RESEND_API_KEY` | booking/auth emails | no emails |
| `GOOGLE_CALENDAR_SUBJECT` | Workspace user that owns every event/Meet (recordings land in their Drive) | defaults to `drjason@drshumard.com` |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | SA key location | defaults to `backend/service_account.json` |
| `BUNNY_STORAGE_ZONE` / `_PASSWORD` / `_HOST`, `BUNNY_CDN_BASE_URL` | admin avatar upload | uploads fail (feature-level) |
| `PRACTICE_BETTER_TAG_IDS` | tags on new PB clients | clients created untagged |

Frontend **build-time** env: `REACT_APP_BACKEND_URL`, `REACT_APP_GOOGLE_MAPS_API_KEY`
(address autocomplete — and the key's HTTP-referrer allowlist must include the production
domain).

Infra: the backend needs a **writable disk** for `client_cache.db` (PB client cache; a
fresh box does a ~10.7k-client sync starting ~60s after boot).

Google side (already granted, verify still true): DWD scopes `calendar.events`,
`meetings.space.settings`, `meetings.space.created`; Meet REST API enabled; Developer
Preview active; Host Management ON in Workspace; subject has write access to every
director calendar.

## 2. Seed the real directors FIRST

```bash
venv/bin/python scripts/seed_directors.py --deactivate-others
```

Idempotent (keyed by email): Cora, Dr. Jake, Dr. Strang with calendars, PB consultant
ids, and weekly hours. Re-runs preserve time-off/overrides added in the admin UI.
**Required before patient traffic** — in legacy mode the directors' PB ids ARE the
availability source.

## 3. Deploy (engine stays on `pb` — legacy keeps working)

Deploy backend + frontend. Watch backend boot logs for index creation — the
double-booking guard (`uniq_confirmed_director_slot`) builds on startup and the app
fails loud if it can't. Sanity-check `/book` shows times (legacy PB availability via
the directors) and make one legacy test booking end-to-end (appears in the admin
bookings table, PB Synced).

## 4. Preflight — the go/no-go gate

```bash
venv/bin/python scripts/preflight.py
```

Checks env, Mongo indexes, settings/sessions, directors, live availability, a **real
Google round-trip** (creates + deletes one test event; verifies Meet space, Host
Management ON, auto-recording ON, director co-host), PB auth, client cache.

**Any FAIL → stop, fix, re-run.** WARNs are judgment calls (each line says what
degrades). `--skip-google` exists for a side-effect-free rerun.

## 5. Flip

1. Turn **GHL off** as a booking source (stop sending bookings to the app).
2. Admin → Scheduling → Settings → Booking engine → **Portal (local)** → Save.

## 6. Verify with one real booking (~5 min)

Book a test patient via `/book` (or admin New booking), then check:

- Patient got the confirmation email with a working Meet link.
- Event on the right director's calendar with the native Meet chip.
- Meet space: director listed as co-host; recording auto-starts on join.
- Admin → Scheduling → Bookings row: status **Confirmed**, PB **Synced** (PB session
  under the right consultant, right time/duration — timezone + duration bugs are fixed
  and regression-checked by this).
- Patient's portal dashboard shows the session; journey advanced to step 2.

Cancel the test booking from the admin table when done.

## 7. Rollback

One toggle: Settings → Booking engine → **Practice Better (legacy)**. New bookings
instantly go through the old PB path again. Bookings made while local was live stay
valid (calendar events + PB mirrors already exist). Investigate, fix, re-run preflight,
flip again.

## 8. First-days monitoring

- Backend logs: `PB pending sweep` lines (auto-retry of transient PB failures every
  15 min — persistent failures repeat in the log), `Meet co-host ... failed`, `Event
  create ... failed`.
- Admin bookings table: filter PB sync = Pending/Failed (sweep should keep this empty).
- If a director reports no host controls on a call: their booking predates the Meet-API
  flow or their email is wrong on the Directors page.
