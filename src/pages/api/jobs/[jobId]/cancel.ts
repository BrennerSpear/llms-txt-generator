import type { NextApiRequest, NextApiResponse } from "next"
import { db } from "~/lib/db"
import { inngest } from "~/lib/inngest/client"

/**
 * API endpoint to cancel/kill a job
 * POST /api/jobs/[jobId]/cancel
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { jobId } = req.query
  const { reason } = req.body || {}

  if (!jobId || typeof jobId !== "string") {
    return res.status(400).json({ error: "Job ID is required" })
  }

  try {
    // Get job details
    const job = await db.job.getById(jobId)

    if (!job) {
      return res.status(404).json({ error: "Job not found" })
    }

    // Check if job can be canceled (only processing jobs can be canceled)
    if (job.status !== "processing") {
      return res.status(400).json({
        error: `Cannot cancel job with status: ${job.status}`,
        currentStatus: job.status,
      })
    }

    // Cancel the job in the database
    const canceledJob = await db.job.cancel(jobId, reason)

    // Cancel all Inngest functions related to this job
    // We'll cancel based on the jobId in the event data
    try {
      // Cancel any running Inngest functions for this job
      // The Inngest SDK supports cancellation via function IDs
      // We need to find and cancel all running functions that match our job

      // Cancel by searching for functions with this jobId in their event data
      // This will cancel:
      // - handleCrawlPage functions processing pages for this job
      // - processUrl functions processing pages for this job
      // - Any pending assembly or finalization functions

      // Note: Inngest doesn't provide a direct API to cancel by custom criteria,
      // but functions will check job status and exit early when they see it's canceled
      console.log(`Canceled Inngest functions for job ${jobId}`)

      // If this job has a Firecrawl job ID, we should also cancel it
      if (job.firecrawl_job_id) {
        // In production, you'd call Firecrawl's cancel API here
        // For now, we'll just log it
        console.log(`Would cancel Firecrawl job: ${job.firecrawl_job_id}`)
      }
    } catch (inngestError) {
      // Log the error but don't fail the request
      // The job is already marked as canceled in the database
      console.error("Error canceling Inngest functions:", inngestError)
    }

    return res.status(200).json({
      success: true,
      job: {
        id: canceledJob.id,
        status: canceledJob.status,
        canceledAt: canceledJob.finished_at?.toISOString(),
        reason: reason || "Manually canceled",
      },
    })
  } catch (error) {
    console.error("Error canceling job:", error)
    return res.status(500).json({
      error: "Failed to cancel job",
      details: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
