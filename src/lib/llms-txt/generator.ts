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

// Enhanced page data structure including new metadata fields
export interface PageData {
  url: string
  title: string // From page_title field
  description: string // From page_description field
  summary?: string // From page_summary field (if exists)
  content: string // Raw content from Supabase storage
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
    const pageTitle = version.page_title || pageUrl.split("/").pop() || "page"
    const pageDescription = version.page_description || `Content from ${domain}`
    const pageSummary = version.page_summary

    let summary = `## ${pageTitle}\n`
    summary += `> ${pageDescription}\n\n`
    summary += `URL: ${pageUrl}\n`
    if (pageSummary) {
      summary += `\n${pageSummary}\n`
    }
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

  // Prepare page data with content and metadata
  const pagesWithContent: PageData[] = await Promise.all(
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

      // Use new metadata fields if available, with fallbacks
      return {
        url: version.page.url,
        title:
          version.page_title || version.page.url.split("/").pop() || "Page",
        description: version.page_description || "Page content",
        summary: version.page_summary || undefined,
        content: content.slice(0, 5000), // Limit content for API calls
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
  sections.push(`Generated: ${new Date().toISOString()}`)
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

  // Add pages organized by category (using database summaries only)
  for (const [category, versions] of Object.entries(pagesByPath)) {
    sections.push(`## ${category}`)
    sections.push("")

    for (const version of versions) {
      sections.push(...formatPageSection(version))
    }
  }

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
 * Format a page section for llms-full.txt
 */
function formatPageSection(version: PageVersionWithPage): string[] {
  const sections: string[] = []

  const title =
    version.page_title || version.page.url.split("/").pop() || "Page"

  sections.push(`### ${title}`)
  sections.push("")

  // Use summary if available, otherwise fall back to description
  if (version.page_summary) {
    sections.push(version.page_summary)
    sections.push("")
  } else if (version.page_description) {
    // Only show description if no summary exists
    sections.push(`> ${version.page_description}`)
    sections.push("")
  }

  sections.push("---")
  sections.push("")

  return sections
}
