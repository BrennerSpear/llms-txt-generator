import { db } from "~/lib/db"
import { STORAGE_BUCKETS, storage } from "~/lib/storage/client"
import { cleanContent } from "~/lib/utils/cleaning"
import {
  calculateSimilarity,
  generateFingerprint,
  hasChangedEnough,
} from "~/lib/utils/fingerprint"
import { inngest, sendEvent } from "../client"

/**
 * F3 - Process Single URL Function
 * Processes a single page: cleans content, computes fingerprint,
 * compares with previous version, and stores version metadata
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
    const { pageId, jobId, url, rawContent, rawMdPath } = event.data

    // Step 1: Clean and process content
    const cleanedContent = await step.run("clean-content", async () => {
      return cleanContent(rawContent, {
        extractMain: true,
        removeMetadata: true,
      })
    })

    // Step 2: Generate content fingerprint
    const fingerprint = await step.run("generate-fingerprint", async () => {
      return generateFingerprint(cleanedContent)
    })

    // Step 3: Find and compare with previous version
    const comparison = await step.run("compare-with-previous", async () => {
      // Get the page record to find domain
      const page = await db.page.getById(pageId)
      if (!page) {
        throw new Error(`Page not found: ${pageId}`)
      }

      // Get previous version for this URL
      const previousVersion = await db.page.getPreviousVersionByFingerprint(
        page.domain_id,
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
          const path = previousVersion.raw_md_blob_url
            .split("/")
            .slice(-3)
            .join("/")
          const blob = await storage.download(
            STORAGE_BUCKETS.PAGE_CONTENT,
            path,
          )
          if (blob) {
            previousContent = await blob.text()
          }
        }
      } catch (error) {
        console.error("Failed to fetch previous content for comparison:", error)
      }

      const similarityScore = previousContent
        ? calculateSimilarity(cleanedContent, previousContent)
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

    // Step 4: Store cleaned/processed content to storage
    const storagePaths = await step.run("store-cleaned-content", async () => {
      const timestamp = Date.now()
      const urlSlug = url.replace(/[^a-z0-9]/gi, "_").toLowerCase()

      // Store cleaned/processed markdown (this will be the OpenRouter processed version eventually)
      const processedPath = `jobs/${jobId}/processed/${urlSlug}_${timestamp}.md`
      await storage.upload(
        STORAGE_BUCKETS.PAGE_CONTENT,
        processedPath,
        cleanedContent,
      )

      return {
        rawPath: rawMdPath, // Path to raw markdown from Firecrawl (already stored by handleCrawlPage)
        processedPath, // Path to cleaned/processed markdown (will be OpenRouter output)
      }
    })

    // Step 5: Create page version record
    const pageVersion = await step.run("create-page-version", async () => {
      return await db.page.createVersion({
        pageId,
        jobId,
        url,
        rawMdBlobUrl: storagePaths.rawPath, // Markdown directly from Firecrawl
        htmlMdBlobUrl: storagePaths.processedPath, // Processed/cleaned version (will be from OpenRouter)
        contentFingerprint: fingerprint,
        prevFingerprint: comparison.prevFingerprint ?? undefined,
        similarityScore: comparison.similarityScore,
        changedEnough: comparison.changed,
        reason: comparison.reason,
      })
    })

    // Step 6: Update page's last known version if content changed
    if (comparison.changed) {
      await step.run("update-last-known-version", async () => {
        await db.page.updateLastKnownVersion(pageId, pageVersion.id)
      })
    }

    // Step 7: Emit page processed event
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
