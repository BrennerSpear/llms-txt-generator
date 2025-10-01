import { db } from "~/lib/db"
import { openRouter } from "~/lib/openrouter/client"
import { STORAGE_BUCKETS, storage } from "~/lib/storage/client"
import { getProcessedPagePath } from "~/lib/storage/paths"
import { cleanContent } from "~/lib/utils/cleaning"
import {
  calculateSimilarity,
  generateFingerprint,
  hasChangedEnough,
} from "~/lib/utils/fingerprint"
import { inngest, sendEvent } from "../client"

/**
 * F3 - Process Single URL Function
 * Processes a single page: uses OpenRouter to enhance content,
 * computes fingerprint, compares with previous version,
 * and stores version metadata
 */
export const processUrl = inngest.createFunction(
  {
    id: "process-url",
    name: "Process Single URL",
    concurrency: {
      limit: 20, // Process up to 20 pages in parallel
    },
    retries: 3,
  },
  { event: "page/process.requested" },
  async ({ event, step }) => {
    const { pageId, jobId, domainUrl, url, rawContent, rawMdPath } = event.data

    // Step 1: Get domain information for processing context
    const domainInfo = await step.run("get-domain-info", async () => {
      const page = await db.page.getById(pageId)
      if (!page) {
        throw new Error(`Page not found: ${pageId}`)
      }

      const domain = await db.domain.getById(page.domain_id)
      if (!domain) {
        throw new Error(`Domain not found: ${page.domain_id}`)
      }

      return domain
    })

    // Step 2: Clean and process content with OpenRouter
    const processedContent = await step.run(
      "process-with-openrouter",
      async () => {
        // First do basic cleaning
        const basicCleaned = cleanContent(rawContent, {
          extractMain: true,
          removeMetadata: true,
        })

        // Then enhance with OpenRouter using domain-specific settings
        const systemPrompt =
          domainInfo.prompt_profile?.summary_prompt || undefined
        const model = domainInfo.openrouter_model || "openai/gpt-4o-mini"

        // Use OpenRouter to process the content - no fallback
        const enhanced = await openRouter.processPageContent(
          basicCleaned,
          systemPrompt,
          model,
        )

        return enhanced
      },
    )

    // Step 3: Generate content fingerprint
    const fingerprint = await step.run("generate-fingerprint", async () => {
      return generateFingerprint(processedContent)
    })

    // Step 4: Find and compare with previous version
    const comparison = await step.run("compare-with-previous", async () => {
      // Get previous version for this URL
      const previousVersion = await db.page.getPreviousVersionByFingerprint(
        domainInfo.id,
        url,
      )

      if (!previousVersion) {
        // First time seeing this page
        return {
          isNew: true,
          prevFingerprint: null,
          similarityScore: 0,
          changed: true,
          reason: "New page - first time crawled",
        }
      }

      // Skip if content hasn't changed at all
      if (previousVersion.content_fingerprint === fingerprint) {
        return {
          isNew: false,
          prevFingerprint: previousVersion.content_fingerprint,
          similarityScore: 1.0,
          changed: false,
          reason: "Content unchanged - identical fingerprint",
        }
      }

      // Calculate similarity if fingerprints differ
      // For now, we'll need to fetch the previous content from storage
      let previousContent = ""
      try {
        if (previousVersion.raw_md_blob_url) {
          // raw_md_blob_url now contains the full path within the artifacts bucket
          const blob = await storage.download(
            STORAGE_BUCKETS.ARTIFACTS,
            previousVersion.raw_md_blob_url,
          )
          if (blob) {
            previousContent = await blob.text()
          }
        }
      } catch (error) {
        console.error("Failed to fetch previous content for comparison:", error)
      }

      const similarityScore = previousContent
        ? calculateSimilarity(processedContent, previousContent)
        : 0

      const changeAnalysis = hasChangedEnough(similarityScore, {
        threshold: 0.95, // 95% similarity threshold
      })

      return {
        isNew: false,
        prevFingerprint: previousVersion.content_fingerprint,
        similarityScore,
        changed: changeAnalysis.changed,
        reason: changeAnalysis.reason,
      }
    })

    // Step 5: Store cleaned/processed content to storage
    const storagePaths = await step.run("store-processed-content", async () => {
      // Store OpenRouter-processed markdown
      const processedPath = getProcessedPagePath(domainUrl, jobId, url)
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

    // Step 6: Create page version record
    const pageVersion = await step.run("create-page-version", async () => {
      return await db.page.createVersion({
        pageId,
        jobId,
        url,
        rawMdBlobUrl: storagePaths.rawPath, // Markdown directly from Firecrawl
        htmlMdBlobUrl: storagePaths.processedPath, // OpenRouter-processed version
        contentFingerprint: fingerprint,
        prevFingerprint: comparison.prevFingerprint ?? undefined,
        similarityScore: comparison.similarityScore,
        changedEnough: comparison.changed,
        reason: comparison.reason,
      })
    })

    // Step 7: Update page's last known version if content changed
    if (comparison.changed) {
      await step.run("update-last-known-version", async () => {
        await db.page.updateLastKnownVersion(pageId, pageVersion.id)
      })
    }

    // Step 8: Emit page processed event
    await step.run("emit-page-processed", async () => {
      await sendEvent("page/processed", {
        pageId,
        versionId: pageVersion.id,
        jobId,
        url,
        fingerprint,
        changedEnough: comparison.changed,
        similarityScore: comparison.similarityScore,
        reason: comparison.reason,
      })
    })

    return {
      success: true,
      pageId,
      versionId: pageVersion.id,
      url,
      fingerprint,
      isNew: comparison.isNew,
      changed: comparison.changed,
      similarityScore: comparison.similarityScore,
      reason: comparison.reason,
    }
  },
)
