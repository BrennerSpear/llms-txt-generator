import { inngest, sendEvents } from "~/lib/inngest/client"
import type { Events } from "~/lib/inngest/client"
import { db } from "~/server/db"

/**
 * F0 - Schedule Recrawls
 *
 * Runs hourly to check which domains are due for recrawling based on their
 * check_interval_minutes setting. Emits domain/ingest.requested events for
 * each due domain.
 *
 * From spec:
 * - Trigger: Cron (hourly)
 * - Pattern: Load active domains, compute due set where now() - last_finished_at >= check_interval_minutes
 * - Fan-out: One event per due domain
 * - No concurrency limits here - enforced in F1 (startCrawl)
 */
export const scheduleRecrawls = inngest.createFunction(
  {
    id: "schedule-recrawls",
    name: "F0 - Schedule Domain Recrawls",
    // Run every hour
    // No concurrency limits at this level - let F1 handle that
  },
  [
    { cron: "0 * * * *" }, // Every hour at minute 0
    { event: "schedule-recrawls/manual" }, // Manual trigger
  ],
  async ({ step, logger, event }) => {
    // Log if manually triggered
    if (event.name === "schedule-recrawls/manual") {
      logger.info(
        `Schedule recrawls manually triggered by ${event.data.triggeredBy} at ${event.data.timestamp}`,
      )
    }

    // Step 1: Load active domains and their last job info
    const dueDomains = await step.run("load-due-domains", async () => {
      const now = new Date()

      // Get all active domains with their most recent finished job
      const domains = await db.domain.findMany({
        where: {
          is_active: true,
        },
        include: {
          jobs: {
            where: {
              status: "finished",
            },
            orderBy: {
              finished_at: "desc",
            },
            take: 1,
          },
        },
      })

      // Filter to domains that are due for recrawl
      const due = domains.filter((domain) => {
        // Skip domains with no finished jobs (shouldn't happen)
        if (domain.jobs.length === 0) {
          return false
        }

        const lastJob = domain.jobs[0]
        if (!lastJob || !lastJob.finished_at) {
          return false
        }

        // Calculate if enough time has passed since last crawl
        const minutesSinceLastCrawl = Math.floor(
          (now.getTime() - lastJob.finished_at.getTime()) / (1000 * 60),
        )

        const isDue = minutesSinceLastCrawl >= domain.check_interval_minutes

        if (isDue) {
          logger.info(
            `Domain ${domain.domain} is due for recrawl: ` +
              `${minutesSinceLastCrawl} minutes since last crawl ` +
              `(interval: ${domain.check_interval_minutes} minutes)`,
          )
        }

        return isDue
      })

      logger.info(
        `Found ${due.length} domains due for recrawl out of ${domains.length} active domains`,
      )
      return due
    })

    // Step 2: Check if there are any ongoing jobs for these domains
    const domainsToRecrawl = await step.run("filter-ongoing-jobs", async () => {
      if (dueDomains.length === 0) {
        return []
      }

      // Check for any processing jobs for these domains
      const ongoingJobs = await db.job.findMany({
        where: {
          domain_id: {
            in: dueDomains.map((d) => d.id),
          },
          status: "processing",
        },
        select: {
          domain_id: true,
        },
      })

      const ongoingDomainIds = new Set(ongoingJobs.map((j) => j.domain_id))

      // Filter out domains with ongoing jobs
      const availableDomains = dueDomains.filter(
        (domain) => !ongoingDomainIds.has(domain.id),
      )

      if (ongoingDomainIds.size > 0) {
        logger.info(
          `Skipping ${ongoingDomainIds.size} domains with ongoing jobs`,
        )
      }

      return availableDomains
    })

    // Step 3: Send events for each domain that needs recrawling
    if (domainsToRecrawl.length > 0) {
      await step.run("send-crawl-events", async () => {
        const events = domainsToRecrawl.map((domain) => ({
          name: "domain/ingest.requested" as const,
          data: {
            domainId: domain.id,
            type: "update" as const,
            requestedBy: "scheduler",
            scheduledAt: new Date().toISOString(),
          } satisfies Events["domain/ingest.requested"]["data"],
        }))

        await sendEvents(events)

        logger.info(
          `Sent ${events.length} domain/ingest.requested events for scheduled recrawls`,
        )

        return {
          domainsScheduled: domainsToRecrawl.map((d) => d.domain),
          count: domainsToRecrawl.length,
        }
      })
    }

    return {
      domainsChecked: dueDomains.length,
      domainsScheduled: domainsToRecrawl.length,
      domains: domainsToRecrawl.map((d) => ({
        domain: d.domain,
        checkInterval: d.check_interval_minutes,
      })),
    }
  },
)
