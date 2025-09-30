import type { Document } from "firecrawl"
import { db } from "~/lib/db"
import { STORAGE_BUCKETS, storage } from "~/lib/storage/client"
import { inngest, sendEvent } from "../client"

/**
 * F2 - Handle Crawl Page Function
 * Processes incoming page data from Firecrawl webhook
 * Stores raw content and emits processing event
 */
export const handleCrawlPage = inngest.createFunction(
  {
    id: "handle-crawl-page",
    name: "Handle Crawl Page",
    concurrency: {
      limit: 50, // Allow processing multiple pages in parallel
    },
    throttle: {
      limit: 100,
      period: "10s", // Process max 100 pages per 10 seconds
    },
    retries: 3,
  },
  { event: "domain/crawl.page" },
  async ({ event, step }) => {
    const {
      domainId,
      jobId,
      firecrawlJobId,
      url,
      markdown,
      metadata,
      changeTracking,
    } = event.data

    // Step 1: Validate job exists and is active
    const job = await step.run("validate-job", async () => {
      const foundJob = await db.job.getById(jobId)

      if (!foundJob) {
        throw new Error(`Job not found: ${jobId}`)
      }

      if (foundJob.status !== "processing") {
        console.warn(`Job ${jobId} is not in processing state, skipping page`)
        return null
      }

      if (foundJob.firecrawl_job_id !== firecrawlJobId) {
        throw new Error(
          `Firecrawl job ID mismatch: expected ${foundJob.firecrawl_job_id}, got ${firecrawlJobId}`,
        )
      }

      return foundJob
    })

    // Skip if job is not active
    if (!job) {
      return {
        skipped: true,
        reason: "Job not in processing state",
      }
    }

    // if no `trackChanges` at all, we assume it's a new page or first crawl
    const hasChanges = !changeTracking || changeTracking.hasChanges
    // Skip if page hasn't changed significantly
    if (hasChanges) {
      return {
        skipped: true,
        reason: "Firecrawl did not detect any changes",
        url,
      }
    }

    // Step 2: Create or update page record
    const page = await step.run("upsert-page", async () => {
      return await db.page.upsert({
        jobId,
        domainId,
        url,
      })
    })

    // Step 3: Store raw markdown content to Supabase Storage
    const rawMdPath = await step.run("store-raw-markdown", async () => {
      const timestamp = Date.now()
      const urlSlug = url.replace(/[^a-z0-9]/gi, "_").toLowerCase()
      const path = `jobs/${jobId}/raw/${urlSlug}_${timestamp}.md`

      await storage.upload(STORAGE_BUCKETS.PAGE_CONTENT, path, markdown)

      return path
    })

    // Step 4: Emit page process requested event for further processing
    await step.run("emit-process-requested", async () => {
      await sendEvent("page/process.requested", {
        pageId: page.id,
        jobId,
        url,
        rawContent: markdown,
        rawMdPath, // Pass the path where raw markdown was stored
        changeTracking,
      })
    })

    return {
      success: true,
      pageId: page.id,
      jobId,
      url,
      rawMdPath,
      hasChanges,
      metadata: {
        title: (metadata as Document["metadata"])?.title,
        description: (metadata as Document["metadata"])?.description,
        sourceURL: url,
      },
    }
  },
)
