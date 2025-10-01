import { NonRetriableError } from "inngest"
import { db } from "~/lib/db"
import { inngest } from "../client"

export const handleCrawlCompleted = inngest.createFunction(
  {
    id: "handle-crawl-completed",
    name: "F4 - Handle Crawl Completed",
    concurrency: {
      limit: 5,
    },
    retries: 3,
  },
  { event: "domain/crawl.completed" },
  async ({ event, step }) => {
    const { jobId, firecrawlJobId, domainId } = event.data

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

      // Mark stream as closed
      await db.job.markStreamClosed(jobId)

      // Update job stats with crawl completion info
      await db.job.mergeStats(jobId, {
        crawlCompleted: true,
        firecrawlJobId,
        streamClosedAt: new Date().toISOString(),
      })

      return { job, domainId: job.domain_id }
    })

    // Step 2: Check if job is ready for assembly
    const isReady = await step.run("check-ready-for-assembly", async () => {
      const currentJob = await db.job.getById(jobId)
      const pagesProcessed = currentJob?.pages_processed ?? 0
      const pagesReceived = currentJob?.pages_received ?? 0

      // Check if we're ready for assembly
      const ready = await db.job.isReadyForAssembly(jobId)

      console.log(`🏁 Crawl completed for job ${jobId}: Stream is now CLOSED`)
      console.log(
        `   📊 Received: ${pagesReceived}, Processed: ${pagesProcessed}`,
      )

      // Diagnose why we might not be ready
      if (!ready) {
        if (pagesReceived === 0) {
          console.log(
            "   ⚠️ No pages received yet. Waiting for pages to arrive via webhooks.",
          )
        } else if (pagesProcessed < pagesReceived) {
          console.log(
            `   ⏳ Waiting for ${pagesReceived - pagesProcessed} pages to finish processing.`,
          )
        }
      }

      return {
        ready,
        pagesProcessed,
        pagesReceived,
      }
    })

    // Step 3: Conditionally emit assembly event
    if (isReady.ready) {
      await step.sendEvent("emit-assembly-event", {
        name: "job/assemble.requested",
        data: {
          jobId,
          domainId: jobData.domainId,
          completedPages: isReady.pagesProcessed,
        },
      })

      console.log(
        `   ✨ Assembly triggered immediately (${isReady.pagesProcessed} pages processed)`,
      )
    } else {
      // Just update stats to note we're waiting
      await step.run("note-waiting-for-pages", async () => {
        await db.job.mergeStats(jobId, {
          streamClosed: true,
          pagesProcessedAtClose: isReady.pagesProcessed,
          pagesReceivedAtClose: isReady.pagesReceived,
          note: `Stream closed. Received: ${isReady.pagesReceived}, Processed: ${isReady.pagesProcessed}`,
        })
      })
    }

    return {
      jobId,
      ready: isReady.ready,
      pagesProcessed: isReady.pagesProcessed,
      pagesReceived: isReady.pagesReceived,
    }
  },
)
