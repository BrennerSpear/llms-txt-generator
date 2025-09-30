# llms.txt Generator & Updater (v0)

## Overview
We are building a system that automatically **generates and maintains `llms.txt` files** for websites.  
The product:
- Crawls and extracts website content.
- Detects when pages have changed.
- Summarizes updated pages via LLM.
- Produces and serves fresh `llms.txt` (and `llms-full.txt`) artifacts.
- Tracks job state and notifies on completion.
.
This ensures `llms.txt` is always up to date, accurate, and optimized for discovery by LLMs.

---

## v0 Architecture Decisions

### Core Infra
- **Platform:** Vercel (Next.js app with PageRouter for UI/API).
- **Orchestration:** Inngest (durable workflows, cron scheduling, fan-out, webhook handling, retries).
- **Storage:**
  - **Supabase Storage** → raw HTML, summaries, and `llms.txt`, `llms-full.txt`, and `.html.md` artifacts.
  - **Supabase Postgres** → metadata (domains, pages, jobs, change fingerprints, artifact pointers).
- **Crawling:** Firecrawl API (crawl site, structured output, webhooks).
- **Summarization:** OpenRouter API (multi-model access; throttle/parallelize via Inngest concurrency), and optionally, using firecrawl's llms.txt generator endpoint in parallel, storing that to the domain's table as it's own blob url (firecrawl_llms_txt_url or similar)
- **Notification:** Email service (e.g., Resend).

---

## High-Level Flows

### New Domain
1. Store domain info + create job record (status = `processing`).
2. Kick off Firecrawl crawl; store Firecrawl job ID.
3. Wait for Firecrawl webhook (crawl complete).
4. For each URL (fan-out):
   - Fetch HTML from Firecrawl.
   - Save HTML to Supabase Storage.
   - Save metadata to Supabase.
   - Clean + summarize content via OpenRouter.
5. Assemble `llms.txt` + `llms-full.txt`; store in Supabase Storage.
6. Update metadata with artifact links.
7. Update job status = `finished`.
8. Notify via email.

### Update Domain
1. Create new job/version (status = `processing`).
2. Kick off Firecrawl crawl; store Firecrawl job ID.
3. Wait for Firecrawl webhook.
4. For each URL (fan-out):
   - Fetch HTML from Firecrawl.
   - Compare to previous version.
     - If **different enough**: store new HTML + metadata + new summary.
     - If **not different enough**: mark similarity score as “low – skipped.”
5. Assemble `llms.txt` artifacts.
6. Update metadata + job status.
7. Notify via email.

---

## Why These Choices?

- **Vercel Next.js** → Fastest path for API + UI, good developer velocity.
- **Inngest** → Clean orchestration for multi-step jobs, durable waits for Firecrawl webhooks, built-in retries, and concurrency control (esp. for OpenRouter throttling).
- **Firecrawl** → Removes need to build crawler; handles JS rendering, anti-bot, structured output.
- **OpenRouter** → Easy way to test multiple LLMs; fallback and routing across providers.
- **Supabase Postgres** → Central metadata/state store with relational queries.
- **Supabase Storage** → Integrated storage with PostgreSQL, single platform for both data and files.
- **Notifications** → Simple “job complete” email (using resend).

---

## Next Steps for Spec

The technical spec should include:
- **Table schemas** (domains, jobs, pages, page_versions, artifacts, tasks, eval_runs).
- **API boundaries** between:
  - Next.js API routes (UI ↔ orchestration).
  - Inngest workflows ↔ Supabase (Database + Storage).
  - Firecrawl ↔ Inngest (webhooks).
  - OpenRouter summarization step.
- **Concurrency controls** (per-domain + global limits for OpenRouter).
- **Versioning & diffing strategy** for page updates.
- **Error handling/retries** policy per step.
- **Notification pipeline** (success/failure).

please make sure to think to think through the table schemas given the fact that we will do recurring jobs on the same url and sometimes they will be different enough to re-run a crawl and/or summarization, and sometimes the data will be the same, so we wont

we want some things configurable per domain: how often we re-check the site, which openRouter model to use, any others that make sense
the prompt(s) we use should be easily updateable without pushing code along with anything else we might want to "tune"

---


## Out of Scope
- Evaluation metrics for `llms.txt` quality.
- Prompt profiles per site type.
- Advanced semantic diffing (embeddings).
- Self-hosted crawler (aiohttp/BS4) for cost control.