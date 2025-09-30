/**
 * Test script for database operations
 * Run with: pnpm tsx test/test-db.ts
 */

import {
  artifactService,
  domainService,
  jobService,
  pageService,
  prisma,
  promptProfileService,
} from "~/lib/db"

async function testDatabaseOperations() {
  console.log("🧪 Testing database operations...\n")

  try {
    // Test 1: Create a prompt profile
    console.log("1️⃣ Creating prompt profile...")
    const profile = await promptProfileService.getDefault()
    console.log(
      `✅ Prompt profile created: ${profile.name} (ID: ${profile.id})`,
    )

    // Test 2: Create a domain
    console.log("\n2️⃣ Creating test domain...")
    const domain = await domainService.create({
      domain: "example.com",
      checkIntervalMinutes: 60,
      promptProfileId: profile.id,
    })
    console.log(`✅ Domain created: ${domain.domain} (ID: ${domain.id})`)

    // Test 3: Create a job
    console.log("\n3️⃣ Creating test job...")
    const job = await jobService.create({
      domainId: domain.id,
      type: "initial",
      firecrawlJobId: "test-firecrawl-123",
    })
    console.log(`✅ Job created: ${job.type} job (ID: ${job.id})`)

    // Test 4: Create a page
    console.log("\n4️⃣ Creating test page...")
    const page = await pageService.upsert({
      jobId: job.id,
      domainId: domain.id,
      url: "https://example.com/test-page",
    })
    console.log(`✅ Page created: ${page.url} (ID: ${page.id})`)

    // Test 5: Create a page version
    console.log("\n5️⃣ Creating page version...")
    const pageVersion = await pageService.createVersion({
      pageId: page.id,
      jobId: job.id,
      url: page.url,
      contentFingerprint: "test-fingerprint-123",
      changedEnough: true,
      reason: "Initial crawl",
    })
    console.log(`✅ Page version created (ID: ${pageVersion.id})`)

    // Test 6: Create artifacts
    console.log("\n6️⃣ Creating artifacts...")
    const artifacts = await artifactService.createMany([
      {
        jobId: job.id,
        kind: "llms_txt",
        blobUrl: "blob://test/llms.txt",
      },
      {
        jobId: job.id,
        kind: "llms_full_txt",
        blobUrl: "blob://test/llms-full.txt",
      },
    ])
    console.log(`✅ Created ${artifacts.length} artifacts`)

    // Test 7: Update job status
    console.log("\n7️⃣ Finishing job...")
    const finishedJob = await jobService.finish(job.id, {
      pagesProcessed: 1,
      pagesChanged: 1,
      pagesSkipped: 0,
      duration: 5000,
    })
    console.log(`✅ Job finished with status: ${finishedJob.status}`)

    // Test 8: Query operations
    console.log("\n8️⃣ Testing query operations...")

    const activeDomains = await domainService.getActive()
    console.log(`   - Active domains: ${activeDomains.length}`)

    const jobArtifacts = await artifactService.getByJobId(job.id)
    console.log(`   - Job artifacts: ${jobArtifacts.length}`)

    const pageStats = await pageService.countPagesForJob(job.id)
    console.log(`   - Page stats: ${JSON.stringify(pageStats)}`)

    console.log("\n✅ All database operations completed successfully!")

    // Cleanup
    console.log("\n🧹 Cleaning up test data...")
    await prisma.artifact.deleteMany({ where: { job_id: job.id } })
    await prisma.pageVersion.deleteMany({ where: { job_id: job.id } })
    await prisma.page.deleteMany({ where: { job_id: job.id } })
    await prisma.job.deleteMany({ where: { id: job.id } })
    await prisma.domain.deleteMany({ where: { id: domain.id } })
    console.log("✅ Cleanup completed")
  } catch (error) {
    console.error("❌ Test failed:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the tests
testDatabaseOperations().catch(console.error)
