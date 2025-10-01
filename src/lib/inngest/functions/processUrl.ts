import { db } from "~/lib/db"
import { openRouter } from "~/lib/openrouter/client"
import { STORAGE_BUCKETS, storage } from "~/lib/storage/client"
import { getProcessedPagePath } from "~/lib/storage/paths"
import { cleanContent } from "~/lib/utils/cleaning"
import { inngest, sendEvent } from "../client"

/**
 * F3 - Process Single URL Function
 * Processes a single page: uses OpenRouter to enhance content,
 * and stores version metadata
 */
export const processUrl = inngest.createFunction(
  {
    id: "process-url",
    name: "Process Single URL",
    concurrency: {
      limit: 5, // Process up to 20 pages in parallel
    },
    retries: 3,
  },
  { event: "page/process.requested" },
  async ({ event, step }) => {
    const {
      pageId,
      jobId,
      domainUrl,
      url,
      rawContent,
      rawMdPath,
      changeStatus,
    } = event.data

    // Step 1: Get job and domain information for processing context
    const { domainInfo, job } = await step.run("get-context", async () => {
      const page = await db.page.getById(pageId)
      if (!page) {
        throw new Error(`Page not found: ${pageId}`)
      }

      const domain = await db.domain.getById(page.domain_id)
      if (!domain) {
        throw new Error(`Domain not found: ${page.domain_id}`)
      }

      const jobData = await db.job.getById(jobId)
      if (!jobData) {
        throw new Error(`Job not found: ${jobId}`)
      }

      // Check if job has been canceled
      if (jobData.status === "canceled") {
        console.warn(
          `🚫 Job ${jobId} has been canceled, skipping processing for: ${url}`,
        )
        throw new Error(`Job has been canceled: ${jobId}`)
      }

      return { domainInfo: domain, job: jobData }
    })

    // Step 2: Clean and process content with OpenRouter
    const processedContent = await step.run(
      "process-with-openrouter",
      async () => {
        console.log(
          `[processUrl] Step 2: Starting OpenRouter processing for URL: ${url}`,
        )

        // First do basic cleaning
        const basicCleaned = cleanContent(rawContent, {
          extractMain: true,
          removeMetadata: true,
        })
        console.log(
          `[processUrl] Basic cleaned content length: ${basicCleaned.length}`,
        )

        // Then enhance with OpenRouter using domain-specific settings
        const systemPrompt =
          domainInfo.prompt_profile?.summary_prompt || undefined
        const model = domainInfo.openrouter_model || "openai/gpt-4o-mini"

        console.log(`[processUrl] Using model: ${model}`)
        console.log(`[processUrl] Has custom prompt: ${!!systemPrompt}`)

        // Use OpenRouter to process the content - no fallback
        console.log("[processUrl] Calling OpenRouter.processPageContent...")
        const enhanced = await openRouter.processPageContent(
          basicCleaned,
          systemPrompt,
          model,
        )
        console.log("[processUrl] OpenRouter processing complete")

        return enhanced
      },
    )

    // Step 3: Store cleaned/processed content to storage
    const storagePaths = await step.run("store-processed-content", async () => {
      // Store OpenRouter-processed markdown
      const processedPath = getProcessedPagePath(
        domainUrl,
        jobId,
        new Date(job.started_at),
        url,
      )
      await storage.upload(
        STORAGE_BUCKETS.ARTIFACTS,
        processedPath,
        processedContent,
      )

      return {
        rawPath: rawMdPath, // Path to raw markdown from Firecrawl (already stored by handleCrawlPage)
        processedPath, // Path to OpenRouter-processed markdown
      }
    })

    // Step 4: Create page version record
    const pageVersion = await step.run("create-page-version", async () => {
      return await db.page.createVersion({
        pageId,
        jobId,
        url,
        rawMdBlobUrl: storagePaths.rawPath, // Markdown directly from Firecrawl
        htmlMdBlobUrl: storagePaths.processedPath, // OpenRouter-processed version
        changeStatus, // Store the changeStatus from Firecrawl
        reason: "Processed with OpenRouter",
        semanticImportance: null, // Will be set by change detection later
      })
    })

    // Step 5: Update page's last known version
    await step.run("update-last-known-version", async () => {
      await db.page.updateLastKnownVersion(pageId, pageVersion.id)
    })

    // Step 6: Increment pages processed counter
    const updatedJob = await step.run("increment-pages-processed", async () => {
      const job = await db.job.incrementPagesProcessed(jobId)
      console.log(`   ✅ Processed page: ${url}`)
      console.log(
        `   📊 Processed: ${job.pages_processed} / Received: ${job.pages_received}`,
      )

      // Check if this was the last page
      if (job.pages_processed === job.pages_received && job.stream_closed) {
        console.log(
          `   🎯 Job ${jobId}: This was the LAST page! Assembly should trigger soon.`,
        )
      }

      return job
    })

    // Step 7: Emit page processed event
    await step.run("emit-page-processed", async () => {
      await sendEvent("page/processed", {
        pageId,
        versionId: pageVersion.id,
        jobId,
        url,
        semanticImportance: null,
        reason: "Processed with OpenRouter",
      })
    })

    return {
      success: true,
      pageId,
      versionId: pageVersion.id,
      url,
      semanticImportance: null,
      reason: "Processed with OpenRouter",
    }
  },
)
