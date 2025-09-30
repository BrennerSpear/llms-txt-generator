# Inngest Flow Spec for `llms.txt` Generator (v0)

This spec maps each pipeline step to an **Inngest function**: trigger, inputs, steps, retries/concurrency, and outputs (events + side effects). It also shows where to use webhooks, batching, throttling, and the `serve()` handler for Next.js.

> Key Inngest concepts referenced below: **steps** (`step.run()`), **functions** & triggers, **serving functions** via Next.js, **webhook sources**, **fan‑out via events**, **concurrency**, **rate limits & throttling**, and **batching**. See citations inline.

---

## 0) Serving & Infrastructure

- **Handler:** Expose all functions via Next.js at `/api/inngest` using `serve()` so Inngest can invoke them over HTTP. 
- **Step building blocks:** Each unit of work is a _step_ (eg. `step.run("fetch-html", ...)`) which retries independently. Steps have IDs and are memoized across versions. 

---

## Events (canonical)

```ts
// Producer-side shape (SDK types elided)
type Events =
  | { name: "domain/ingest.requested"; data: { domainId: string } }
  | { name: "domain/crawl.completed"; data: { jobId: string } }
  | { name: "domain/crawl.page"; data: { jobId: string; page: { markdown: string; metadata: Record<string, any> } } }
  | { name: "page/process.requested"; data: { jobId: string; url: string } }
  | { name: "page/processed"; data: { jobId: string; url: string } }
  | { name: "job/assemble.requested"; data: { jobId: string } }
  | { name: "job/finalize.requested"; data: { jobId: string } };
```

---

## F0 — **Schedule Recrawls (optional for v0)**

- **Trigger:** Cron (eg. hourly) sending `domain/ingest.requested` per active domain.  
- **Pattern:** Load active domains from DB, compute due set where `now() - last_finished_at >= check_interval_minutes`, then _fan‑out_ one event per due domain via `step.sendEvent()`; optional micro-sleeps/batching to smooth spikes. 
- **Controls:** Do not limit concurrency here; enforce parallelism in F1 using per‑domain and global concurrency keys.

**Inputs:** none (scheduled)  
**Outputs:** `domain/ingest.requested` events (N due domains)

---

## F1 — **Start Crawl**

- **Trigger:** `domain/ingest.requested` (or REST → send event).  
- **Steps:**  
  1. `step.run("create-job", ...)` — insert `jobs` row, set status `processing`.  
  2. `step.run("firecrawl-start", ...)` — call Firecrawl; persist `firecrawl_job_id`.  
- **Webhook ingest:** Configure a **webhook source** so Firecrawl can POST results to Inngest; attach the resulting events to F2 (page) and F4 (completed). 
- **Controls:** Concurrency keys to bound crawls:  
  - Per‑domain: `{ limit: 1, key: "firecrawl:domain:{event.data.domainId}" }` (one active crawl per domain)  
  - Global: `{ limit: 5, key: "firecrawl:global" }` (tune)  
  Add **throttling** if provider quotas require it.

**Inputs:** `{ domainId }`  
**Outputs:** side effects (DB `jobs` row), external call (Firecrawl).

---

## F2 — **Handle Crawl Page (Webhook)**

- **Trigger:** Webhook event → `domain/crawl.page` (Firecrawl `type: "crawl.page"`).
- **Steps:**  
  1. `step.run("store-page", ...)` — persist page payload (markdown + metadata) and attach to `jobId` by writing the raw Firecrawl markdown to Blob as `firecrawl_raw.md` and storing a pointer.
  2. `step.sendEvent()` — emit `page/process.requested` with `{ jobId, url }` (derive `url` from payload metadata) and include a pointer to the stored markdown so the downstream processor can skip refetch.
- **Ops note:** Page-level webhooks may arrive many times; ensure idempotency per `jobId + url + scrapeId`.

**Inputs:** `{ jobId, page: { markdown, metadata } }`  
**Outputs:** `page/process.requested` events (1 per page)

---

## F3 — **Process Single URL**

- **Trigger:** `page/process.requested`  
- **Controls:**  
  - **Concurrency**: key `openrouter:domain:{domainId}` (per‑tenant) and a global key to cap simultaneous summaries. 
  - **Throttling**: smooth OpenRouter calls (FIFO enqueue when over limit). 

-- **Steps (each a retriable `step.run`)**: 
  1. `"ingest-content"` — if webhook-provided markdown is available, load `firecrawl_raw.md` from Blob; otherwise fetch HTML snapshot (Firecrawl). Clean content to remove nav/header/footer and produce `html.md` (cleaned snapshot). Write snapshots to Blob; compute fingerprint over cleaned content.  
  2. `"compare"` — load previous fingerprint; compute similarity; mark `changed_enough`.  
  3. `"upsert-version"` — write `page_versions` row with metadata & blob pointers (`raw_md_blob_url` for `firecrawl_raw.md`; `html_md_blob_url` for `html.md`).  
  4. `"mark-page-done"` — update per‑page status/metrics and decrement the job's pending count; emit `page/processed`.

**Inputs:** `{ jobId, url }`  
**Outputs:** side effects (Blob, DB rows).

---

## F4 — **Handle Crawl Completed (Webhook)**

- **Trigger:** Webhook event → `domain/crawl.completed` (Firecrawl `type: "crawl.completed"`).
- **Steps:**  
  1. `step.run("mark-stream-closed", ...)` — mark job as no longer receiving pages (e.g., `stream_closed = true`).  
  2. `step.run("maybe-assemble", ...)` — if `pending_pages == 0`, emit `job/assemble.requested`; otherwise no-op and let `page/processed` events drive assembly once the counter reaches zero.

**Inputs:** `{ jobId }`  
**Outputs:** optionally `job/assemble.requested`

---

## F5 — **Assemble Artifacts**

- **Trigger:** `job/assemble.requested` when the stream is closed and `pending_pages == 0`.  
- **Coordinator:** Maintain a counter per job incremented on F2 and decremented on F3. Emit `job/assemble.requested` either in F4 (if zero) or from a lightweight watcher reacting to `page/processed` that detects readiness.
- **Steps:**  
  1. `"collect"` — query latest accepted `page_versions` for `jobId`.  
  2. `"compose"` — build `llms.txt` & `llms-full.txt` (generate domain-level summaries only).  
  3. `"write-artifacts"` — upload to Blob; create `artifacts` rows.

**Inputs:** `{ jobId }`  
**Outputs:** side effects (Blob artifacts, DB rows), then `job/finalize.requested` (next).

---

## F6 — **Finalize Job**

- **Trigger:** `job/finalize.requested`  
- **Steps:**  
  1. `"stats"` — compute counts (changed, skipped, summarized).  
  2. `"mark-finished"` — set job `finished_at` + `status`.  
  3. `"notify"` — send email (Resend). Optionally react to Resend webhooks for delivery analytics. 

**Inputs:** `{ jobId }`  
**Outputs:** side effects (DB), notification send, optional analytics events.

---

## Error Handling & Idempotency

- Use step‑level retries; prefer `NonRetriableError` to stop hopeless cases (eg. 404 page). 
- Webhook handlers are idempotent (dedupe by `jobId` + provider IDs).  
- Because steps are memoized per ID, successful steps aren’t re‑run on retries or deploys. 

---

## Fan‑Out / Parallelism Patterns

- Emit one `page/process.requested` per URL so each page has **independent retries** and parallelism; this is the canonical Inngest _fan‑out_ pattern. 
- If multiple downstream actions share the same trigger (eg. summarization + indexing), define multiple functions listening to the same event. 

---

## Concurrency, Throttling, Rate Limits

- **Concurrency:** cap simultaneous runs; prefer per‑tenant keys for fairness. 
- **Throttling:** queue excess starts FIFO (good for 3rd‑party API quotas). 
- **Rate limiting:** skip starts over a window (good for noisy webhooks). 

---

## Minimal Next.js Wiring

- Add an `/api/inngest` route and pass your function list to `serve()`; Inngest will discover configuration & invoke runs via HTTP. 

---

## Glossary

- **Function** — Unit of execution, triggered by event/cron/webhook.  
- **Step** — Retriable segment (`step.run`, `step.sendEvent`) with its own state. 
- **Webhook Source** — Managed endpoint in Inngest to receive third‑party events. 
- **Fan‑out** — Send N events to process items in parallel with independent retries. 
- **Concurrency / Throttling / Rate limit** — Controls to bound & smooth execution. 
- **Batching** — group many events before invoking a function (size/timeout/key). 
