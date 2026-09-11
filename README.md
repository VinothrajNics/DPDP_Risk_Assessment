# DPDP Risk & Compliance Assessment

A standalone, public DPDP Risk & Compliance Assessment application.

Participants scan a single QR code, enter their details, answer the original **50-question
DPDP-001 … DPDP-050** risk questionnaire, and receive a live score, rating and a printable
A4 gap report. Organisers monitor every session from an authenticated admin dashboard.

This project is **completely independent** of the legacy DPDP tool. It owns its own
questionnaire definitions, database schema, API and UI — nothing is imported from the old
project at runtime.

---

## Architecture

```
                         PARTICIPANT
                              │  Scan QR
                              ▼
                     Vercel  /assessment
                              │
                              ▼
                   Participant details → unique session
                              │
                              ▼
                    Next.js risk assessment UI
                              │  fetch (typed JSON)
                              ▼
                       Hono API (mounted in a
                    Next.js Route Handler on Vercel)
                              │
                              ▼
                     Cloudflare D1 (SQLite)
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
           risk_responses            assessments
                  └───────────┬───────────┘
                              ▼
                    Server-side final scoring
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
                 Report              Admin
             (print / PDF)      (dashboard + results)
```

- **Frontend:** Next.js (App Router) + React + TypeScript
- **Backend:** Hono, exposed through `src/app/api/[[...route]]/route.ts` using `hono/vercel`
  so it runs as a Vercel serverless function (no long-running server, no local filesystem
  assumptions).
- **Database:** Cloudflare D1 in production; Drizzle ORM (`sqlite-proxy`) with a driver that
  targets D1 over the HTTP REST API. Local development uses Node's built-in `node:sqlite`
  against a local file with the **same SQL schema**.
- **PDF:** Not stored server-side. The report is generated from database data and printed /
  saved as PDF by the browser (`window.print()` + `@media print` A4 portrait CSS).

---

## Project structure

```
dpdp-risk-assessment/
├─ database/
│  ├─ schema/index.ts         # Drizzle schema (canonical)
│  ├─ migrations/0000_init.sql# D1-compatible SQL migrations
│  └─ local.db                # local SQLite database (gitignored, generated)
├─ scripts/
│  ├─ migrate.mjs             # migration runner (local + --remote D1)
│  └─ reset.mjs               # delete + recreate the local database
├─ src/
│  ├─ app/
│  │  ├─ api/[[...route]]/route.ts   # Hono mounted as a Vercel route handler
│  │  ├─ assessment/…                # public participant flow + report
│  │  ├─ admin/…                     # protected dashboard + detail + report
│  │  ├─ qr/page.tsx                 # QR code page
│  │  ├─ layout.tsx, page.tsx, globals.css
│  ├─ components/                    # UI components (assessment, admin, report)
│  └─ lib/
│     ├─ riskQuestions.ts            # 50 questions, domains, ratings, scoring
│     ├─ db/{driver,index}.ts        # D1 REST + local node:sqlite driver
│     ├─ server/{api,auth,store}.ts  # Hono routes, auth, data access
│     └─ api-client.ts, types.ts, format.ts
├─ drizzle.config.ts
├─ .env.example
└─ README.md
```

---

## 1. Local setup

### Prerequisites

- Node.js **22.5+** (Node 24 recommended — local dev uses the built-in `node:sqlite`).
- npm.

> No native modules are compiled. There is no `better-sqlite3` dependency.

### Install

```powershell
cd "C:\Users\DELL\Desktop\dpdp-risk-assessment"
npm install
```

### Environment variables

Copy the example file and edit values:

```powershell
Copy-Item .env.example .env.local
```

`.env.local` for local development:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_PASSWORD=Nics@bcd2026DPDP_Assessment
ADMIN_SESSION_SECRET=local-dev-session-secret-change-me
LOCAL_DB_PATH=database/local.db
# Leave the Cloudflare D1 variables blank locally:
# CLOUDFLARE_ACCOUNT_ID=
# CLOUDFLARE_D1_DATABASE_ID=
# CLOUDFLARE_API_TOKEN=
```

When the three `CLOUDFLARE_*` variables are absent, the app automatically uses the local
`node:sqlite` file. When they are present, the app automatically uses Cloudflare D1.

### Create the local database + run migrations

```powershell
npm run db:migrate:local
```

This creates `database/local.db` with the `assessments`, `risk_responses` and
`_migrations` tables.

To start from a clean database at any time:

```powershell
npm run db:reset:local
```

### Start the development server

```powershell
npm run dev
```

Open <http://localhost:3000>.

### Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js + Hono locally |
| `npm run build` | Production build (same build Vercel runs) |
| `npm start` | Run the production build locally |
| `npm run typecheck` | TypeScript check |
| `npm run db:migrate:local` | Apply migrations to the local database |
| `npm run db:reset:local` | Delete + recreate the local database |
| `npm run db:migrate:d1` | Apply migrations to Cloudflare D1 (`--remote`) |
| `npm run db:verify:d1` | Read-only check of the Cloudflare D1 schema and row counts |
| `npm run verify` | Assert the exact original mark calculation (numbers, totals, N/A, ratings) |

---

## 2. Test the full workflow locally

1. **Participant A** — open <http://localhost:3000/assessment>, enter
   `ABC Technologies / Rahul Kumar / IT Manager`, answer questions, refresh the page
   (answers are recovered), then **Submit Assessment**. Open **View Report** and try
   **Print / Save as PDF**.
2. **Participant B** — repeat with `XYZ Solutions / Priya Kumar / Compliance Officer`.
   Confirm the two sessions are completely separate.
3. **Incomplete** — start a third assessment, answer ~20 questions and leave it.
4. **Admin** — open <http://localhost:3000/admin>, sign in with `ADMIN_PASSWORD`.
   Verify the **Total / Submitted / In Progress / Incomplete** cards, search, filters,
   the individual assessment view with every answer, and the admin report.
5. **Security** — call `GET /api/assessment/<other-id>` without the capability token
   (or with another participant's token); it is rejected with `403`.

The `/qr` page renders a QR code pointing to `${NEXT_PUBLIC_APP_URL}/assessment`.

---

## 3. Cloudflare D1 (production database)

### Create the database

```powershell
npx wrangler login
npx wrangler d1 create dpdp-risk-assessment
```

Wrangler prints a `database_id` — copy it.

### Create an API token

In the Cloudflare dashboard create an API token with **D1 → Edit** permission for the
account that owns the database. Note the **Account ID** (Workers/D1 overview page).

### Configure the migration environment

```powershell
$env:CLOUDFLARE_ACCOUNT_ID="<account-id>"
$env:CLOUDFLARE_D1_DATABASE_ID="<database-id>"
$env:CLOUDFLARE_API_TOKEN="<api-token>"
```

### Run migrations against D1

```powershell
npm run db:migrate:d1
```

The runner reads `database/migrations/*.sql`, tracks applied files in `_migrations`, and
executes them through the D1 HTTP REST API.

<details>
<summary>Alternative: apply migrations with Wrangler</summary>

```powershell
npx wrangler d1 execute dpdp-risk-assessment --remote --file=./database/migrations/0000_init.sql
```

</details>

### Verify the database

```powershell
npx wrangler d1 execute dpdp-risk-assessment --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
npx wrangler d1 execute dpdp-risk-assessment --remote --command "SELECT COUNT(*) AS assessments FROM assessments;"
```

> The application never connects to the legacy DPDP database. It uses its own D1 database
> or its own local SQLite file only.

---

## 4. Deploy to Vercel

1. Push this project to a Git repository (GitHub/GitLab/Bitbucket).
2. In Vercel, **Add New → Project → Import** the repository.
3. Framework preset: **Next.js** (build command `next build`, output handled automatically).
4. Add the **Environment Variables** (Production, and Preview if desired):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_APP_URL` | `https://<your-project>.vercel.app` |
   | `ADMIN_PASSWORD` | a strong password |
   | `ADMIN_SESSION_SECRET` | a long random string |
   | `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare account ID |
   | `CLOUDFLARE_D1_DATABASE_ID` | the D1 database id |
   | `CLOUDFLARE_API_TOKEN` | D1 **Edit** API token |

   Do **not** set `LOCAL_DB_PATH` in production.

5. **Deploy.**
6. Because the final URL is only known after the first deploy, set `NEXT_PUBLIC_APP_URL` to
   that URL and **Redeploy** so the QR code and links use it. (If you add a custom domain,
   update the variable and redeploy.)
7. Verify the API:

   ```powershell
   Invoke-RestMethod https://<your-project>.vercel.app/api/health
   ```

   Then open `https://<your-project>.vercel.app/assessment`, `…/qr`, and `…/admin`.

`NEXT_PUBLIC_APP_URL` is inlined at build time, so any change requires a redeploy.

### Production URL

The production URL is shown in the Vercel project dashboard (Domains / Deployments) after
the first deployment, e.g. `https://dpdp-risk-assessment.vercel.app`. Use it as
`NEXT_PUBLIC_APP_URL`.

### QR code behaviour

`/qr` reads `NEXT_PUBLIC_APP_URL` and renders a QR code for
`${NEXT_PUBLIC_APP_URL}/assessment`. If the variable is missing it falls back to the current
browser origin (useful locally). No source-code edits are needed after deployment — just set
the environment variable.

---

## 5. Risk assessment fidelity

The questionnaire and scoring are a faithful re-implementation of the original feature and
live in `src/lib/riskQuestions.ts`:

- 50 questions `DPDP-001 … DPDP-050` with the exact wording, domains, weights and N/A flags.
- 21 domains including Applicability, Governance, Data Inventory, Data Flow, Purpose, Notice,
  Consent, Rights, Grievance, Accuracy, Retention, Deletion, Security, Breach, Third Party,
  Cross-Border, Policies, Training, Privacy by Design, Monitoring, Evidence.
- Answer choices are shown as **`3 – Strong / 2 – Partial / 1 – Weak / 0 – None / N/A`** and
  stored using the original values `3 / 2 / 1 / 0 / N/A`.
- Auto-save is debounced by **400 ms** on every answer change and persists the full answer
  set, so a refresh recovers all answers.

### Exact mark calculation (identical to the original)

This is the exact algorithm from the original `riskQuestions.ts` and is implemented verbatim
in `src/lib/riskQuestions.ts`:

```
answerValue:
  'N/A' | undefined | ''  -> null (not scored)
  otherwise               -> Number(answer)   // '3'->3, '2'->2, '1'->1, '0'->0

per question:
  value    = answerValue(answer)
  assigned = value === null ? 0 : weight * value      // only if not N/A
  maximum  = weight * 3

per response:
  if N/A            -> excluded completely: adds nothing to assigned AND nothing to total
  if unanswered     -> adds 0 to assigned, but STILL adds (weight * 3) to total
  if answered       -> adds (weight * value) to assigned and (weight * 3) to total

domain percentage  = total > 0 ? Math.round(assigned / total * 100) : null
overall assigned   = sum of all domain assigned
overall total      = sum of all domain total
overall percentage = total > 0 ? Math.round(assigned / total * 100) : null

rating (evaluated top-down, first band with pct >= min):
  80-100 Strong | 60-79 Moderate | 40-59 Weak | 20-39 Poor | 0-19 Critical
```

Key reference numbers for the 50 questions:

- Sum of all weights = **131**; sum of all `weight × 3` = **393**.
- All `Strong` = **393 / 393 = 100%**.
- All `Partial` = **262 / 393 = 67%**; all `Weak` = **131 / 393 = 33%**; all `None` or all
  unanswered = **0 / 393 = 0%**.
- The 6 N/A-capable questions (`DPDP-001, 020, 021, 022, 023, 045`) carry **48** total points;
  marking all of them N/A removes those 48 points from the denominator.
- `DPDP-008` has weight **0**, so it contributes 0 points and never affects the percentage.
- A worked scenario (`DPDP-003/004/008/014/046` = Partial, the 6 N/A questions = N/A, all
  others Strong) scores **333 / 345 = 97%**.

Run `npm run verify:scoring` to assert all of the above. The comparison also holds against
the legacy implementation across every rating boundary and thousands of randomized answer
sets.

### Refresh recovery & secure resume

- **Refresh safety.** Every answer change is written to a local browser draft immediately
  and saved to the server on a 400 ms debounce. On refresh/hide a `pagehide` flush pushes any
  pending save, and on load the app restores the local draft (pushing it to the server if it
  is ahead of the database). Answers are therefore never lost by refreshing the page.
- **Capability token.** Resuming is authorized only by the assessment's `session_id`, a
  256-bit random token. The token is held in the participant's browser (`localStorage`) and
  never returned by an identity-based API. A participant can copy a private **resume link**
  (`/assessment/<id>?t=<token>`) shown on the assessment page to continue on another device.
- **Re-entering the same details (same browser).** If the browser still holds the session
  token, entering the same **Company + Person + Designation** shows an in-progress
  *"Continue Assessment"* popup, or an *"Assessment Already Submitted"* popup that opens the
  completed result page.
- **Re-entering the same details (different browser).** The server performs a
  non-authenticating existence check that returns only `none | in_progress | submitted`
  — never an id or token. The participant is told the session exists and must open it on the
  original device or via their resume link, or may start a new session.
- Matching is case-insensitive and trims whitespace. Two different people (different names)
  always receive separate sessions.



---

## 6. API reference

Participant requests carry the capability token in the `x-assessment-token` header
(the assessment's `session_id`, a 256-bit random value). Admin requests use the signed
HTTP-only cookie set by `/api/admin/login`.

| Method | Route | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/health` | public | health probe — reports `backend` (`d1-rest` or `local-sqlite`) |
| `POST` | `/api/assessment/start` | public | creates a unique assessment + session |
| `POST` | `/api/assessment/lookup` | public | existence check only, returns `status` (never an id/token) |
| `GET` | `/api/assessment/:id` | token | participant metadata |
| `GET` | `/api/assessment/:id/responses` | token | saved answers |
| `PUT` | `/api/assessment/:id/responses` | token | upsert only changed answers (auto-save) |
| `POST` | `/api/assessment/:id/submit` | token | server-side scoring + `SUBMITTED` |
| `GET` | `/api/assessment/:id/report` | token | report payload |
| `POST` | `/api/admin/login` | public | sets admin session cookie |
| `POST` | `/api/admin/logout` | admin | clears cookie |
| `GET` | `/api/admin/session` | public | auth status |
| `GET` | `/api/admin/assessments` | admin | list + counts, `?q=` and `?status=` |
| `GET` | `/api/admin/assessments/:id` | admin | detail + responses |
| `GET` | `/api/admin/assessments/:id/responses` | admin | raw responses |
| `GET` | `/api/admin/assessments/:id/report` | admin | report payload |

All request bodies are validated with Zod; all responses are typed and JSON.

### Authorization

A participant can read/write **only** the assessment whose `session_id` matches their
capability token. `GET /api/assessment/<other-id>` returns `403`. The admin can access all
assessments. Statuses are `IN_PROGRESS` and `SUBMITTED`. Generating a report or printing a
PDF does **not** change the status — only an explicit submit does.

### Admin dashboard categories

- **Submitted** — `status = SUBMITTED`
- **In Progress** — `IN_PROGRESS` with at least one answer saved
- **Incomplete** — session started, no answers saved yet
- **Total** — all sessions

---

## 7. Security

- **No identity-based token recovery.** `/api/assessment/lookup` returns only
  `none | in_progress | submitted`; it never returns an assessment id, session token or
  participant data. Resume is authorized only by the 256-bit capability token the
  participant's browser holds (or a private resume link).
- **Server-side secrets only.** Cloudflare credentials and `ADMIN_PASSWORD` /
  `ADMIN_SESSION_SECRET` are read from server-side environment variables and are never
  prefixed with `NEXT_PUBLIC_`.
- **No hardcoded credentials.** Admin auth has no default password; if `ADMIN_PASSWORD` or
  `ADMIN_SESSION_SECRET` is missing, admin login is disabled (`503`) rather than falling back
  to a known secret.
- **Admin cookie** is `HttpOnly`, `SameSite=Strict`, and `Secure` on HTTPS/Vercel.
- **Best-effort rate limiting** on `/api/admin/login` (10 attempts / 5 min per IP) and
  `/api/assessment/lookup` (60 / min per IP). Vercel instances are ephemeral, so this is
  best-effort; for stronger protection use Cloudflare in front of Vercel.
- **Security headers** (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
  `Permissions-Policy`) set in `next.config.mjs`; `X-Powered-By` disabled.
- **Production database guard.** If the D1 variables are missing on Vercel, the app fails with
  a clear configuration error instead of silently using local SQLite.
- **Parameterized SQL** through Drizzle; React escapes output (no `dangerouslySetInnerHTML`).
- **Minimal D1 writes** (diff-based upsert) reduce load and race exposure.

---

## 8. Notes

- No mock or hardcoded data: every screen reads from the database.
- No `localhost` is hard-coded in production logic; all public links/QR codes use
  `NEXT_PUBLIC_APP_URL`.
- No filesystem persistence is assumed in production — the only local file is the
  development SQLite database.
- Cloudflare R2 is intentionally **not** used; reports are generated from data and printed
  in the browser.
