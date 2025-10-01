import { prisma } from "~/lib/db/client"

/**
 * Test script for the cancel job endpoint
 * Usage: pnpm tsx test/test-cancel-job.ts
 */

async function testCancelJob() {
  console.log("🔬 Testing cancel job endpoint...")

  try {
    // 1. First, find a processing job to test with, or create one
    let testJob = await prisma.job.findFirst({
      where: { status: "processing" },
      include: { domain: true },
    })

    if (!testJob) {
      console.log("No processing job found. Creating a test job...")

      // Find or create a domain
      let domain = await prisma.domain.findFirst()
      if (!domain) {
        domain = await prisma.domain.create({
          data: {
            domain: "test.example.com",
            check_interval_minutes: 1440,
            is_active: true,
          },
        })
      }

      // Create a test job
      testJob = await prisma.job.create({
        data: {
          domain_id: domain.id,
          type: "update",
          status: "processing",
          firecrawl_job_id: `test-firecrawl-${Date.now()}`,
        },
        include: { domain: true },
      })

      console.log(`Created test job: ${testJob.id}`)
    }

    console.log("\n📋 Test job details:")
    console.log(`   ID: ${testJob.id}`)
    console.log(`   Domain: ${testJob.domain.domain}`)
    console.log(`   Status: ${testJob.status}`)
    console.log(`   Firecrawl ID: ${testJob.firecrawl_job_id}`)

    // 2. Call the cancel endpoint
    console.log(`\n🚫 Calling cancel endpoint for job ${testJob.id}...`)

    const response = await fetch(
      `http://localhost:3000/api/jobs/${testJob.id}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "Test cancellation",
        }),
      },
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to cancel job: ${JSON.stringify(error, null, 2)}`)
    }

    const result = await response.json()
    console.log("\n✅ Cancel endpoint response:")
    console.log(JSON.stringify(result, null, 2))

    // 3. Verify the job was canceled in the database
    const canceledJob = await prisma.job.findUnique({
      where: { id: testJob.id },
    })

    console.log("\n🔍 Verification:")
    console.log(`   Job status: ${canceledJob?.status}`)
    console.log(`   Finished at: ${canceledJob?.finished_at}`)
    console.log(`   Stats: ${JSON.stringify(canceledJob?.stats, null, 2)}`)

    if (canceledJob?.status === "canceled") {
      console.log("\n✅ Test PASSED: Job was successfully canceled!")
    } else {
      console.log(
        `\n❌ Test FAILED: Job status is ${canceledJob?.status}, expected 'canceled'`,
      )
    }

    // 4. Test error cases
    console.log("\n📋 Testing error cases...")

    // Try to cancel an already canceled job
    console.log("   Testing: Cancel already canceled job...")
    const response2 = await fetch(
      `http://localhost:3000/api/jobs/${testJob.id}/cancel`,
      {
        method: "POST",
      },
    )

    if (response2.status === 400) {
      const error = await response2.json()
      console.log(`   ✅ Correctly rejected: ${error.error}`)
    } else {
      console.log(`   ❌ Should have returned 400, got ${response2.status}`)
    }

    // Try to cancel non-existent job
    console.log("   Testing: Cancel non-existent job...")
    const response3 = await fetch(
      "http://localhost:3000/api/jobs/non-existent-id/cancel",
      {
        method: "POST",
      },
    )

    if (response3.status === 404) {
      const error = await response3.json()
      console.log(`   ✅ Correctly rejected: ${error.error}`)
    } else {
      console.log(`   ❌ Should have returned 404, got ${response3.status}`)
    }

    console.log("\n🎉 All tests completed!")
  } catch (error) {
    console.error("\n❌ Test failed:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testCancelJob().catch(console.error)
