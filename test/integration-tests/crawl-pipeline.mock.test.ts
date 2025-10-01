/**
 * Integration test for the crawl pipeline using MOCK services
 *
 * This test uses mock Firecrawl and OpenRouter services for testing
 * without making real API calls or incurring costs.
 *
 * Run with: npx tsx test/integration-tests/crawl-pipeline.mock.test.ts
 */

import { runCrawlPipelineTest } from "./crawl-pipeline.base"

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000"
const TEST_DOMAIN = `test.integration.mock.${Date.now()}.com`

async function main() {
  console.log("=".repeat(60))
  console.log("CRAWL PIPELINE TEST - MOCK SERVICES")
  console.log("=".repeat(60))
  console.log("")

  // Force mock services for this test
  process.env.USE_MOCK_SERVICES = "true"

  try {
    const result = await runCrawlPipelineTest({
      baseUrl: BASE_URL,
      testDomain: TEST_DOMAIN,
      useMockServices: true,
    })

    console.log("\n✅ Test passed with mock services!")
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
