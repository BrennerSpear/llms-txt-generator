import type { NextApiRequest, NextApiResponse } from "next"
import { db } from "~/lib/db"
import { sendEvent } from "~/lib/inngest/client"

/**
 * Production API endpoint to trigger a crawl for a domain
 * POST /api/domains/crawl
 *
 * Body:
 * {
 *   "url": "example.com" or "https://example.com",
 *   "checkIntervalMinutes": 1440 (optional, defaults to 1440 - 24 hours),
 *   "openrouterModel": "openai/gpt-4o-mini" (optional),
 *   "maxPages": 10 (optional, defaults to 10)
 * }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const {
      url,
      checkIntervalMinutes = 1440,
      openrouterModel = "openai/gpt-4o-mini",
      maxPages = 10,
    } = req.body

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" })
    }

    // Normalize the domain (remove protocol, www, trailing slash)
    const normalizedDomain = url
      .replace(/^https?:\/\//, "") // Remove protocol
      .replace(/^www\./, "") // Remove www
      .replace(/\/$/, "") // Remove trailing slash
      .split("/")[0] // Take only domain part

    if (!normalizedDomain) {
      return res.status(400).json({
        error: "Invalid domain format",
        details: "somehow it's nothing",
      })
    }

    // Validate it looks like a domain
    if (!normalizedDomain.includes(".")) {
      return res.status(400).json({
        error: "Invalid domain format",
        details: "Domain must include a TLD (e.g., example.com)",
      })
    }

    // Get or create the domain
    const domain = await db.domain.getOrCreate({
      domain: normalizedDomain,
      checkIntervalMinutes,
      openrouterModel,
      isActive: true,
    })

    // Check if domain is active
    if (!domain.is_active) {
      return res.status(400).json({
        error: "Domain is not active",
        domain: normalizedDomain,
      })
    }

    // Check for active jobs
    const hasActiveJob = await db.job.hasActiveJob(domain.id)
    if (hasActiveJob) {
      // Get the active job details
      const activeJob = await db.job.getLatestForDomain(domain.id)

      return res.status(409).json({
        error: "Domain already has an active crawl job",
        domain: {
          id: domain.id,
          domain: domain.domain,
        },
        activeJob: activeJob
          ? {
              id: activeJob.id,
              status: activeJob.status,
              startedAt: activeJob.started_at,
            }
          : null,
      })
    }

    // Send the ingest requested event to trigger the pipeline
    await sendEvent("domain/ingest.requested", {
      domainId: domain.id,
      type: "initial" as const,
      requestedBy: "api",
      scheduledAt: new Date().toISOString(),
      maxPages,
    })

    // Try to get the job that was just created (might not exist immediately)
    const job = await db.job.getLatestForDomain(domain.id)

    return res.status(202).json({
      success: true,
      message:
        domain.created_at === domain.updated_at
          ? "New domain created and crawl triggered"
          : "Crawl triggered for existing domain",
      domain: {
        id: domain.id,
        domain: domain.domain,
        checkIntervalMinutes: domain.check_interval_minutes,
        isNew: domain.created_at === domain.updated_at,
      },
      job: job
        ? {
            id: job.id,
            status: job.status,
            type: job.type,
            startedAt: job.started_at,
          }
        : null,
    })
  } catch (error) {
    console.error("Error triggering crawl:", error)
    return res.status(500).json({
      error: "Failed to trigger crawl",
      details: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
