import { NonRetriableError } from "inngest"
import { db } from "~/lib/db"
import { generateLlmsFullTxt, generateLlmsTxt } from "~/lib/llms-txt"
import { STORAGE_BUCKETS, storage } from "~/lib/storage/client"
import { getLlmsFullTxtPath, getLlmsTxtPath } from "~/lib/storage/paths"
import { inngest } from "../client"

export const assembleArtifacts = inngest.createFunction(
  {
    id: "assemble-artifacts",
    name: "F5 - Assemble Artifacts",
    concurrency: {
      limit: 5,
    },
    retries: 3,
  },
  { event: "job/assemble.requested" },
  async ({ event, step }) => {
    const { jobId, domainId, completedPages } = event.data

    // Step 1: Check all page versions' changeStatus
    const shouldGenerate = await step.run("check-change-status", async () => {
      // Get ALL page versions for the job to check their changeStatus
      const allVersions = await db.page.getAllPageVersionsForJob(jobId)

      // Check if all pages have changeStatus === "same"
      const allSame = allVersions.every(
        (version) => version.change_status === "same",
      )

      if (allSame && allVersions.length > 0) {
        console.log(
          `Job ${jobId}: All ${allVersions.length} pages have changeStatus="same", skipping artifact generation`,
        )
        return false
      }

      // Filter for changed pages with semantic_importance >= 2
      // null or undefined semantic_importance means the page should be included (backward compatibility)
      const changedVersions = allVersions.filter(
        (version) =>
          version.semantic_importance === null ||
          version.semantic_importance === undefined ||
          version.semantic_importance >= 2,
      )

      if (changedVersions.length === 0) {
        console.log(`Job ${jobId}: No significantly changed pages to assemble`)
        return false
      }

      console.log(
        `Job ${jobId}: Found ${changedVersions.length} pages to assemble`,
      )
      return true
    })

    // If all pages have changeStatus="same", skip artifact generation
    if (!shouldGenerate) {
      // Still emit finalization event but with no artifacts
      await step.sendEvent("emit-finalize-event", {
        name: "job/finalize.requested",
        data: {
          jobId,
          domainId,
          artifactIds: [],
        },
      })

      return {
        jobId,
        artifactsCreated: 0,
        artifactIds: [],
        changedPages: 0,
        skippedReason: "All pages have changeStatus=same",
      }
    }

    // Step 2: Build llms.txt content
    const llmsTxtContent = await step.run("build-llms-txt", async () => {
      // Get domain info
      const job = await db.job.getById(jobId)

      if (!job) {
        throw new NonRetriableError(`Job not found: ${jobId}`)
      }

      // Check if job has been canceled
      if (job.status === "canceled") {
        console.warn(
          `🚫 Job ${jobId} has been canceled, skipping artifact assembly`,
        )
        throw new NonRetriableError(`Job has been canceled: ${jobId}`)
      }

      // Re-fetch changed pages for this step
      const changedPageVersions = await db.page.getChangedPagesForJob(jobId)

      if (changedPageVersions.length === 0) {
        return null
      }

      try {
        const content = await generateLlmsTxt({
          domain: job.domain.domain,
          pageVersions: changedPageVersions,
          jobId,
        })

        return content
      } catch (error) {
        console.error("Failed to generate llms.txt:", error)
        throw new NonRetriableError(
          `Failed to generate llms.txt: ${error instanceof Error ? error.message : "Unknown error"}`,
        )
      }
    })

    // Step 3: Build llms-full.txt content
    const llmsFullTxtContent = await step.run(
      "build-llms-full-txt",
      async () => {
        // Get domain info
        const job = await db.job.getById(jobId)

        if (!job) {
          throw new NonRetriableError(`Job not found: ${jobId}`)
        }

        // Re-fetch changed pages for this step
        const changedPageVersions = await db.page.getChangedPagesForJob(jobId)

        if (changedPageVersions.length === 0) {
          return null
        }

        try {
          const content = await generateLlmsFullTxt({
            domain: job.domain.domain,
            pageVersions: changedPageVersions,
            jobId,
          })

          return content
        } catch (error) {
          console.error("Failed to generate llms-full.txt:", error)
          throw new NonRetriableError(
            `Failed to generate llms-full.txt: ${error instanceof Error ? error.message : "Unknown error"}`,
          )
        }
      },
    )

    // Step 4: Store artifacts to Supabase Storage
    const artifactIds = await step.run("store-artifacts", async () => {
      const ids: string[] = []

      // Get job info to get domain for path generation
      const job = await db.job.getById(jobId)
      if (!job) {
        throw new NonRetriableError(`Job not found: ${jobId}`)
      }

      // Get next version numbers for each artifact type
      const [llmsTxtVersion, llmsFullTxtVersion] = await Promise.all([
        db.artifact.getNextVersion(domainId, "llms_txt"),
        db.artifact.getNextVersion(domainId, "llms_full_txt"),
      ])

      if (llmsTxtContent) {
        // Store llms.txt
        const llmsTxtPath = getLlmsTxtPath(
          job.domain.domain,
          jobId,
          new Date(job.started_at),
        )
        const uploadResult = await storage.upload(
          STORAGE_BUCKETS.ARTIFACTS,
          llmsTxtPath,
          llmsTxtContent,
        )

        if (uploadResult) {
          // Create artifact record with proper version
          const artifact = await db.artifact.create({
            jobId,
            kind: "llms_txt",
            blobUrl: llmsTxtPath,
            version: llmsTxtVersion,
          })
          ids.push(artifact.id)
          console.log(`Created llms_txt artifact version ${llmsTxtVersion}`)
        }
      }

      if (llmsFullTxtContent) {
        // Store llms-full.txt
        const llmsFullPath = getLlmsFullTxtPath(
          job.domain.domain,
          jobId,
          new Date(job.started_at),
        )
        const uploadResult = await storage.upload(
          STORAGE_BUCKETS.ARTIFACTS,
          llmsFullPath,
          llmsFullTxtContent,
        )

        if (uploadResult) {
          // Create artifact record with proper version
          const artifact = await db.artifact.create({
            jobId,
            kind: "llms_full_txt",
            blobUrl: llmsFullPath,
            version: llmsFullTxtVersion,
          })
          ids.push(artifact.id)
          console.log(
            `Created llms_full_txt artifact version ${llmsFullTxtVersion}`,
          )
        }
      }

      console.log(`Job ${jobId}: ${ids.length} artifacts created`)
      return ids
    })

    // Step 5: Emit finalization event
    await step.sendEvent("emit-finalize-event", {
      name: "job/finalize.requested",
      data: {
        jobId,
        domainId,
        artifactIds,
      },
    })

    // Count the changed pages
    const changedPageCount = await step.run("count-changed-pages", async () => {
      const changedVersions = await db.page.getChangedPagesForJob(jobId)
      return changedVersions.length
    })

    return {
      jobId,
      artifactsCreated: artifactIds.length,
      artifactIds,
      changedPages: changedPageCount,
    }
  },
)
