import type { Job } from "@prisma/client"
import { env } from "~/env"
import { db } from "~/lib/db"
import { startDomainCrawl } from "~/lib/firecrawl/client"
import { NonRetriableError, inngest, sendEvent } from "../client"

/**
 * F1 - Start Crawl Function
 * Initiates a crawl job for a domain
 */
export const startCrawl = inngest.createFunction(
  {
    id: "start-crawl",
    name: "Start Domain Crawl",
    concurrency: {
      limit: 10, // Global limit on concurrent crawls
      key: "event.data.domainId", // Per-domain concurrency limit of 1
    },
    retries: 3,
  },
  { event: "domain/ingest.requested" },
  async ({ event, step }) => {
    const { domainId, type, maxPages } = event.data

    // Step 1: Validate domain and check for active jobs
    const validation = await step.run("validate-domain", async () => {
      // Get domain details
      const domain = await db.domain.getById(domainId)
      if (!domain) {
        throw new NonRetriableError(`Domain not found: ${domainId}`)
      }

      if (!domain.is_active) {
        throw new NonRetriableError(`Domain is not active: ${domainId}`)
      }

      // Check for existing active job
      const hasActiveJob = await db.job.hasActiveJob(domainId)
      if (hasActiveJob) {
        throw new NonRetriableError(
          `Domain already has an active job: ${domainId}`,
        )
      }

      return { domain }
    })

    // Step 2: Create job in database
    const job = await step.run("create-job", async () => {
      return await db.job.create({
        domainId,
        type,
      })
    })

    // Step 3: Start crawl with Firecrawl
    const crawlResult = await step.run("initiate-crawl", async () => {
      const domain = validation.domain
      const webhookUrl = `${env.FIRECRAWL_WEBHOOK_URL}/api/webhooks/firecrawl`

      const result = await startDomainCrawl(
        `https://${domain.domain}`,
        domain.check_interval_minutes,
        webhookUrl,
        maxPages ?? 10, // Default to 10 pages if not specified
      )

      return {
        firecrawlJobId: result.id,
      }
    })

    // Step 4: Update job with Firecrawl job ID
    await step.run("update-job-with-firecrawl-id", async () => {
      await db.job.updateFirecrawlJobId(
        job.id,
        crawlResult.firecrawlJobId as string,
      )
    })

    return {
      jobId: job.id,
      domainId,
      firecrawlJobId: crawlResult.firecrawlJobId,
      type,
    }
  },
)
