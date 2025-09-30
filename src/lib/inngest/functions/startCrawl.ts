import type { Job } from "@prisma/client"
import { env } from "~/env"
import { db } from "~/lib/db"
import { startDomainCrawl } from "~/lib/firecrawl/client"
import { mockFirecrawl } from "~/lib/mocks/firecrawl"
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
    const { domainId, type } = event.data

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

    // Step 3: Start crawl with Firecrawl (or mock)
    const crawlResult = await step.run("initiate-crawl", async () => {
      const domain = validation.domain
      const webhookUrl = `${env.FIRECRAWL_WEBHOOK_URL}/api/webhooks/firecrawl`

      // Use mock service in development or when flag is set
      const useMock =
        env.USE_MOCK_SERVICES ?? process.env.NODE_ENV === "development"

      if (useMock) {
        console.log(`🎭 Using mock Firecrawl for domain: ${domain.domain}`)

        // Start mock crawl using same options format as real Firecrawl
        const result = await mockFirecrawl.startCrawl(
          `https://${domain.domain}`,
          {
            scrapeOptions: {
              formats: [
                "markdown",
                {
                  type: "changeTracking",
                  modes: ["git-diff"],
                  tag: process.env.NODE_ENV ?? "production",
                },
              ],
              proxy: "auto",
              maxAge: Math.max(0, domain.check_interval_minutes * 60_000),
            },
            webhook: {
              url: webhookUrl,
              events: ["page", "completed"],
            },
          },
        )

        return {
          firecrawlJobId: result.id,
          isMock: true,
        }
        // biome-ignore lint/style/noUselessElse: cleaner
      } else {
        // Use real Firecrawl with optimized settings
        const result = await startDomainCrawl(
          `https://${domain.domain}`,
          domain.check_interval_minutes, // TODO need to make sure this matches up with the page's (now() - last crawl time + interval = maxAge)
          webhookUrl,
        )

        return {
          firecrawlJobId: result.id,
          isMock: false,
        }
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
      isMock: crawlResult.isMock,
    }
  },
)
