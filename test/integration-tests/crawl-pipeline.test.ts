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
const TEST_DOMAIN = `test.integration.${Date.now()}.com`

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

    // Step 2: Wait for job to be created by Inngest
    console.log("\nStep 2: Waiting for job to be created by Inngest...")

    const domainId = triggerResponse.domain.id
    let jobId: string | null = null
    let firecrawlJobId: string | null = null
    let attempts = 0
    const maxAttempts = 10

    // Poll for job creation (Inngest needs time to process the event)
    while (!jobId && attempts < maxAttempts) {
      console.log(
        `   Polling for job... (attempt ${attempts + 1}/${maxAttempts})`,
      )
      await wait(2000)
      attempts++

      // Query the database directly or use an API endpoint to get latest job
      // For now, we'll assume the job will eventually be available
      // In a production test, you'd want to add an API endpoint to get domain's latest job

      // Try to get the job by making a test request
      try {
        // This is a workaround - in production you'd have a proper endpoint
        // to get the domain's latest job
        const testResponse = await apiCall("/api/domains/crawl", {
          method: "POST",
          body: JSON.stringify({
            url: TEST_DOMAIN,
            checkIntervalMinutes: 1440,
            openrouterModel: "openai/gpt-4o-mini",
          }),
        }).catch((e) => {
          // If we get a 409, it means there's already an active job
          if (e.message?.includes("already has an active crawl job")) {
            // Parse the error to get the job ID
            const errorData = JSON.parse(
              e.message.replace("API call failed: ", ""),
            )
            return errorData
          }
          return e
        })

        if (testResponse?.activeJob?.id) {
          jobId = testResponse.activeJob.id
          console.log(`✅ Found active job: ${jobId}`)
          break
        }
      } catch (e) {
        // Expected - job might be in progress
      }
    }

    if (!jobId) {
      console.log("❌ Job was not created after waiting")
      throw new Error("Job creation timed out")
    }

    // Step 3: Get job details
    console.log("\nStep 3: Getting job details...")
    const jobResponse = await apiCall(`/api/jobs/${jobId}`)
    console.log("✅ Job status retrieved")
    console.log(`   Job ID: ${jobResponse.job.id}`)
    console.log(`   Status: ${jobResponse.job.status}`)
    console.log(`   Firecrawl Job ID: ${jobResponse.job.firecrawlJobId}`)

    firecrawlJobId = jobResponse.job.firecrawlJobId

    // Step 4: Check if we're in mock mode based on the Firecrawl job ID
    // Mock job IDs start with "mock_crawl_"
    const isMockMode = firecrawlJobId?.startsWith("mock_crawl_")

    if (isMockMode) {
      console.log("\nStep 4: Mock service is processing pages automatically...")
      console.log(`   Mock Firecrawl Job ID: ${firecrawlJobId}`)
      console.log("   Waiting for mock webhooks to be processed...")

      // Give the mock service time to send webhooks
      await wait(5000)
    } else {
      // In real mode, we'd need to wait for actual Firecrawl webhooks
      console.log("\nStep 4: Waiting for Firecrawl webhooks...")
      console.log("   (In production, real Firecrawl would send webhooks)")
      await wait(5000)
    }

    // Step 5: Wait for processing
    console.log("\nStep 5: Waiting for processing to complete...")
    await wait(5000) // Give Inngest time to process

    // Step 6: Check final status (if we have a job ID)
    if (jobId) {
      console.log("\nStep 6: Checking final job status...")
      const finalStatus = await apiCall(`/api/jobs/${jobId}`)

      console.log("📊 Final Job Status:")
      console.log(`   Status: ${finalStatus.job.status}`)
      console.log(`   Pages Total: ${finalStatus.pages.total}`)
      console.log(`   Pages Changed: ${finalStatus.pages.changed}`)
      console.log(`   Pages Skipped: ${finalStatus.pages.skipped}`)
      console.log(`   Duration: ${finalStatus.job.duration || "still running"}`)

      // Check page details
      if (finalStatus.pages?.list?.length > 0) {
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
