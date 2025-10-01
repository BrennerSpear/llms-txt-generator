import { db } from "~/lib/db"
import { inngest } from "../client"

/**
 * Coordinator Function - Check Job Ready
 * Listens to page/processed events and checks if job is ready for assembly
 * (stream closed AND pages_received === pages_processed)
 */
export const checkJobReady = inngest.createFunction(
  {
    id: "check-job-ready",
    name: "Check Job Ready for Assembly",
    concurrency: {
      limit: 5,
    },
  },
  { event: "page/processed" },
  async ({ event, step }) => {
    const { jobId } = event.data

    // Check if job is ready for assembly
    const isReady = await step.run("check-ready", async () => {
      const ready = await db.job.isReadyForAssembly(jobId)
      const job = await db.job.getById(jobId)

      // Only log when there are few pages left or when ready
      const pagesRemaining =
        (job?.pages_received ?? 0) - (job?.pages_processed ?? 0)
      if (pagesRemaining <= 5 || ready) {
        console.log(
          `   🔍 Checking job ${jobId}: Received ${job?.pages_received}, Processed ${job?.pages_processed}, Stream ${job?.stream_closed ? "CLOSED" : "open"}, Ready=${ready}`,
        )
      }

      return {
        ready,
        job,
      }
    })

    // If ready, emit assembly event
    if (isReady.ready && isReady.job) {
      const completedPages = isReady.job.pages_processed

      await step.sendEvent("trigger-assembly", {
        name: "job/assemble.requested",
        data: {
          jobId,
          domainId: isReady.job.domain_id,
          completedPages,
        },
      })

      console.log(
        `   🚀 ASSEMBLY TRIGGERED! Job ${jobId} is complete (${completedPages} pages processed, stream closed)`,
      )
    }

    return {
      jobId,
      ready: isReady.ready,
      pagesProcessed: isReady.job?.pages_processed ?? 0,
      pagesReceived: isReady.job?.pages_received ?? 0,
      streamClosed: isReady.job?.stream_closed ?? false,
    }
  },
)
