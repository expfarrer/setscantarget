# Site Security Review Scanner

A client-side security review tool built with Next.js, Playwright, Prisma, and SQLite. It crawls a target website using a headless browser and automatically detects common client-side security issues.

**For authorized testing only.** Use only on sites you own or have explicit written permission to test.

---

## What it detects

- Missing security response headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, etc.)
- **Enhanced auth/session cookie analysis** — identifies auth/session cookies by name (session, sid, jwt, next-auth, supabase, clerk, firebase, etc.), flags missing HttpOnly/Secure/SameSite with higher severity, detects long-lived session cookies and SameSite=None misuse
- Exposed source maps (.map files publicly accessible)
- Secrets and tokens in HTML, inline scripts, and JS bundles (API keys, JWTs, AWS keys, Bearer tokens, PEM private keys)
- **Hardcoded passwords** — assignments (`password: "..."`, `db_password = "..."`), ENV-style variables (`DB_PASSWORD=value`), and credential-bearing connection URIs (`postgres://`, `mysql://`, `mariadb://`, `mongodb://`, `redis://`, `amqps://`, `ftp://`, `sftp://`, `smtp://`)
- NEXT_PUBLIC_ environment variable leakage
- Framework/version leakage in HTML content
- Stack traces and verbose errors in the page or browser console
- Internal/localhost URLs in client-side code
- Suspicious admin/debug/internal endpoint references in JS
- localStorage/sessionStorage token exposure
- Wildcard CORS policies
- Sensitive paths in robots.txt
- **Passive common endpoint checks** (opt-in) — safe GET-only requests to a fixed allowlist of common API/admin/debug paths on the same origin; surfaces 200 responses with sensitive JSON data or accessible admin paths

---

## Tech stack

- **Next.js** (App Router, TypeScript)
- **Tailwind CSS**
- **Prisma + SQLite** (via better-sqlite3 adapter)
- **Playwright** (headless Chromium crawling)
- **Zod** (input validation)

---

## Setup

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
npm install
npx playwright install chromium
```

### Database setup

```bash
npx prisma migrate dev
```

This creates `prisma/dev.db`.

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build for production

```bash
npm run build
npm start
```

---

## Usage

1. Open the app in your browser.
2. Enter the target URL (e.g. `https://example.com`).
3. Configure scan modules and crawl settings.
4. Check the authorization confirmation checkbox.
5. Click **Start Scan**.
6. Watch real-time progress in the live log panel.
7. Review findings organized by severity (High / Medium / Low / Info).
8. Export the report as JSON, HTML, or Ingestion JSON.

---

## Exports

### JSON / HTML
Standard raw exports of scan data. Available from the results page once a scan is complete.

### Ingestion JSON
A structured report specifically formatted for consumption by a coding agent (e.g. Claude Code) or other downstream tooling.

**How to use:**
1. Complete a scan.
2. On the results page, click **Download Ingestion JSON**.
3. The file is named `scan-ingestion-<scanId>.json`.
4. Pass the file to your agent or tool for triage and remediation.

**Format overview:**
```json
{
  "version": "1.0",
  "reportType": "security_scan_ingestion",
  "target": { "targetUrl": "...", "pagesScanned": 12 },
  "summary": { "highCount": 2, "categoryCounts": { "missing_security_header": 4 } },
  "scanOptions": { ... },
  "findings": [ ... ],
  "pages": [ ... ],
  "requests": [ ... ],
  "handoff": {
    "intendedUse": "ingestion_by_coding_agent",
    "recommendedWorkflow": [ "triage findings", "prioritize by severity", "..." ],
    "futurePromptPreset": {
      "enabled": false,
      "notes": "Reserved for future prompt builder support"
    }
  }
}
```

Findings are sorted by severity → category → timestamp. Evidence snippets are truncated for readability. HTML snapshots and raw response bodies are excluded.

> **Planned:** A prompt preset builder (Part B) will allow attaching remediation instructions and agent presets directly to the ingestion report before download.

---

## Architecture

```
app/
  page.tsx                          — New scan form + recent scans list
  scan/[id]/page.tsx                — Results page (live-updating while running)
  api/scans/
    route.ts                        — POST (create scan), GET (list scans)
    [id]/route.ts                   — GET scan with findings/pages/requests/logs
    [id]/start/route.ts             — POST trigger scan (fire-and-forget)
    [id]/export/route.ts            — GET export as JSON or HTML
    [id]/export/ingestion-json/
      route.ts                      — GET structured ingestion JSON export

lib/
  db.ts                             — Prisma client singleton
  types.ts                          — Shared TypeScript types and scan defaults
  url.ts                            — URL normalization and scope helpers
  scanner/
    runner.ts                       — Main scan orchestrator
    logging.ts                      — Persists scan log entries in real time
  crawler/
    playwright.ts                   — Headless browser crawling + network capture
    extract.ts                      — HTML link/script/title extraction
    scope.ts                        — Crawl queue, deduplication, depth limits
  detectors/
    index.ts                        — Runs all detectors on page and bundle artifacts
    secrets.ts                      — API keys, JWTs, tokens, private keys
    passwords.ts                    — Hardcoded passwords, ENV vars, connection URIs
    headers.ts                      — Security header presence checks
    cookies.ts                      — Auth/session cookie analysis with enhanced severity
    storage.ts                      — localStorage/sessionStorage risk detection
    sourcemaps.ts                   — Source map reference and accessibility checks
    framework.ts                    — Framework leakage, stack traces, internal URLs
    endpoints.ts                    — Suspicious endpoints and robots.txt analysis
    passive-endpoints.ts            — Opt-in passive GET checks against fixed path allowlist
  exports/
    ingestion-json.ts               — Ingestion report schema, types, and serializer
```

---

## Passive Common Endpoint Checks

When enabled, the scanner performs safe GET-only requests against a small, fixed allowlist of paths on the same origin:

```
/api/users  /api/user  /api/admin  /api/auth/me  /api/me  /api/profile
/api/debug  /api/internal  /api/config  /api/settings  /admin  /debug
/internal  /dashboard  /health  /status  /.env  /config.json  /api.json
```

Rules:
- **Same origin only** — never checks external domains
- **GET only** — no form submissions or mutations
- **Fixed list** — no guessing, fuzzing, or recursive generation
- **Non-aggressive** — 401/403/404 responses are ignored
- Findings are generated only for 200 responses with sensitive JSON fields, accessible admin/debug paths, or exposed config files
- All passive findings are tagged `[Passive endpoint check]` in the evidence field and carry a purple "passive" badge in the UI
- The path list is shown transparently in the scan form before enabling

Intended for authorized self-review of your own projects only.

---

## Limitations

- Surface-level client-side review only — cannot detect server-side secrets never sent to the browser.
- Does not authenticate — sees only what an unauthenticated visitor sees.
- Password and secret detection uses heuristics and will produce some false positives.
- Absence of findings does not mean a site is secure.
- Results should be treated as preliminary, not a substitute for a full penetration test.
- One scan runs at a time; the fire-and-forget model is suitable for local/dev use only.
