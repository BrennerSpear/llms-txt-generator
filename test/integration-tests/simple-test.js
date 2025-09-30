/**
 * Simple integration test for the crawl pipeline
 * Can be run with: node test/integration-tests/simple-test.js
 */

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000"

async function testCrawlPipeline() {
  console.log("🧪 Testing Crawl Pipeline")
  console.log(`📍 URL: ${BASE_URL}`)
  console.log("")

  try {
    // 1. Trigger a crawl
    console.log("1️⃣  Triggering crawl...")
    const triggerRes = await fetch(`${BASE_URL}/api/test/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: "test.example.com",
        type: "initial",
      }),
    })

    const triggerData = await triggerRes.json()

    if (!triggerRes.ok) {
      throw new Error(`Trigger failed: ${JSON.stringify(triggerData)}`)
    }

    console.log("✅ Crawl triggered")
    console.log(`   Domain ID: ${triggerData.domain.id}`)

    // 2. Simulate some webhook events
    console.log("\n2️⃣  Simulating webhook events...")

    // Wait a moment for the job to be created
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Simulate a webhook (this would normally come from Firecrawl)
    const mockWebhookRes = await fetch(`${BASE_URL}/api/test/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: "test.example.com",
        pageCount: 3,
        delayBetweenPages: 500,
      }),
    })

    const webhookData = await mockWebhookRes.json()

    if (!mockWebhookRes.ok) {
      throw new Error(
        `Webhook simulation failed: ${JSON.stringify(webhookData)}`,
      )
    }

    console.log("✅ Webhook simulation started")
    console.log(`   Pages: ${webhookData.config.pageCount}`)

    // 3. Wait for processing
    console.log("\n3️⃣  Waiting for processing...")
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // 4. Check status
    if (triggerData.job?.id) {
      console.log("\n4️⃣  Checking job status...")
      const statusRes = await fetch(
        `${BASE_URL}/api/test/status/${triggerData.job.id}`,
      )
      const statusData = await statusRes.json()

      if (statusRes.ok) {
        console.log("✅ Job Status:")
        console.log(`   Status: ${statusData.job.status}`)
        console.log(`   Pages: ${statusData.pages.total}`)
        console.log(`   Changed: ${statusData.pages.changed}`)
      }
    }

    console.log("\n✅ Test completed successfully!")
  } catch (error) {
    console.error(
      "\n❌ Test failed:",
      error instanceof Error ? error.message : "Unknown error",
    )
    process.exit(1)
  }
}

// Run the test
testCrawlPipeline()
