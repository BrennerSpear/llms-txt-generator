# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands


### Database Management
```bash
pnpm db:push            # Push schema changes to database (development)
pnpm db:generate        # Generate new Prisma migration
pnpm db:migrate         # Apply migrations to production
pnpm db:studio          # Open Prisma Studio GUI
```

### Code Quality
```bash
pnpm precommit          # Run both typecheck and lint before commit
```

### Testing
```bash
pnpm tsx test/integration-tests/crawl-pipeline.test.ts    # Run crawl pipeline integration test
```

### Webhook Development
```bash
cloudflared tunnel --url localhost:3000  # Create public tunnel for webhook testing
```


## During Development
- read the relevant files in the docs/ folder
- supabase, inngest, cloudflared, and `pnpm dev` ALREADY RUNNING in separate terminals. do not start them yourself
- use the lsp-typescript mcp tool to check correct typing while you're writing code, so you only use valid types, and get types from packages instead of make them up, and only pull out valid keys from objects

## Architecture Overview

### Core Pipeline Flow
The system implements a 3-stage Inngest-powered crawling pipeline:

1. **F1 - startCrawl** (`src/lib/inngest/functions/startCrawl.ts`)
   - Triggered by `domain/ingest.requested` event
   - Validates domain is active and has no existing jobs
   - Creates job record and initiates Firecrawl/mock crawl
   - Concurrency: 10 global, 1 per-domain

2. **F2 - handleCrawlPage** (`src/lib/inngest/functions/handleCrawlPage.ts`)
   - Triggered by `domain/crawl.page` event from webhooks
   - Stores raw markdown to Supabase storage
   - Emits `page/process.requested` for downstream processing
   - Concurrency: 50 parallel, 100 pages/10s throttle

3. **F3 - processUrl** (`src/lib/inngest/functions/processUrl.ts`)
   - Triggered by `page/process.requested` event
   - Cleans content, generates fingerprints
   - Compares with previous versions (95% similarity threshold)
   - Creates version records and updates last known version

### Key Services & Integrations

**Inngest Event System** (`src/lib/inngest/client.ts`)
- Typed event system with 9 event types
- Helper functions: `sendEvent()` and `sendEvents()`
- All events defined in `Events` type

**Storage Architecture**
- **Supabase Storage**: Raw markdown and processed content
  - Buckets: `artifacts`, `page-content`
  - Path format: `jobs/{jobId}/{raw|processed}/{urlSlug}_{timestamp}.md`
- **PostgreSQL**: Metadata, versions, fingerprints via Prisma

**Mock Services** (Development)
- `mockFirecrawl`: Simulates Firecrawl API (`src/lib/mocks/firecrawl.ts`)
- `WebhookSimulator`: Generates test webhook events (`src/lib/mocks/webhook-simulator.ts`)
- Enabled via `USE_MOCK_SERVICES=true` or in development mode

### Database Schema

Key models (Prisma):
- **Domain**: Sites to crawl with intervals and settings
- **Job**: Crawl job tracking with status and stats
- **Page**: Unique pages per domain
- **PageVersion**: Historical versions with fingerprints and similarity scores
- **Artifact**: Generated outputs (llms.txt files)

### API Endpoints

- `POST /api/domains/crawl` - Trigger new crawl for domain
- `GET /api/jobs/[jobId]` - Get job status and page details
- `POST /api/webhooks/firecrawl` - Receive Firecrawl webhook events
- `/api/inngest` - Inngest function registration endpoint

## Configuration

### Environment Variables
Required variables are validated in `src/env.js`:
- **Database**: `DATABASE_URL`, `DIRECT_URL`
- **Supabase**: Service role key, URLs
- **Inngest**: Event key, signing key
- **Firecrawl**: API key, webhook secret, webhook URL
- **OpenRouter**: API key for LLM processing

### Development Setup
Use `.env` for local development. The system automatically uses mock services in development unless `USE_MOCK_SERVICES=false`.

### Code Style
- **Formatter**: Biome with 2-space indentation, 
- **Imports**: Auto-organized by Biome
- **TypeScript**: Strict mode with `noUncheckedIndexedAccess`
- **Path Alias**: `~/*` maps to `./src/*`
- **Rules**: don't use `any`, use template literals where possible, don't use .forEach,


## Important Patterns

### Change Detection
- Pages generate content fingerprints for comparison
- 95% similarity threshold determines if changes are significant
- Tracks `changedEnough` boolean and `similarityScore` for each version

### Error Handling
- `NonRetriableError` for permanent failures (inactive domains, missing records)
- Inngest retry configuration per function (typically 3 retries)
- Job status tracking: `processing`, `completed`, `failed`

### Testing Approach
- Integration tests simulate full pipeline with webhook events
- Mock services enable testing without external dependencies
- Test scenarios cover: happy path, change detection, error handling, concurrency