# Integration Tests

This directory contains integration tests for the crawl pipeline.

## Test Variants

### Mock Services Test
Tests the crawl pipeline using mock Firecrawl and OpenRouter services. No API keys required.

```bash
pnpm test:crawl:mock
# or directly:
npx tsx test/integration-tests/crawl-pipeline.mock.test.ts
```

### Real Services Test
Tests the crawl pipeline using real Firecrawl and OpenRouter APIs.

**Required Environment Variables:**
- `FIRECRAWL_API_KEY` - Your Firecrawl API key
- `OPENROUTER_API_KEY` - Your OpenRouter API key
- `TEST_BASE_URL` (optional) - Base URL to test against (default: http://localhost:3000)

```bash
pnpm test:crawl
# or directly:
npx tsx test/integration-tests/crawl-pipeline.test.ts
```

## Architecture

- `crawl-pipeline.base.ts` - Shared test logic for both mock and real services
- `crawl-pipeline.mock.test.ts` - Mock services test runner (sets USE_MOCK_SERVICES=true)
- `crawl-pipeline.test.ts` - Real services test runner (sets USE_MOCK_SERVICES=false)

## How It Works

1. **Mock Test**: Forces `USE_MOCK_SERVICES=true` which causes the startCrawl function to use mockFirecrawl instead of the real API
2. **Real Test**: Forces `USE_MOCK_SERVICES=false` and requires valid API keys to interact with actual services

Both tests follow the same flow:
1. Create a test domain via the API
2. Trigger a crawl
3. Poll for job creation by Inngest
4. Wait for processing (mock sends webhooks immediately, real waits for Firecrawl)
5. Poll for completion
6. Verify results and artifacts

## Prerequisites

For all tests:
- Local development server running (`pnpm dev`)
- Inngest running (`pnpm inngest:dev`)
- Supabase running (local or cloud)
- Database migrated (`pnpm db:push`)

For real services test additionally:
- Valid Firecrawl API key
- Valid OpenRouter API key
- Cloudflared tunnel for webhooks (if testing locally)