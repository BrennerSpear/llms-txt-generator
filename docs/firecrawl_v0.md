## Firecrawl Integration (v0)

### Goals
- Efficient recrawls leveraging Firecrawl’s built-in change detection and caching.
- Minimize redundant summarization work by gating on Firecrawl `changeTracking` results.
- Standardize crawl options: `proxy: 'auto'`, `maxAge` derived from domain config.
- Wire webhooks to Inngest functions; enable local development and signature verification.

References: [Change Tracking](https://docs.firecrawl.dev/features/change-tracking), [Faster Scraping](https://docs.firecrawl.dev/features/fast-scraping), [Webhook Events](https://docs.firecrawl.dev/webhooks/events), [Webhook Testing](https://docs.firecrawl.dev/webhooks/testing), future: [Map](https://docs.firecrawl.dev/features/map).

---

### Recrawl Strategy

We rely on Firecrawl’s `changeTracking` to decide whether to process a page:

- Request formats: include `'markdown'` (required for comparisons) and `'changeTracking'`.
- Modes: enable `git-diff` in v0 for a human-readable diff and structured diff JSON; `json` mode is optional and adds cost.
- Decision:
  - If `changeStatus === 'same'`: skip our summarization path; still record a `page_versions` row with `changed_enough = false` for audit.
  - If `changeStatus === 'changed'`: proceed with our content cleaning, fingerprinting, and summarization.
  - If `changeTracking` is missing (beta edge cases or lookup timeout), fall back to our fingerprint comparison to avoid missing updates.

Notes:
- `json` mode provides structured comparison of fields but costs extra credits; keep it off by default in v0, consider enabling per-domain for high‑value pages. See billing note in docs. [Change Tracking](https://docs.firecrawl.dev/features/change-tracking)
- Comparisons are done over Firecrawl’s markdown output; we must always include `'markdown'` alongside `'changeTracking'`. [Change Tracking](https://docs.firecrawl.dev/features/change-tracking)

---

### Crawl Options (per domain)

- Proxy selection: `proxy: 'auto'` for reliability and antibot resilience.
- Caching: set `maxAge` to align with domain `check_interval_minutes` so we benefit from cache without going stale.
  - Mapping: `maxAgeMs = check_interval_minutes * 60_000`.
  - If a domain is highly dynamic, allow `maxAge = 0` via config to force fresh. Defaults to Firecrawl’s 2‑day cache if omitted. [Faster Scraping](https://docs.firecrawl.dev/features/fast-scraping)
- Change tracking modes: enable `git-diff` in v0; optionally allow `tag` to partition histories by environment (e.g., `production`). [Change Tracking](https://docs.firecrawl.dev/features/change-tracking)

Example (Node/TS):

```ts
import { Firecrawl } from "firecrawl";

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY! });

export async function startDomainCrawl(domainUrl: string, checkIntervalMinutes: number, webhookUrl: string) {
  const maxAge = Math.max(0, checkIntervalMinutes * 60_000);

  const result = await firecrawl.crawl(domainUrl, {
    scrapeOptions: {
      formats: [
        "markdown",
        { type: "changeTracking", modes: ["git-diff"], tag: process.env.NODE_ENV ?? "production" }
      ],
      proxy: "auto",
      maxAge
    },
    webhook: {
      url: webhookUrl,
      events: ["crawl.page", "crawl.completed"]
    }
  });

  // Persist job ID to correlate webhook events without relying solely on crawl.completed
  // jobs.firecrawl_job_id = result.id
  return result;
}
```

---

### Webhooks and Event Routing

Event types we care about in v0:
- `crawl.page`: emitted as pages are scraped; contains `markdown` and metadata. This should drive fan‑out (`page/process.requested`).
- `crawl.completed`: indicates no more pages will arrive; when pending pages == 0, trigger artifact assembly.

API route (e.g., `/api/webhooks/firecrawl`) that:
- Validates the request signature.
- Parses event type and payload.
- For each `crawl.page`, writes the raw markdown to Blob and emits an Inngest event (see `F2` in `inngest_v0.md`).
- For `crawl.completed`, emits a lightweight event to close the stream and potentially trigger assembly (see `F4`).

Signature verification:
- Verify Firecrawl’s signature header (e.g., `X-Firecrawl-Signature`) using the shared secret.
- Reject invalid or missing signatures with 401.
See: [Webhook Events](https://docs.firecrawl.dev/webhooks/events), [Webhook Testing](https://docs.firecrawl.dev/webhooks/testing).

Example handler shape (Next.js API route):

```ts
// /pages/api/webhooks/firecrawl.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { inngest } from "@/lib/inngest";
import { verifyFirecrawlSignature } from "@/lib/firecrawl-signature";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  if (!verifyFirecrawlSignature(req)) return res.status(401).end();

  const event = req.body; // { type, data, ... }

  if (event.type === "crawl.page") {
    // Persist raw markdown to Blob and emit our internal event
    await inngest.send({ name: "domain/crawl.page", data: event });
  } else if (event.type === "crawl.completed") {
    await inngest.send({ name: "domain/crawl.completed", data: event });
  }

  res.json({ ok: true });
}
```

Idempotency:
- Dedupe `crawl.page` by `{ jobId, url, scrapeId }` if provided.
- Consider retries and out‑of‑order delivery; our Inngest steps are idempotent.

---

### Do we get a crawl ID when starting?

Yes—starting a crawl returns an immediate response with a unique crawl `id`. Persist this to `jobs.firecrawl_job_id` to correlate webhook payloads and for troubleshooting. This allows us not to depend solely on `crawl.completed` to learn the job ID. See: [Webhook Events](https://docs.firecrawl.dev/webhooks/events).

---

### Local Development

Expose your local Next.js server and use the tunnel URL as the webhook target during development.

Steps:
1. Run your local app (e.g., `localhost:3000`).
2. Start a Cloudflare Tunnel: `cloudflared tunnel --url localhost:3000`.
3. Use the provided `https://*.trycloudflare.com` URL as the `webhook.url` when calling `firecrawl.crawl(...)` in dev.
4. Set envs:
   - `FIRECRAWL_API_KEY`
   - `FIRECRAWL_WEBHOOK_SECRET`
   - `FIRECRAWL_WEBHOOK_URL` (dev URL from tunnel)

Testing & debugging guidance: [Webhook Testing](https://docs.firecrawl.dev/webhooks/testing).

---

### Operational Notes

- Default freshness: Firecrawl returns cached results if newer than `maxAge`; otherwise it scrapes fresh and updates cache. Tune per domain. [Faster Scraping](https://docs.firecrawl.dev/features/fast-scraping)
- `changeTracking` is compared against prior scrapes scoped by URL, team, `markdown` format, and optional `tag`. Ensure consistent inputs between runs. [Change Tracking](https://docs.firecrawl.dev/features/change-tracking)
- If needed, enable `json` mode with a schema to track structured fields (e.g., price) in a future iteration; it costs 5 credits/page. Keep disabled in v0. [Change Tracking](https://docs.firecrawl.dev/features/change-tracking)

---

### Out of Scope (Next Version)

- Use Firecrawl’s Map feature to let users select specific pages or groups to include in crawl and `llms.txt`. [Map](https://docs.firecrawl.dev/features/map)

---

### Alignment with Inngest Spec

- `F1` Start Crawl: we store `jobs.firecrawl_job_id` from the crawl start response.
- `F2` Handle Crawl Page: webhook → store raw markdown to Blob → emit `page/process.requested` with pointers.
- `F4` Handle Crawl Completed: mark stream closed; if pending == 0, trigger assembly.
- Downstream functions (`F3`, `F5`, `F6`) behave as defined in `inngest_v0.md`.


