import type { Document } from "firecrawl"
import type { NextApiRequest, NextApiResponse } from "next"
import { db } from "~/lib/db"
import { sendEvent } from "~/lib/inngest/client"

/**
 * Webhook endpoint for Firecrawl events
 * POST /api/webhooks/firecrawl
 *
 * Receives webhook events from Firecrawl (or mock simulator)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    // TODO: Verify webhook signature in production
    // const signature = req.headers['x-firecrawl-signature']
    // if (!verifySignature(signature, req.body)) {
    //   return res.status(401).json({ error: "Invalid signature" })
    // }

    const { type, id: firecrawlJobId, data, ...rest } = req.body
    console.log(
      `🔍crawl.page Webhook received: ${JSON.stringify(rest, null, 2)}`,
    )

    // Handle different webhook event types
    switch (type) {
      case "crawl.started": {
        console.log(`📋 Webhook: Crawl started for job ${firecrawlJobId}`)
        // We handle this in the startCrawl function, so just acknowledge
        return res.status(200).json({ received: true, type })
      }

      case "crawl.page": {
        // Get the job from our database using Firecrawl job ID
        const job = await db.job.getByFirecrawlId(firecrawlJobId)
        if (!job) {
          console.error(`Job not found for Firecrawl ID: ${firecrawlJobId}`)
          return res.status(404).json({
            error: "Job not found",
            firecrawlJobId,
          })
        }

        // Data is an array of documents for crawl.page
        const documents = data as Document[]

        // Process each document in the array
        for (const document of documents) {
          // Extract URL from metadata (where it actually lives in the webhook payload)
          const url: string =
            (document.metadata?.sourceURL as string) ||
            (document.metadata?.url as string) ||
            ""
          console.log(`📄 Webhook: Page received for ${url}`)

          // Send event to Inngest for processing
          await sendEvent("domain/crawl.page", {
            domainId: job.domain_id,
            jobId: job.id,
            firecrawlJobId,
            url, // URL comes from metadata
            markdown: document.markdown || "",
            metadata: document.metadata,
            changeTracking: document.changeTracking || {},
            timestamp: new Date().toISOString(),
          })
        }

        return res.status(200).json({
          received: true,
          type,
          documentCount: documents.length,
        })
      }

      case "crawl.completed": {
        const job = await db.job.getByFirecrawlId(firecrawlJobId)

        console.log(
          `🔍 crawl.completed data: ${JSON.stringify(req.body, null, 2)}`,
        )

        if (!job) {
          console.error(`Job not found for Firecrawl ID: ${firecrawlJobId}`)
          return res.status(404).json({
            error: "Job not found",
            firecrawlJobId,
          })
        }

        console.log(`✅ Webhook: Crawl completed for job ${job.id}`)

        // Send completion event to Inngest
        await sendEvent("domain/crawl.completed", {
          domainId: job.domain_id,
          jobId: job.id,
          firecrawlJobId,
          completedAt: new Date().toISOString(),
          stats: {
            duration: 0, // Will be calculated in the handler
            pagesProcessed: data.pagesScraped || 0,
            errors: 0,
          },
        })

        return res.status(200).json({
          received: true,
          type,
          totalPages: data.totalPages || data.pagesScraped || 0,
        })
      }

      case "crawl.failed": {
        const job = await db.job.getByFirecrawlId(firecrawlJobId)

        if (!job) {
          console.error(`Job not found for Firecrawl ID: ${firecrawlJobId}`)
          return res.status(404).json({
            error: "Job not found",
            firecrawlJobId,
          })
        }

        console.error(
          `❌ Webhook: Crawl failed for job ${job.id}: ${data.error}`,
        )

        // Send failure event to Inngest
        await sendEvent("domain/crawl.failed", {
          domainId: job.domain_id,
          jobId: job.id,
          firecrawlJobId,
          error: data.error || "Unknown error",
          failedAt: new Date().toISOString(),
        })

        return res.status(200).json({
          received: true,
          type,
          error: data.error,
        })
      }

      default:
        console.warn(`Unknown webhook event type: ${type}`)
        return res.status(400).json({
          error: "Unknown event type",
          type,
        })
    }
  } catch (error) {
    console.error("Webhook processing error:", error)
    return res.status(500).json({
      error: "Failed to process webhook",
      details: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
