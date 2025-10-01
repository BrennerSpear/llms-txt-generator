# Implementation Plan v0 - Inngest Integration with Mocked Services

## Overview
This document outlines the step-by-step implementation plan for integrating Inngest into the llms-txt-generator application, with mocked Firecrawl and OpenRouter services for development and testing.

## Project Structure

```
llms-txt-generator/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── inngest/
│   │   │   │   └── route.ts              # Inngest serve endpoint
│   │   │   ├── webhooks/
│   │   │   │   └── firecrawl/
│   │   │   │       └── route.ts          # Firecrawl webhook handler
│   │   │   └── test/
│   │   │       ├── trigger/
│   │   │       │   └── route.ts          # Test trigger endpoint
│   │   │       ├── status/
│   │   │       │   └── [jobId]/
│   │   │       │       └── route.ts      # Job status endpoint
│   │   │       └── webhook/
│   │   │           └── route.ts          # Mock webhook simulator
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib/
│   │   ├── inngest/
│   │   │   ├── client.ts                 # Inngest client & event types
│   │   │   └── functions/
│   │   │       ├── startCrawl.ts         # F1
│   │   │       ├── handleCrawlPage.ts    # F2
│   │   │       ├── processUrl.ts         # F3
│   │   │       ├── handleCrawlCompleted.ts # F4
│   │   │       ├── assembleArtifacts.ts  # F5
│   │   │       └── finalizeJob.ts        # F6
│   │   ├── db/
│   │   │   ├── client.ts                 # Prisma client
│   │   │   ├── jobs.ts                   # Job CRUD operations
│   │   │   ├── domains.ts                # Domain management
│   │   │   ├── pages.ts                  # Page version operations
│   │   │   └── artifacts.ts              # Artifact storage
│   │   ├── storage/
│   │   │   └── client.ts                 # Supabase Storage wrapper
│   │   ├── mocks/
│   │   │   ├── firecrawl.ts             # Firecrawl mock service
│   │   │   ├── openrouter.ts            # OpenRouter mock service
│   │   │   ├── factory.ts               # Mock data generators
│   │   │   └── webhook-simulator.ts     # Webhook event simulator
│   │   ├── firecrawl/
│   │   │   ├── client.ts                # Real Firecrawl client
│   │   │   ├── signature.ts             # Webhook signature verification
│   │   │   └── types.ts                 # Firecrawl type definitions
│   │   ├── openrouter/
│   │   │   ├── client.ts                # OpenRouter client
│   │   │   └── types.ts                 # OpenRouter types
│   │   └── utils/
│   │       ├── fingerprint.ts           # Content fingerprinting
│   │       ├── markdown.ts              # Markdown processing
│   │       └── cleaning.ts              # Content cleaning
│   ├── env.js                           # Environment validation (T3)
│   └── types/
│       └── index.ts                      # Shared type definitions
├── .env.example
├── .env.local
├── docker-compose.yml                    # Local Postgres
└── package.json

```

## Prerequisites & Initial Setup

### Step 0: Install All Dependencies (✅ COMPLETED)
```bash
# Core application dependencies (ALREADY INSTALLED)
pnpm add inngest firecrawl @supabase/supabase-js @openrouter/ai-sdk-provider

# Database (Prisma is already in package.json from T3 setup)
# No additional installation needed

# Global tools for local development (INSTALL MANUALLY)
# These are NOT installed via pnpm install:

# 1. Cloudflare tunnel for webhook development
# Option A: macOS with Homebrew
brew install cloudflare/cloudflare/cloudflared

# Option B: NPM (all platforms)
npm install -g cloudflared

# Option C: Download binary from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation

# 2. Inngest CLI (run on-demand, no installation needed)
pnpm dlx inngest-cli@latest dev  # This will download and run when needed
```

**Note:** We installed the actual Firecrawl SDK (`firecrawl` package) to use its TypeScript types for mock data accuracy, ensuring our mocks match the expected API structure.

## Implementation Steps

### Step 1: Database Schema & Setup
**Goal:** Set up database models before any application logic

1. **Create Prisma schema** (`prisma/schema.prisma`)
   ```prisma
   model Domain {
     id                      String         @id @default(uuid())
     domain                  String         @unique
     check_interval_minutes  Int            @default(1440)
     openrouter_model        String         @default("openai/gpt-4o-mini")
     firecrawl_llms_txt_url  String?
     prompt_profile_id       String?
     prompt_profile          PromptProfile? @relation(fields: [prompt_profile_id], references: [id])
     is_active               Boolean        @default(true)
     created_at              DateTime       @default(now())
     updated_at              DateTime       @updatedAt
     jobs                    Job[]
     pages                   Page[]
   }

   model PromptProfile {
     id                String   @id @default(uuid())
     name              String
     summary_prompt    String   @db.Text
     llms_txt_header   String?  @db.Text
     assemble_template String?  @db.Text
     params            Json     @default("{}")
     version           Int      @default(1)
     created_at        DateTime @default(now())
     domains           Domain[]
   }

   model Job {
     id                String        @id @default(uuid())
     domain_id         String
     domain            Domain        @relation(fields: [domain_id], references: [id])
     type              JobType
     status            JobStatus     @default(PROCESSING)
     firecrawl_job_id  String?
     started_at        DateTime      @default(now())
     finished_at       DateTime?
     stats             Json          @default("{}")
     pages             Page[]
     page_versions     PageVersion[]
     artifacts         Artifact[]
   }

   model Page {
     id                      String        @id @default(uuid())
     job_id                  String
     job                     Job           @relation(fields: [job_id], references: [id], onDelete: Cascade)
     domain_id               String
     domain                  Domain        @relation(fields: [domain_id], references: [id])
     url                     String
     last_known_version_id   String?
     created_at              DateTime      @default(now())
     page_versions           PageVersion[]

     @@unique([domain_id, url])
   }

   model PageVersion {
     id                   String   @id @default(uuid())
     page_id              String
     page                 Page     @relation(fields: [page_id], references: [id], onDelete: Cascade)
     job_id               String
     job                  Job      @relation(fields: [job_id], references: [id], onDelete: Cascade)
     url                  String
     raw_md_blob_url      String?
     html_md_blob_url     String?
     content_fingerprint  String
     prev_fingerprint     String?
     similarity_score     Float?
     changed_enough       Boolean
     reason               String?
     created_at           DateTime @default(now())
   }

   model Artifact {
     id         String       @id @default(uuid())
     job_id     String
     job        Job          @relation(fields: [job_id], references: [id], onDelete: Cascade)
     kind       ArtifactKind
     version    Int          @default(1)
     blob_url   String
     created_at DateTime     @default(now())
   }

   enum JobType {
     initial
     update
   }

   enum JobStatus {
     processing
     finished
     failed
   }

   enum ArtifactKind {
     raw_md
     html_md
     llms_txt
     llms_full_txt
   }
   ```

2. **Initialize database**
   ```bash
   pnpm prisma init
   pnpm prisma db push  # For development
   ```

3. **Create database service layer** (`src/lib/db/`)
   - Implement CRUD operations for each model
   - Add transaction support for atomic operations

4. **Test:** Verify database connection and basic CRUD operations

### Step 2: Set Up Supabase Storage
**Goal:** Configure Supabase Storage for storing raw content and artifacts

1. **Create Storage Buckets**
   ```bash
   # Using Supabase CLI or Dashboard, create buckets for different content types
   supabase storage create artifacts
   supabase storage create page-content
   ```

   Or programmatically in setup script:
   ```typescript
   // Create buckets if they don't exist
   await supabase.storage.createBucket('artifacts', { public: false })
   await supabase.storage.createBucket('page-content', { public: false })
   ```

2. **Create Storage client wrapper** (`src/lib/storage/client.ts`)
   ```typescript
   import { createClient } from '@supabase/supabase-js'

   const supabase = createClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL!,
     process.env.SUPABASE_SERVICE_ROLE_KEY!
   )

   export const storage = {
     async upload(bucket: string, path: string, content: string | Buffer) {
       const { data, error } = await supabase.storage
         .from(bucket)
         .upload(path, content, {
           contentType: 'text/plain',
           upsert: true
         })
       return { data, error }
     },

     async download(bucket: string, path: string) {
       const { data, error } = await supabase.storage
         .from(bucket)
         .download(path)
       return { data, error }
     },

     getPublicUrl(bucket: string, path: string) {
       const { data } = supabase.storage
         .from(bucket)
         .getPublicUrl(path)
       return data.publicUrl
     }
   }
   ```

3. **Test:** Upload and retrieve test content using Supabase Storage

### Step 3: Set Up Inngest Infrastructure
**Goal:** Configure Inngest client and serve endpoint

1. **Create Inngest client** (`src/lib/inngest/client.ts`)
   - Initialize Inngest client with proper typing
   - Define event schema types matching the spec

2. **Create API route handler** (`src/app/api/inngest/index.ts`)
   - Set up the Inngest serve endpoint for Next.js App Router
   - Configure for local development

3. **Environment configuration** (`.env.local`)
   ```env
   INNGEST_EVENT_KEY=test_key_12345
   INNGEST_SIGNING_KEY=signkey_test_12345
   ```

4. **Test:** Start Inngest Dev Server and verify connection
   ```bash
   pnpm dlx inngest-cli@latest dev
   ```

### Step 4: Create Mock Services
**Goal:** Build realistic mocks for external dependencies

1. **Mock Firecrawl Service** (`src/lib/mocks/firecrawl.ts`)
   - Use actual Firecrawl types from `@firecrawl/sdk`
   - Generate mock crawl responses with realistic data structure
   - Include mock change tracking data
   - Simulate webhook payloads

2. **Mock OpenRouter Service** (`src/lib/mocks/openrouter.ts`)
   - Create mock summarization responses
   - Include realistic response delays
   - Generate consistent test outputs

3. **Mock Data Factory** (`src/lib/mocks/factory.ts`)
   - Create helper functions for generating test data
   - Include various page types (homepage, docs, blog, etc.)
   - Generate consistent markdown content

4. **Test:** Unit test mock services to verify type correctness

### Step 5: Implement Core Inngest Functions
**Goal:** Build the main processing pipeline

1. **F1 - Start Crawl Function** (`src/lib/inngest/functions/startCrawl.ts`)
   - Trigger: `domain/ingest.requested` event
   - Create job in database
   - Call mock Firecrawl to initiate crawl
   - Store `firecrawl_job_id`
   - Test with mock data

2. **F2 - Handle Crawl Page** (`src/lib/inngest/functions/handleCrawlPage.ts`)
   - Trigger: `domain/crawl.page` event
   - Store page markdown to Supabase Storage
   - Emit `page/process.requested` event
   - Implement idempotency checks

3. **F3 - Process Single URL** (`src/lib/inngest/functions/processUrl.ts`)
   - Trigger: `page/process.requested` event
   - Load page content from Supabase Storage
   - Clean content (basic implementation)
   - Compute fingerprint
   - Compare with previous version
   - Store version metadata
   - Emit `page/processed` event

4. **Test each function:** Use Inngest Dev Server to trigger and monitor execution

### Step 6: Implement Coordination Functions
**Goal:** Handle job completion and artifact assembly

1. **F4 - Handle Crawl Completed** (`src/lib/inngest/functions/handleCrawlCompleted.ts`)
   - Trigger: `domain/crawl.completed` event
   - Mark job stream as closed
   - Check if all pages processed
   - Conditionally emit `job/assemble.requested`

2. **F5 - Assemble Artifacts** (`src/lib/inngest/functions/assembleArtifacts.ts`)
   - Trigger: `job/assemble.requested` event
   - Collect all page versions for job
   - Build `llms.txt` and `llms-full.txt` (basic version)
   - Store artifacts to Supabase Storage
   - Emit `job/finalize.requested`

3. **F6 - Finalize Job** (`src/lib/inngest/functions/finalizeJob.ts`)
   - Trigger: `job/finalize.requested` event
   - Calculate statistics
   - Update job status to completed
   - Send mock notification (console log for now)

4. **Test end-to-end flow:** Trigger domain crawl and verify all functions execute


### Step 7: Add Concurrency & Error Handling
**Goal:** Production-ready reliability

1. **Implement concurrency controls**
   - Per-domain limits
   - Global rate limiting
   - Throttling configuration

2. **Add comprehensive error handling**
   - Retry strategies
   - NonRetriableError for permanent failures
   - Logging and monitoring

3. **Add idempotency checks**
   - Webhook deduplication
   - Step-level idempotency

4. **Test:** Stress test with concurrent jobs, simulate failures


## Local Development Setup

### Running Everything Locally

1. **Terminal 1 - Next.js Application**
   ```bash
   pnpm dev
   ```
   Runs on http://localhost:3000

2. **Terminal 2 - Inngest Dev Server**
   ```bash
   pnpm dlx inngest-cli@latest dev
   ```
   - Dev UI: http://localhost:8288
   - Automatically discovers functions from your Next.js app

3. **Terminal 3 - Cloudflare Tunnel (for webhooks)**
   ```bash
   cloudflared tunnel --url localhost:3000
   ```
   - Provides public HTTPS URL like `https://xxxxx.trycloudflare.com`
   - Use this URL for Firecrawl webhook configuration
   - Updates the `FIRECRAWL_WEBHOOK_URL` environment variable

4. **Terminal 4 - Database (if using local Postgres)**
   ```bash
   # If using Docker
   docker-compose up -d postgres

   # Run migrations
   pnpm db:push

   # Optional: Prisma Studio for database inspection
   pnpm db:studio
   ```

5. **Environment Variables** (`.env.local`)
   ```env
   # Inngest
   INNGEST_EVENT_KEY=test_key_12345
   INNGEST_SIGNING_KEY=signkey_test_12345

   # Database (Supabase local)
   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

   # Supabase (local development)
   NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key-from-supabase-status"
   SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-from-supabase-status"

   # Firecrawl
   FIRECRAWL_API_KEY=fc_xxx  # Real key even for mocks (for types)
   FIRECRAWL_WEBHOOK_SECRET=webhook_secret_123
   FIRECRAWL_WEBHOOK_URL=https://xxxxx.trycloudflare.com/api/webhooks/firecrawl

   # OpenRouter (for future use)
   OPENROUTER_API_KEY=mock_key_for_types

   # Feature flags
   USE_MOCK_SERVICES=true
   ```

### Testing Workflow

1. **Start all services** (Next.js, Inngest Dev Server, Cloudflare Tunnel, Database)

2. **Trigger a test crawl**
   ```bash
   curl -X POST http://localhost:3000/api/test/trigger \
     -H "Content-Type: application/json" \
     -d '{"domainId": "test-domain-1"}'
   ```

3. **Monitor execution** in Inngest Dev UI (http://localhost:8288)
   - View function runs
   - Inspect step outputs
   - Debug failures

4. **Check job status**
   ```bash
   curl http://localhost:3000/api/test/status/{jobId}
   ```

5. **Simulate webhook events** (for testing specific scenarios)
   ```bash
   # Can test against either localhost or tunnel URL
   curl -X POST http://localhost:3000/api/test/webhook \
     -H "Content-Type: application/json" \
     -d '{"type": "crawl.page", "jobId": "xxx", "page": {...}}'
   ```

6. **Test real Firecrawl webhooks** (when ready)
   - Use the Cloudflare tunnel URL in Firecrawl API calls
   - Monitor webhook receipts in your application logs

## Testing Strategy

### Unit Tests
- Mock service output validation
- Individual function logic
- Database operations

### Integration Tests
- Full pipeline execution with mocks
- Error recovery scenarios
- Concurrency behavior

### Manual Testing Checklist
- [ ] Can trigger crawl via API
- [ ] Functions execute in correct order
- [ ] Mock data flows through pipeline
- [ ] Database records created correctly
- [ ] Can view execution in Inngest Dev UI
- [ ] Error handling works (simulate failures)
- [ ] Idempotency works (duplicate events)

## Notes for README

### Quick Start Section
```markdown
## Local Development

### Prerequisites
- Node.js 20+
- pnpm
- PostgreSQL (or use Docker)

### First-Time Setup

#### Install Global Tools
These tools are not installed via `pnpm install` and need to be installed separately:

\`\`\`bash
# Install Cloudflare tunnel for webhook development
# Option 1: macOS with Homebrew
brew install cloudflare/cloudflare/cloudflared

# Option 2: NPM (all platforms)
npm install -g cloudflared

# Option 3: Download binary directly from
# https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation
\`\`\`

#### Install Dependencies
\`\`\`bash
pnpm install
\`\`\`

#### Set up environment variables
\`\`\`bash
cp .env.example .env.local
# Edit .env.local with your values
\`\`\`

#### Initialize database
\`\`\`bash
pnpm db:push
\`\`\`

### Running Locally
Start all services in separate terminals:

\`\`\`bash
# Terminal 1: Next.js app
pnpm dev

# Terminal 2: Inngest Dev Server
pnpm dlx inngest-cli@latest dev

# Terminal 3: Cloudflare tunnel (for webhooks)
cloudflared tunnel --url localhost:3000
# Copy the generated https://xxxxx.trycloudflare.com URL for webhook configuration

# Terminal 4: Database (if using Docker)
docker-compose up -d
\`\`\`

### Testing
Trigger a test crawl:
\`\`\`bash
curl -X POST http://localhost:3000/api/test/trigger \\
  -H "Content-Type: application/json" \\
  -d '{"domainId": "test-domain-1"}'
\`\`\`

Monitor execution at http://localhost:8288
```

### Architecture Overview Section
```markdown
## Architecture

This application uses Inngest for orchestrating the crawling and processing pipeline:

- **Event-driven**: Each step triggers the next via events
- **Fault-tolerant**: Automatic retries and error handling
- **Observable**: Full visibility into execution via Inngest Dev UI
- **Testable**: Mock services for local development

### Key Components
- Inngest functions handle discrete processing steps
- Mock services simulate Firecrawl and OpenRouter during development
- Database tracks job state and page versions
- API endpoints enable testing without frontend
```

## Migration to Production

When ready to use real services:

1. **Replace mock services** with actual API calls
   - Update `src/lib/firecrawl/client.ts` to use real Firecrawl SDK
   - Implement real OpenRouter integration
   - Configure Supabase Storage buckets for production

2. **Add webhook endpoint** for real Firecrawl callbacks
   - Implement signature verification
   - Handle production webhook URLs

3. **Configure production environment**
   - Set real API keys
   - Configure production database
   - Set up production Inngest

4. **Add monitoring**
   - Error tracking (Sentry, etc.)
   - Performance monitoring
   - Alerting for failed jobs

## Success Criteria

- ✅ All Inngest functions defined and callable
- ✅ Mock services provide realistic data using actual SDK types
- ✅ Full pipeline executes end-to-end with mocks
- ✅ Can trigger and monitor jobs via API
- ✅ Database properly tracks job state
- ✅ Local development setup is smooth
- ✅ Clear path to production deployment