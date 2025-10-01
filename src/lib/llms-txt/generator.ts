/**
 * Main generator for llms.txt and llms-full.txt files
 * Handles both mock and production OpenRouter-based generation
 */

import type { Page, PageVersion } from "@prisma/client"
import { env } from "~/env"
import { STORAGE_BUCKETS, storage } from "~/lib/storage/client"
import { openRouterService } from "./openrouter-client"

interface PageVersionWithPage extends PageVersion {
  page: Page
}

interface GeneratorOptions {
  domain: string
  pageVersions: PageVersionWithPage[]
  jobId: string
  useMock?: boolean
}

/**
 * Generate llms.txt content - either mock or using OpenRouter
 */
export async function generateLlmsTxt({
  domain,
  pageVersions,
  jobId,
  useMock = env.USE_MOCK_SERVICES ?? env.NODE_ENV === "development",
}: GeneratorOptions): Promise<string | null> {
  if (pageVersions.length === 0) {
    return null
  }

  if (useMock) {
    return generateMockLlmsTxt(domain, pageVersions)
  }

  return generateOpenRouterLlmsTxt(domain, pageVersions)
}

/**
 * Generate mock llms.txt for development
 */
function generateMockLlmsTxt(
  domain: string,
  pageVersions: PageVersionWithPage[],
): string {
  const header = `# ${domain}\n\nAI-readable content extracted from ${domain}\n\n`
  const summaries: string[] = []

  for (const version of pageVersions) {
    const pageUrl = version.page.url
    const pageTitle = pageUrl.split("/").pop() || "page"
    const summary = `## ${pageTitle}\nURL: ${pageUrl}\nContent from ${domain}`
    summaries.push(summary)
  }

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
}

/**
 * Generate llms.txt using OpenRouter AI
 */
async function generateOpenRouterLlmsTxt(
  domain: string,
  pageVersions: PageVersionWithPage[],
): Promise<string> {
  console.log(
    `Building llms.txt with OpenRouter for ${pageVersions.length} pages`,
  )

  // Prepare page data with content
  const pagesWithContent = await Promise.all(
    pageVersions.map(async (version) => {
      let content = ""

      if (version.html_md_blob_url) {
        try {
          const result = await storage.download(
            STORAGE_BUCKETS.ARTIFACTS,
            version.html_md_blob_url,
          )
          if (result) {
            content = await result.text()
          }
        } catch (error) {
          console.error(
            `Failed to fetch content for ${version.page.url}:`,
            error,
          )
        }
      }

      return {
        url: version.page.url,
        content: content.slice(0, 5000), // Limit content for API calls
        title: version.page.url.split("/").pop() || undefined,
      }
    }),
  )

  // Generate the enhanced llms.txt using OpenRouter
  const llmsTxt = await openRouterService.generateLlmsTxt(
    domain,
    pagesWithContent,
  )

  console.log("Successfully generated llms.txt with OpenRouter")
  return llmsTxt
}

/**
 * Generate llms-full.txt content with all page content
 */
export async function generateLlmsFullTxt({
  domain,
  pageVersions,
  jobId,
}: GeneratorOptions): Promise<string | null> {
  if (pageVersions.length === 0) {
    return null
  }

  const sections: string[] = []

  // Add professional header
  sections.push(`# ${domain} - Complete Documentation`)
  sections.push("")
  sections.push(`> Comprehensive content archive from ${domain}`)
  sections.push("")
  sections.push("## Metadata")
  sections.push("")
  sections.push(`- **Generated:** ${new Date().toISOString()}`)
  sections.push(`- **Total Pages:** ${pageVersions.length}`)
  sections.push(`- **Job ID:** ${jobId}`)
  sections.push("")
  sections.push("---")
  sections.push("")

  // Sort pages by URL for better organization
  const sortedVersions = [...pageVersions].sort((a, b) =>
    a.page.url.localeCompare(b.page.url),
  )

  // Group pages by path segments for organization
  const pagesByPath = groupPagesByPath(sortedVersions)

  // Add table of contents if multiple categories
  if (Object.keys(pagesByPath).length > 1) {
    sections.push(...generateTableOfContents(pagesByPath))
  }

  // Add full content from each page organized by category
  for (const [category, versions] of Object.entries(pagesByPath)) {
    sections.push(`## ${category}`)
    sections.push("")

    for (const version of versions) {
      const pageContent = await fetchPageContent(version)
      if (pageContent) {
        sections.push(...formatPageSection(version, pageContent))
      }
    }
  }

  // Add footer
  sections.push("## End of Document")
  sections.push("")
  sections.push(
    `This document contains the complete crawled content from ${domain}.`,
  )
  sections.push(
    "Use the llms.txt file for a summarized version optimized for LLM consumption.",
  )

  return sections.join("\n")
}

/**
 * Group pages by their URL path segments
 */
function groupPagesByPath(
  pageVersions: PageVersionWithPage[],
): Record<string, PageVersionWithPage[]> {
  const pagesByPath: Record<string, PageVersionWithPage[]> = {}

  for (const version of pageVersions) {
    try {
      const urlPath = new URL(version.page.url).pathname
      const pathSegments = urlPath.split("/").filter((s) => s)
      const category = pathSegments[0] || "root"

      if (!pagesByPath[category]) {
        pagesByPath[category] = []
      }
      pagesByPath[category].push(version)
    } catch (error) {
      // If URL parsing fails, put in "other" category
      if (!pagesByPath.other) {
        pagesByPath.other = []
      }
      pagesByPath.other.push(version)
    }
  }

  return pagesByPath
}

/**
 * Generate table of contents for llms-full.txt
 */
function generateTableOfContents(
  pagesByPath: Record<string, PageVersionWithPage[]>,
): string[] {
  const sections: string[] = []

  sections.push("## Table of Contents")
  sections.push("")

  for (const category of Object.keys(pagesByPath)) {
    const categoryPages = pagesByPath[category]
    const count = categoryPages ? categoryPages.length : 0
    sections.push(`- [${category}](#${category}) (${count} pages)`)
  }

  sections.push("")
  sections.push("---")
  sections.push("")

  return sections
}

/**
 * Fetch content for a page version from storage
 */
async function fetchPageContent(
  version: PageVersionWithPage,
): Promise<string | null> {
  if (!version.html_md_blob_url) {
    return null
  }

  try {
    const result = await storage.download(
      STORAGE_BUCKETS.ARTIFACTS,
      version.html_md_blob_url,
    )

    if (result) {
      return await result.text()
    }
  } catch (error) {
    console.error(`Failed to fetch content for ${version.page.url}:`, error)
  }

  return null
}

/**
 * Format a page section for llms-full.txt
 */
function formatPageSection(
  version: PageVersionWithPage,
  content: string,
): string[] {
  const sections: string[] = []

  try {
    const urlPath = new URL(version.page.url).pathname

    sections.push(`### ${urlPath || "/"}`)
    sections.push("")
    sections.push(`**Full URL:** ${version.page.url}`)
    const createdAt =
      typeof version.created_at === "string"
        ? version.created_at
        : version.created_at.toISOString()
    sections.push(`**Last Modified:** ${createdAt}`)
    sections.push("")
    sections.push(content)
    sections.push("")
    sections.push("---")
    sections.push("")
  } catch (error) {
    // Fallback formatting if URL parsing fails
    sections.push(`### ${version.page.url}`)
    sections.push("")
    sections.push(content)
    sections.push("")
    sections.push("---")
    sections.push("")
  }

  return sections
}
