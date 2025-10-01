/**
 * Integration test for the crawl pipeline using REAL services
 *
 * This test uses real Firecrawl and OpenRouter services.
 * Ensure you have valid API keys configured before running.
 *
 * Required environment variables:
 * - FIRECRAWL_API_KEY: Your Firecrawl API key
 * - OPENROUTER_API_KEY: Your OpenRouter API key
 * - TEST_BASE_URL: The base URL to test against (default: http://localhost:3000)
 *
 * Run with: npx tsx test/integration-tests/crawl-pipeline.test.ts
 */

import { resolve } from "node:path"
import { config } from "dotenv"

// Load environment variables from .env file
config({ path: resolve(process.cwd(), ".env") })

import { runCrawlPipelineTest } from "./crawl-pipeline.base"

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000"
const TEST_DOMAIN = "adidas.com"

// Verify required API keys
if (!process.env.FIRECRAWL_API_KEY) {
  console.error("❌ Missing FIRECRAWL_API_KEY environment variable")
  console.error("   This test requires a real Firecrawl API key")
  process.exit(1)
}

if (!process.env.OPENROUTER_API_KEY) {
  console.error("❌ Missing OPENROUTER_API_KEY environment variable")
  console.error("   This test requires a real OpenRouter API key")
  process.exit(1)
}

async function main() {
  console.log("=".repeat(60))
  console.log("CRAWL PIPELINE TEST - REAL SERVICES")
  console.log("=".repeat(60))
  console.log("")

  // Ensure we're NOT using mock services
  process.env.USE_MOCK_SERVICES = "false"

  try {
    const result = await runCrawlPipelineTest({
      baseUrl: BASE_URL,
      testDomain: TEST_DOMAIN,
      useMockServices: false,
      firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
    })

    console.log("\n✅ Test passed with real services!")
    process.exit(0)
  } catch (error) {
    console.error("\n❌ Test failed:", error)
    process.exit(1)
  }
}

// Run the test
main().catch((error) => {
  console.error("Unexpected error:", error)
  process.exit(1)
})
