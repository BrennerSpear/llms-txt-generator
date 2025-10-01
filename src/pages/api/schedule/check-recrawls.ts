import type { NextApiRequest, NextApiResponse } from "next"
import { db } from "~/server/db"

/**
 * API endpoint to check which domains are due for recrawling
 * GET /api/schedule/check-recrawls
 *
 * Returns a list of domains that are due for recrawl based on their
 * check_interval_minutes setting and last finished job.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
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
    const dueDomains = domains
      .filter((domain) => {
        // Skip domains with no finished jobs
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

        return minutesSinceLastCrawl >= domain.check_interval_minutes
      })
      .map((domain) => {
        const lastJob = domain.jobs[0]
        return {
          id: domain.id,
          domain: domain.domain,
          checkIntervalMinutes: domain.check_interval_minutes,
          lastCrawledAt: lastJob?.finished_at?.toISOString() || null,
          minutesSinceLastCrawl: lastJob?.finished_at
            ? Math.floor(
                (now.getTime() - lastJob.finished_at.getTime()) / (1000 * 60),
              )
            : null,
        }
      })

    // Check for any ongoing jobs for these domains
    if (dueDomains.length > 0) {
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

      return res.status(200).json({
        domains: availableDomains,
        total: availableDomains.length,
        skippedDueToOngoingJobs: dueDomains.length - availableDomains.length,
      })
    }

    return res.status(200).json({
      domains: [],
      total: 0,
      skippedDueToOngoingJobs: 0,
    })
  } catch (error) {
    console.error("Error checking recrawls:", error)
    return res.status(500).json({
      error: "Failed to check recrawls",
      details: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
