import { NonRetriableError } from "inngest"
import { db } from "~/lib/db"
import { inngest } from "../client"

export const handleCrawlCompleted = inngest.createFunction(
  {
    id: "handle-crawl-completed",
    name: "F4 - Handle Crawl Completed",
    concurrency: {
      limit: 100,
    },
    retries: 3,
  },
  { event: "domain/crawl.completed" },
  async ({ event, step }) => {
    const { jobId, firecrawlJobId, totalPages, domainId } = event.data

    // Step 1: Mark the job stream as closed
    const jobData = await step.run("mark-job-stream-closed", async () => {
      const job = await db.job.getById(jobId)

      if (!job) {
        throw new NonRetriableError(`Job not found: ${jobId}`)
      }

      if (!job.domain.is_active) {
        await db.job.fail(jobId, "Domain is not active")
        throw new NonRetriableError(
          `Domain is not active: ${job.domain.domain}`,
        )
      }

      // Update job stats with crawl completion info
      await db.job.mergeStats(jobId, {
        crawlCompleted: true,
        firecrawlJobId,
        totalPages,
        streamClosedAt: new Date().toISOString(),
      })

      return { job, domainId: job.domain_id }
    })

    // Step 2: Check if all pages have been processed
    const allPagesProcessed = await step.run(
      "check-all-pages-processed",
      async () => {
        // Count total page versions created for this job
        const counts = await db.page.countPagesForJob(jobId)

        console.log(
          `Job ${jobId}: Processed ${counts.total}/${totalPages} pages`,
        )

        // Check if we've processed all expected pages
        // Allow for some discrepancy as webhooks might miss pages
        const processingComplete = counts.total >= totalPages * 0.9 // 90% threshold

        return {
          processedCount: counts.total,
          expectedPages: totalPages,
          processingComplete,
        }
      },
    )

    // Step 3: Conditionally emit assembly event
    if (allPagesProcessed.processingComplete) {
      await step.sendEvent("emit-assembly-event", {
        name: "job/assemble.requested",
        data: {
          jobId,
          domainId: jobData.domainId,
          completedPages: allPagesProcessed.processedCount,
        },
      })

      console.log(`Job ${jobId}: Assembly triggered`)
    } else {
      // Wait a bit more for pages to process
      await step.sleep("wait-for-stragglers", "30s")

      // Recheck after waiting
      const recheck = await step.run("recheck-pages-processed", async () => {
        const counts = await db.page.countPagesForJob(jobId)
        return counts.total >= allPagesProcessed.expectedPages * 0.9
      })

      if (recheck) {
        await step.sendEvent("emit-delayed-assembly-event", {
          name: "job/assemble.requested",
          data: {
            jobId,
            domainId: jobData.domainId,
            completedPages: allPagesProcessed.processedCount,
          },
        })

        console.log(`Job ${jobId}: Assembly triggered after delay`)
      } else {
        // Mark job as partially completed
        await step.run("mark-partial-completion", async () => {
          await db.job.complete(jobId, {
            partialCompletion: true,
            processedPages: allPagesProcessed.processedCount,
            expectedPages: allPagesProcessed.expectedPages,
          })
        })

        console.log(`Job ${jobId}: Marked as partially completed`)
      }
    }

    return {
      jobId,
      processingComplete: allPagesProcessed.processingComplete,
      processedPages: allPagesProcessed.processedCount,
      expectedPages: allPagesProcessed.expectedPages,
    }
  },
)
