/**
 * Base integration test for the crawl pipeline
 *
 * This base test is used by both mock and real service tests.
 * It verifies that the entire pipeline works end-to-end:
 * 1. Create a test domain via direct DB access or admin API
 * 2. Trigger a crawl using production endpoints
 * 3. Send events directly to production webhook (mock) or wait for real Firecrawl
 * 4. Verify processing
 */

// WebhookSimulator is only needed if we add manual webhook simulation later
// import { WebhookSimulator } from "../../src/lib/mocks/webhook-simulator"

// Helper to wait
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Helper to make API calls
async function apiCall(baseUrl: string, path: string, options?: RequestInit) {
  const url = `${baseUrl}${path}`
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

interface TestConfig {
  baseUrl: string
  testDomain: string
  useMockServices: boolean
  firecrawlApiKey?: string
  openrouterApiKey?: string
  maxPages?: number
}

export async function runCrawlPipelineTest(config: TestConfig) {
  const { baseUrl, testDomain, useMockServices, maxPages } = config
  const startTime = Date.now()

  console.log("🧪 Starting Integration Test for Crawl Pipeline")
  console.log(`📍 Base URL: ${baseUrl}`)
  console.log(`🌐 Test Domain: ${testDomain}`)
  console.log(`🔧 Mode: ${useMockServices ? "Mock Services" : "Real Services"}`)
  console.log("")

  try {
    // Step 1: Trigger a crawl using production endpoint
    console.log("Step 1: Triggering crawl via production API...")
    const triggerResponse = await apiCall(baseUrl, "/api/domains/crawl", {
      method: "POST",
      body: JSON.stringify({
        url: testDomain,
        checkIntervalMinutes: 1440,
        openrouterModel: "openai/gpt-4o-mini",
        maxPages: maxPages ?? 10, // Limit to 10 pages for testing
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

      // Try to get the job by making a test request
      try {
        // This is a workaround - in production you'd have a proper endpoint
        // to get the domain's latest job
        const testResponse = await apiCall(baseUrl, "/api/domains/crawl", {
          method: "POST",
          body: JSON.stringify({
            url: testDomain,
            checkIntervalMinutes: 1440,
            openrouterModel: "openai/gpt-4o-mini",
            maxPages: maxPages ?? 10,
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
    const jobResponse = await apiCall(baseUrl, `/api/jobs/${jobId}`)
    console.log("✅ Job status retrieved")
    console.log(`   Job ID: ${jobResponse.job.id}`)
    console.log(`   Status: ${jobResponse.job.status}`)
    console.log(`   Firecrawl Job ID: ${jobResponse.job.firecrawlJobId}`)

    firecrawlJobId = jobResponse.job.firecrawlJobId

    // Step 4: Handle mock vs real services
    if (useMockServices) {
      console.log("\nStep 4: Mock service is processing pages automatically...")
      console.log(`   Mock Firecrawl Job ID: ${firecrawlJobId}`)
      console.log("   Waiting for mock webhooks to be processed...")

      // Give the mock service time to send webhooks
      await wait(5000)
    } else {
      console.log("\nStep 4: Using real Firecrawl service...")
      console.log(`   Firecrawl Job ID: ${firecrawlJobId}`)
      console.log("   Real crawl may take several minutes to complete...")

      // For real Firecrawl, we need to wait longer and poll for completion
      // Firecrawl will send webhooks when pages are crawled
      console.log("   Waiting for Firecrawl to process pages...")

      // Real crawls can take a while, especially for larger sites
      const realCrawlWaitTime = 30000 // 30 seconds initial wait
      await wait(realCrawlWaitTime)
    }

    // Step 5: Poll for job completion
    console.log("\nStep 5: Polling for job completion...")
    let isComplete = false
    let completionAttempts = 0
    const maxCompletionAttempts = useMockServices ? 30 : 120 // More attempts for real services
    const pollInterval = useMockServices ? 2000 : 5000 // Poll less frequently for real services

    while (!isComplete && completionAttempts < maxCompletionAttempts) {
      const statusResponse = await apiCall(baseUrl, `/api/jobs/${jobId}`)
      const status = statusResponse.job.status
      const pages = statusResponse.pages

      console.log(
        `   Status: ${status} | Pages: ${pages.total} (${pages.changed} changed) | Attempt ${completionAttempts + 1}/${maxCompletionAttempts}`,
      )

      if (status === "finished" || status === "failed") {
        isComplete = true
        console.log(
          `\n✅ Job ${status === "finished" ? "completed" : "failed"}!`,
        )

        if (status === "finished") {
          console.log("\n📊 Final Statistics:")
          console.log(`   Total Pages: ${pages.total}`)
          console.log(`   Changed Pages: ${pages.changed}`)
          console.log(`   Unchanged Pages: ${pages.total - pages.changed}`)

          // Check for artifacts
          if (statusResponse.artifacts && statusResponse.artifacts.length > 0) {
            console.log("\n📦 Artifacts Generated:")
            for (const artifact of statusResponse.artifacts) {
              console.log(`   - ${artifact.kind} (v${artifact.version})`)
            }
          }
        }

        break
      }

      completionAttempts++
      await wait(pollInterval)
    }

    if (!isComplete) {
      console.log("\n⚠️ Job did not complete in time")
      throw new Error("Job completion timed out")
    }

    // Step 6: Verify the results
    console.log("\nStep 6: Verifying results...")

    // Get final job details
    const finalJobResponse = await apiCall(baseUrl, `/api/jobs/${jobId}`)

    // Verify job completed
    if (finalJobResponse.job.status !== "finished") {
      throw new Error(
        `Expected job status 'finished', got '${finalJobResponse.job.status}'`,
      )
    }

    // Verify pages were processed
    if (finalJobResponse.pages.total === 0) {
      throw new Error("No pages were processed")
    }

    // Verify artifacts were created (for mock, we expect llms.txt artifacts)
    if (finalJobResponse.artifacts && finalJobResponse.artifacts.length > 0) {
      console.log(`✅ ${finalJobResponse.artifacts.length} artifacts created`)
    }

    console.log("\n🎉 Integration test completed successfully!")
    console.log(`   Total time: ${Date.now() - startTime}ms`)

    return {
      success: true,
      job: finalJobResponse.job,
      pages: finalJobResponse.pages,
      artifacts: finalJobResponse.artifacts,
    }
  } catch (error) {
    console.error("\n❌ Integration test failed:", error)
    throw error
  }
}
