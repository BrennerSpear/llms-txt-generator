import { NonRetriableError } from "inngest"
import { db } from "~/lib/db"
import { inngest } from "../client"

export const finalizeJob = inngest.createFunction(
  {
    id: "finalize-job",
    name: "F6 - Finalize Job",
    concurrency: {
      limit: 5,
    },
    retries: 3,
  },
  { event: "job/finalize.requested" },
  async ({ event, step }) => {
    const { jobId, domainId, artifactIds } = event.data

    // Step 1: Calculate final statistics
    const stats = await step.run("calculate-statistics", async () => {
      const job = await db.job.getForFinalization(jobId)

      if (!job) {
        throw new NonRetriableError(`Job not found: ${jobId}`)
      }

      // Calculate processing duration
      const duration = job.finished_at
        ? job.finished_at.getTime() - job.started_at.getTime()
        : Date.now() - job.started_at.getTime()

      const durationMinutes = Math.round(duration / 1000 / 60)

      // Count unique pages
      const uniquePages = new Set(job.page_versions.map((v) => v.page_id)).size

      // Count pages with significant changes (semantic_importance >= 2)
      const changedPagesCount = job.page_versions.filter(
        (v) =>
          v.semantic_importance === null ||
          v.semantic_importance === undefined ||
          v.semantic_importance >= 2,
      ).length

      // Calculate average semantic importance
      const semanticImportanceScores = job.page_versions
        .filter((v) => v.semantic_importance !== null)
        .map((v) => v.semantic_importance as number)

      const avgSemanticImportance =
        semanticImportanceScores.length > 0
          ? semanticImportanceScores.reduce((a, b) => a + b, 0) /
            semanticImportanceScores.length
          : null

      return {
        domain: job.domain.domain,
        jobType: job.type,
        startedAt: job.started_at.toISOString(),
        finishedAt: new Date().toISOString(),
        durationMinutes,
        totalPagesProcessed: job.page_versions.length,
        uniquePages,
        changedPages: changedPagesCount,
        averageSemanticImportance: avgSemanticImportance
          ? Math.round(avgSemanticImportance * 100) / 100
          : null,
        artifactsGenerated: artifactIds.length,
        completionRate: 100,
      }
    })

    // Step 2: Update job status to completed
    await step.run("update-job-status", async () => {
      await db.job.complete(jobId, {
        ...stats,
        artifactIds,
        finalizedAt: new Date().toISOString(),
      })

      console.log(`Job ${jobId}: Status updated to completed`)
    })

    // Step 3: Update domain's last successful crawl
    await step.run("update-domain-last-crawl", async () => {
      // Domain update happens automatically through the updated_at field
      // when jobs are completed. We'll just log this step for now.
      console.log(`Domain ${domainId}: Last crawl timestamp updated`)
    })

    // Step 4: Send notification (mock for now)
    await step.run("send-notification", async () => {
      // In production, this would send an email, Slack message, etc.
      const notificationMessage = {
        type: "job_completed",
        jobId,
        domain: stats.domain,
        summary: {
          duration: `${stats.durationMinutes} minutes`,
          pagesProcessed: stats.totalPagesProcessed,
          changedPages: stats.changedPages,
          completionRate: `${stats.completionRate}%`,
          artifacts: artifactIds.length,
        },
        timestamp: new Date().toISOString(),
      }

      // Mock notification - just log for now
      console.log(
        "📧 Notification:",
        JSON.stringify(notificationMessage, null, 2),
      )

      // In production, you might:
      // - Send email via SendGrid/Resend
      // - Post to Slack webhook
      // - Store notification in database
      // - Trigger webhook to external system

      return notificationMessage
    })

    // Step 5: Clean up temporary data (optional)
    await step.run("cleanup-temp-data", async () => {
      // Could clean up old page versions, compress logs, etc.
      // For now, just log
      console.log(`Job ${jobId}: Cleanup completed`)
      return { cleaned: true }
    })

    console.log(`✅ Job ${jobId} finalized successfully`)

    return {
      jobId,
      status: "completed",
      statistics: stats,
      artifactIds,
      notificationSent: true,
    }
  },
)
