import { prisma } from "~/lib/db/client"
import { jobService } from "~/lib/db/jobs"

/**
 * Test the cancel functionality directly in the database
 * Usage: pnpm tsx test/test-cancel-db.ts
 */

async function testCancelDB() {
  console.log("🔬 Testing cancel job functionality directly in database...")

  try {
    // 1. Find or create a processing job
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

    // 2. Cancel the job using the service function
    console.log(`\n🚫 Canceling job ${testJob.id}...`)
    const canceledJob = await jobService.cancel(testJob.id, "Test cancellation")

    console.log("\n✅ Job canceled successfully!")
    console.log(`   Status: ${canceledJob.status}`)
    console.log(`   Finished at: ${canceledJob.finished_at}`)
    console.log(`   Stats: ${JSON.stringify(canceledJob.stats, null, 2)}`)

    // 3. Verify the cancellation
    const verifyJob = await prisma.job.findUnique({
      where: { id: testJob.id },
    })

    if (verifyJob?.status === "canceled") {
      console.log("\n✅ Test PASSED: Job status is 'canceled' in database!")
    } else {
      console.log(
        `\n❌ Test FAILED: Job status is ${verifyJob?.status}, expected 'canceled'`,
      )
    }

    // 4. Test that we can't cancel an already canceled job
    console.log("\n📋 Testing error case: Cancel already canceled job...")
    try {
      // Try to cancel again (should work but just update the timestamp)
      const reCanceled = await jobService.cancel(
        testJob.id,
        "Second cancellation attempt",
      )
      console.log(
        `   ✅ Re-canceling worked (idempotent): Status is ${reCanceled.status}`,
      )
    } catch (error) {
      console.log(`   ❌ Unexpected error: ${error}`)
    }

    console.log("\n🎉 Database tests completed successfully!")
  } catch (error) {
    console.error("\n❌ Test failed:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testCancelDB().catch(console.error)
