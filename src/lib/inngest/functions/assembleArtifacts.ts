import { NonRetriableError } from "inngest"
import { db } from "~/lib/db"
import { STORAGE_BUCKETS, storage } from "~/lib/storage/client"
import { getLlmsFullTxtPath, getLlmsTxtPath } from "~/lib/storage/paths"
import { inngest } from "../client"

export const assembleArtifacts = inngest.createFunction(
  {
    id: "assemble-artifacts",
    name: "F5 - Assemble Artifacts",
    concurrency: {
      limit: 20,
    },
    retries: 3,
  },
  { event: "job/assemble.requested" },
  async ({ event, step }) => {
    const { jobId, domainId, completedPages } = event.data

    // Step 1: Collect all page versions for the job
    const pageVersions = await step.run("collect-page-versions", async () => {
      const versions = await db.page.getChangedPagesForJob(jobId)

      if (versions.length === 0) {
        console.log(`Job ${jobId}: No changed pages to assemble`)
        return []
      }

      console.log(
        `Job ${jobId}: Found ${versions.length} changed pages to assemble`,
      )
      return versions
    })

    // Step 2: Build llms.txt content
    const llmsTxtContent = await step.run("build-llms-txt", async () => {
      if (pageVersions.length === 0) {
        return null
      }

      // Get domain info for header
      const job = await db.job.getById(jobId)

      if (!job) {
        throw new NonRetriableError(`Job not found: ${jobId}`)
      }

      const domain = job.domain

      // Build header (simplified version, no prompt profile for now)
      const header = `# ${domain.domain}\n\nAI-readable content extracted from ${domain.domain}\n\n`

      // Collect summaries from each page
      const summaries: string[] = []

      for (const version of pageVersions) {
        // For now, we'll use a basic format
        // In production, this would call OpenRouter for actual summarization
        const pageUrl = version.page.url
        const pageTitle = pageUrl.split("/").pop() || "page"

        // Mock summary for now
        const summary = `## ${pageTitle}\nURL: ${pageUrl}\nContent from ${domain.domain}`
        summaries.push(summary)
      }

      // Assemble final content
      const content = [
        header,
        `Generated: ${new Date().toISOString()}`,
        `Pages processed: ${pageVersions.length}`,
        "",
        "---",
        "",
        ...summaries,
      ].join("\n")

      return content
    })

    // Step 3: Build llms-full.txt content
    const llmsFullTxtContent = await step.run(
      "build-llms-full-txt",
      async () => {
        if (pageVersions.length === 0) {
          return null
        }

        // Get domain info
        const job = await db.job.getById(jobId)

        if (!job) {
          throw new NonRetriableError(`Job not found: ${jobId}`)
        }

        const sections: string[] = []

        // Add header
        sections.push(`# Full Content - ${job.domain.domain}`)
        sections.push(`Generated: ${new Date().toISOString()}`)
        sections.push(`Total pages: ${pageVersions.length}\n`)
        sections.push("---\n")

        // Add full content from each page
        for (const version of pageVersions) {
          if (version.html_md_blob_url) {
            try {
              // Download the processed content from storage
              // html_md_blob_url now contains the full path within the artifacts bucket
              const result = await storage.download(
                STORAGE_BUCKETS.ARTIFACTS,
                version.html_md_blob_url,
              )

              if (result) {
                const content = await result.text()
                sections.push(`## ${version.page.url}`)
                sections.push(content)
                sections.push("\n---\n")
              }
            } catch (error) {
              console.error(
                `Failed to fetch content for ${version.page.url}:`,
                error,
              )
            }
          }
        }

        return sections.join("\n")
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

      if (llmsTxtContent) {
        // Store llms.txt
        const llmsTxtPath = getLlmsTxtPath(job.domain.domain, jobId)
        const uploadResult = await storage.upload(
          STORAGE_BUCKETS.ARTIFACTS,
          llmsTxtPath,
          llmsTxtContent,
        )

        if (uploadResult) {
          // Create artifact record
          const artifact = await db.artifact.create({
            jobId,
            kind: "llms_txt",
            blobUrl: llmsTxtPath,
            version: 1,
          })
          ids.push(artifact.id)
        }
      }

      if (llmsFullTxtContent) {
        // Store llms-full.txt
        const llmsFullPath = getLlmsFullTxtPath(job.domain.domain, jobId)
        const uploadResult = await storage.upload(
          STORAGE_BUCKETS.ARTIFACTS,
          llmsFullPath,
          llmsFullTxtContent,
        )

        if (uploadResult) {
          // Create artifact record
          const artifact = await db.artifact.create({
            jobId,
            kind: "llms_full_txt",
            blobUrl: llmsFullPath,
            version: 1,
          })
          ids.push(artifact.id)
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

    return {
      jobId,
      artifactsCreated: artifactIds.length,
      artifactIds,
      changedPages: pageVersions.length,
    }
  },
)
