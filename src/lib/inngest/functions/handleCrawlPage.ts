import type { Document } from "firecrawl"
import { db } from "~/lib/db"
import { STORAGE_BUCKETS, storage } from "~/lib/storage/client"
import { getRawPagePath } from "~/lib/storage/paths"
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
      limit: 5, // Allow processing multiple pages in parallel
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

    // Log the incoming page URL
    console.log(`📄 HandleCrawlPage: Processing page URL: ${url}`)
    console.log(`   Job ID: ${jobId}`)
    console.log(`   Domain ID: ${domainId}`)

    // Step 1: Validate job exists and is active
    const job = await step.run("validate-job", async () => {
      const foundJob = await db.job.getById(jobId)

      if (!foundJob) {
        throw new Error(`Job not found: ${jobId}`)
      }

      // Check if job has been canceled
      if (foundJob.status === "canceled") {
        console.warn(`🚫 Job ${jobId} has been canceled, skipping page: ${url}`)
        return foundJob
      }

      if (foundJob.status !== "processing") {
        console.warn(
          `⚠️ Job ${jobId} is in '${foundJob.status}' state (not 'processing'), skipping page: ${url}`,
        )
        return foundJob
      }

      if (foundJob.firecrawl_job_id !== firecrawlJobId) {
        throw new Error(
          `Firecrawl job ID mismatch: expected ${foundJob.firecrawl_job_id}, got ${firecrawlJobId}`,
        )
      }

      return foundJob
    })

    // Skip if job is not active or has been canceled
    if (!job) {
      return {
        skipped: true,
        reason: "Job not in processing state or has been canceled",
      }
    }

    // Step 2: Increment pending pages counter and pages received
    await step.run("increment-pending-pages", async () => {
      const updatedJob = await db.job.incrementPagesReceived(jobId)
      console.log(
        `   ➕ Page received #${updatedJob.pages_received} for job ${jobId}`,
      )
      console.log(
        `   📊 Received: ${updatedJob.pages_received}/${updatedJob.pages_received || "?"}`,
      )
    })

    console.log("track changes", changeTracking)

    // Step 3: Create or update page record
    const page = await step.run("upsert-page", async () => {
      return await db.page.upsert({
        jobId,
        domainId,
        url,
      })
    })

    // Step 4: Get domain URL for path generation
    const domain = await step.run("get-domain", async () => {
      const foundDomain = await db.domain.getById(domainId)
      if (!foundDomain) {
        throw new Error(`Domain not found: ${domainId}`)
      }
      return foundDomain.domain
    })

    // Step 5: Store raw markdown content to Supabase Storage
    const rawMdPath = await step.run("store-raw-markdown", async () => {
      const path = getRawPagePath(domain, jobId, new Date(job.started_at), url)
      await storage.upload(STORAGE_BUCKETS.ARTIFACTS, path, markdown)
      return path
    })

    // Step 6: Emit page process requested event for further processing
    await step.run("emit-process-requested", async () => {
      await sendEvent("page/process.requested", {
        pageId: page.id,
        jobId,
        domainUrl: domain,
        url,
        rawContent: markdown,
        rawMdPath, // Pass the path where raw markdown was stored
        changeTracking,
        metadata: metadata
          ? {
              title: metadata?.title,
              description: metadata?.description,
              ...metadata,
            }
          : undefined,
      })
    })

    return {
      success: true,
      pageId: page.id,
      jobId,
      url,
      rawMdPath,
      hasChanges: changeTracking?.hasChanges,
      metadata: {
        title: (metadata as Document["metadata"])?.title,
        description: (metadata as Document["metadata"])?.description,
        sourceURL: url,
      },
    }
  },
)
