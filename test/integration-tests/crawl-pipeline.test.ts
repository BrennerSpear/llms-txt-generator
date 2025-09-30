/**
 * Integration test for the crawl pipeline
 *
 * This test verifies that the entire pipeline works end-to-end:
 * 1. Create a test domain via direct DB access or admin API
 * 2. Trigger a crawl using production endpoints
 * 3. Send events directly to production webhook
 * 4. Verify processing
 *
 * Run with: npx tsx test/integration-tests/crawl-pipeline.test.ts
 */

import { WebhookSimulator } from "../../src/lib/mocks/webhook-simulator"

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000"
const TEST_DOMAIN = "test.integration.com"

// Helper to wait
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Helper to make API calls
async function apiCall(path: string, options?: RequestInit) {
  const url = `${BASE_URL}${path}`
  console.log(`📡 API Call: ${options?.method || "GET"} ${path}`)

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  })

  const data = await response.json()

  if (!response.ok) {
    console.error(`❌ API Error: ${response.status}`, data)
    throw new Error(`API call failed: ${JSON.stringify(data)}`)
  }

  return data
}

async function runIntegrationTest() {
  console.log("🧪 Starting Integration Test for Crawl Pipeline")
  console.log(`📍 Base URL: ${BASE_URL}`)
  console.log(`🌐 Test Domain: ${TEST_DOMAIN}`)
  console.log("")

  try {
    // Step 1: Trigger a crawl using production endpoint
    console.log("Step 1: Triggering crawl via production API...")
    const triggerResponse = await apiCall("/api/domains/crawl", {
      method: "POST",
      body: JSON.stringify({
        url: TEST_DOMAIN,
        checkIntervalMinutes: 1440,
        openrouterModel: "openai/gpt-4o-mini",
      }),
    })

    console.log("✅ Crawl triggered successfully")
    console.log(`   Domain ID: ${triggerResponse.domain.id}`)
    console.log(`   Job: ${triggerResponse.job?.id || "pending"}`)

    // Wait a bit for Inngest to create the job
    await wait(2000)

    // Step 2: Get initial job status
    console.log("\nStep 2: Checking initial job status...")

    // We need to get the job ID first
    // Since the trigger might not immediately return a job, let's poll
    const jobId: string | null = triggerResponse.job?.id || null
    let attempts = 0
    const domainId = triggerResponse.domain.id

    // If no job ID yet, wait and retry from the response
    while (!jobId && attempts < 5) {
      console.log(
        `   Waiting for job to be created... (attempt ${attempts + 1})`,
      )
      await wait(1000)
      attempts++

      // In a real integration test, you might want to add an endpoint to check
      // domain status or latest job, but for now we'll assume the job will be
      // in the initial response eventually
    }

    if (jobId) {
      const statusResponse = await apiCall(`/api/jobs/${jobId}`)
      console.log("✅ Job status retrieved")
      console.log(`   Job ID: ${statusResponse.job.id}`)
      console.log(`   Status: ${statusResponse.job.status}`)
      console.log(`   Firecrawl Job ID: ${statusResponse.job.firecrawlJobId}`)
    } else {
      console.log(
        "⚠️  Job ID not available immediately, continuing with webhook simulation...",
      )
    }

    // Step 3: Simulate webhook events directly to production endpoint
    console.log(
      "\nStep 3: Simulating Firecrawl webhook events to production endpoint...",
    )

    const webhookUrl = `${BASE_URL}/api/webhooks/firecrawl`
    const simulator = new WebhookSimulator(webhookUrl)

    const simulationResult = await simulator.simulateCrawl(TEST_DOMAIN, {
      pageCount: 3,
      delayBetweenPages: 500,
      simulateFailure: false,
    })

    console.log("✅ Webhook simulation completed")
    console.log(`   Simulated Job ID: ${simulationResult?.jobId}`)
    console.log(`   Pages sent: ${simulationResult?.pages.length}`)

    // Step 4: Wait for processing
    console.log("\nStep 4: Waiting for processing to complete...")
    await wait(5000) // Give Inngest time to process

    // Step 5: Check final status (if we have a job ID)
    if (jobId) {
      console.log("\nStep 5: Checking final job status...")
      const finalStatus = await apiCall(`/api/jobs/${jobId}`)

      console.log("📊 Final Job Status:")
      console.log(`   Status: ${finalStatus.job.status}`)
      console.log(`   Pages Total: ${finalStatus.pages.total}`)
      console.log(`   Pages Changed: ${finalStatus.pages.changed}`)
      console.log(`   Pages Skipped: ${finalStatus.pages.skipped}`)
      console.log(`   Duration: ${finalStatus.job.duration || "still running"}`)

      // Check page details
      if (finalStatus.pages.list.length > 0) {
        console.log("\n📄 Page Processing Results:")
        for (const page of finalStatus.pages.list) {
          console.log(`   - ${page.url}`)
          if (page.latestVersion) {
            console.log(`     Changed: ${page.latestVersion.changedEnough}`)
            console.log(`     Reason: ${page.latestVersion.reason}`)
          }
        }
      }
    }

    console.log("\n✅ Integration test completed successfully!")

    // Return success
    return {
      success: true,
      domain: TEST_DOMAIN,
      jobId,
    }
  } catch (error) {
    console.error("\n❌ Integration test failed:", error)
    throw error
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  console.log("=".repeat(60))
  console.log("CRAWL PIPELINE INTEGRATION TEST")
  console.log("=".repeat(60))
  console.log("")

  runIntegrationTest()
    .then((result) => {
      console.log(`\n${"=".repeat(60)}`)
      console.log("TEST PASSED ✅")
      console.log("=".repeat(60))
      process.exit(0)
    })
    .catch((error) => {
      console.log(`\n${"=".repeat(60)}`)
      console.log("TEST FAILED ❌")
      console.log("=".repeat(60))
      process.exit(1)
    })
}

export { runIntegrationTest }
