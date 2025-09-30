import type { NextApiRequest, NextApiResponse } from "next"
import { db } from "~/lib/db"

/**
 * Production API endpoint to check job status
 * GET /api/jobs/[jobId]
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { jobId } = req.query

  if (!jobId || typeof jobId !== "string") {
    return res.status(400).json({ error: "Job ID is required" })
  }

  try {
    // Get job details
    const job = await db.job.getById(jobId)

    if (!job) {
      return res.status(404).json({ error: "Job not found" })
    }

    // Get page statistics
    const pageStats = await db.page.countPagesForJob(jobId)

    // Get artifacts for this job
    const artifacts = await db.artifact.getByJobId(jobId)

    // Calculate duration if job is finished
    let duration = null
    if (job.finished_at) {
      duration = Math.round(
        (job.finished_at.getTime() - job.started_at.getTime()) / 1000,
      )
    }

    return res.status(200).json({
      job: {
        id: job.id,
        domainId: job.domain_id,
        type: job.type,
        status: job.status,
        firecrawlJobId: job.firecrawl_job_id,
        startedAt: job.started_at.toISOString(),
        finishedAt: job.finished_at?.toISOString() ?? null,
        duration: duration ? `${duration}s` : null,
        stats: job.stats,
      },
      pages: {
        total: pageStats.total,
        changed: pageStats.changed,
        skipped: pageStats.skipped,
      },
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        kind: artifact.kind,
        version: artifact.version,
        createdAt: artifact.created_at.toISOString(),
      })),
    })
  } catch (error) {
    console.error("Error fetching job status:", error)
    return res.status(500).json({
      error: "Failed to fetch job status",
      details: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
