# Site Security Review Scanner

A client-side security review tool built with Next.js 16, Playwright, Prisma, and SQLite. It crawls a target website using a headless browser and automatically detects common client-side security issues.

**For authorized testing only.** Use only on sites you own or have explicit written permission to test.

---

## What it detects

- Missing security response headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, etc.)
- Insecure cookies (missing HttpOnly, Secure, SameSite flags)
- Exposed source maps (.map files publicly accessible)
- Secrets and tokens in HTML, inline scripts, and JS bundles (API keys, JWTs, AWS keys, etc.)
- NEXT_PUBLIC_ environment variable leakage
- Framework/version leakage in HTML content
- Stack traces and verbose errors in the page or browser console
- Internal/localhost URLs in client-side code
- Suspicious admin/debug/internal endpoint references in JS
- localStorage/sessionStorage token exposure
- Wildcard CORS policies
- Sensitive paths in robots.txt

---

## Tech stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS**
- **Prisma 7 + SQLite** (via better-sqlite3 adapter)
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

### Run development server

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
8. Export the report as JSON or HTML.

---

## Architecture

```
app/
  page.tsx               — New scan form + recent scans list
  scan/[id]/page.tsx     — Scan results page (live-updating while running)
  api/scans/
    route.ts             — POST (create), GET (list)
    [id]/route.ts        — GET scan by ID with findings/pages/requests/logs
    [id]/start/route.ts  — POST trigger scan (fire-and-forget)
    [id]/export/route.ts — GET export as JSON or HTML

lib/
  db.ts                  — Prisma client singleton (better-sqlite3 adapter)
  types.ts               — Shared TypeScript types and defaults
  url.ts                 — URL normalization and scope helpers
  scanner/
    runner.ts            — Main scan orchestrator
    logging.ts           — Writes scan logs to DB in real time
  crawler/
    playwright.ts        — Headless browser page crawling
    extract.ts           — HTML link/script extraction
    scope.ts             — Crawl scope (visited set, queue, depth/page limits)
  detectors/
    index.ts             — Runs all detectors on page artifacts
    secrets.ts           — API key, JWT, token pattern detection
    headers.ts           — Security header analysis
    cookies.ts           — Cookie flag checks
    storage.ts           — localStorage/sessionStorage risk detection
    sourcemaps.ts        — Source map reference and accessibility detection
    framework.ts         — Framework leakage, stack traces, internal URLs
    endpoints.ts         — Suspicious endpoints and robots.txt analysis
```

---

## Limitations

- Surface-level client-side review only — cannot detect server-side secrets never sent to the browser.
- Does not authenticate — sees only what an unauthenticated visitor sees.
- Absence of findings does not mean a site is secure.
- Results should be treated as preliminary, not a full penetration test.
- The fire-and-forget scan model works for local/dev use but is not production-grade for multi-user concurrent scan workloads.
