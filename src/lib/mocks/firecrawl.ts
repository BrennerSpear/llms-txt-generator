import type {
  CrawlJob,
  CrawlOptions,
  CrawlResponse,
  Document,
  DocumentMetadata,
} from "firecrawl"
import { generateMockPageContent } from "./factory"

/**
 * Mock Firecrawl service for local development
 * Simulates the Firecrawl API behavior with realistic responses
 */

// Store mock crawl jobs in memory
const mockCrawlJobs = new Map<
  string,
  {
    status: "scraping" | "completed" | "failed"
    totalPages: number
    pagesScraped: number
    pages: Document[]
    startedAt: Date
    domain: string
  }
>()

/**
 * Mock function to start a crawl job
 * Simulates Firecrawl's async crawl initiation
 * Returns immediately with job ID, processes in background
 */
export async function mockStartCrawl(
  url: string,
  options?: CrawlOptions,
): Promise<CrawlResponse> {
  const domain = new URL(url).hostname
  const jobId = `mock_crawl_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const maxPages = options?.limit ?? 10

  // Generate mock pages for this domain
  const pages = generateMockPagesForDomain(domain, maxPages)

  // Store the job in "scraping" status
  mockCrawlJobs.set(jobId, {
    status: "scraping",
    totalPages: pages.length,
    pagesScraped: 0,
    pages,
    startedAt: new Date(),
    domain,
  })

  // If webhook URL is provided, simulate sending webhook events asynchronously
  const webhookUrl =
    typeof options?.webhook === "string"
      ? options.webhook
      : options?.webhook?.url

  if (webhookUrl) {
    console.log(`📮 Mock Firecrawl: Scheduling webhooks to ${webhookUrl}`)
    console.log(`   Job ID: ${jobId}`)
    console.log(`   Pages to send: ${pages.length}`)
    // Schedule mock webhook events - this happens in background
    scheduleMockWebhooks(jobId, webhookUrl, pages)
  } else {
    console.log(
      "⚠️ Mock Firecrawl: No webhook URL provided, skipping webhook simulation",
    )
  }

  // Return CrawlResponse with job ID and URL
  // The actual crawl will be processed in the background via webhooks
  return {
    id: jobId,
    url: `https://api.firecrawl.dev/v1/crawl/${jobId}`,
  }
}

/**
 * Mock function to get crawl status
 */
export async function mockGetCrawlStatus(
  jobId: string,
): Promise<CrawlJob & { data: Document[] }> {
  const job = mockCrawlJobs.get(jobId)

  if (!job) {
    return {
      status: "failed",
      total: 0,
      completed: 0,
      creditsUsed: 0,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      next: null,
      data: [],
    }
  }

  const pagesCompleted = Math.min(job.pagesScraped, job.totalPages)

  return {
    status: job.status,
    total: job.totalPages,
    completed: pagesCompleted,
    creditsUsed: pagesCompleted,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    next:
      pagesCompleted < job.totalPages
        ? `/v1/crawl/${jobId}?skip=${pagesCompleted}`
        : undefined,
    data: job.pages.slice(0, pagesCompleted),
  }
}

/**
 * Generate mock pages for a domain
 */
function generateMockPagesForDomain(
  domain: string,
  maxPages: number,
): Document[] {
  const pages: Document[] = []
  const baseUrl = `https://${domain}`

  // Always include homepage
  pages.push(createMockDocument(`${baseUrl}/`, "homepage", domain))

  // Add some documentation pages
  const docPaths = [
    "/docs",
    "/docs/getting-started",
    "/docs/api",
    "/docs/guides",
  ]
  for (const path of docPaths.slice(0, Math.min(3, maxPages - 1))) {
    pages.push(createMockDocument(`${baseUrl}${path}`, "documentation", domain))
  }

  // Add some blog posts if we have room
  if (pages.length < maxPages) {
    const blogPaths = ["/blog", "/blog/announcing-v2", "/blog/best-practices"]
    for (const path of blogPaths) {
      if (pages.length >= maxPages) break
      pages.push(createMockDocument(`${baseUrl}${path}`, "blog", domain))
    }
  }

  // Add some product pages if we have room
  if (pages.length < maxPages) {
    const productPaths = ["/features", "/pricing", "/about", "/contact"]
    for (const path of productPaths) {
      if (pages.length >= maxPages) break
      pages.push(createMockDocument(`${baseUrl}${path}`, "product", domain))
    }
  }

  return pages.slice(0, maxPages)
}

/**
 * Create a mock Firecrawl document
 */
function createMockDocument(
  url: string,
  pageType: "homepage" | "documentation" | "blog" | "product",
  domain: string,
): Document {
  const { markdown, html, title, description } = generateMockPageContent(
    url,
    pageType,
    domain,
  )

  const metadata: DocumentMetadata = {
    title,
    description,
    language: "en",
    keywords: `${domain}, ${pageType}, mock content`,
    robots: "index, follow",
    ogTitle: title,
    ogDescription: description,
    ogUrl: url,
    ogImage: `https://${domain}/og-image.png`,
    ogLocaleAlternate: [],
    ogSiteName: domain,
    publishedTime: new Date(
      Date.now() - Math.random() * 30 * 86400000,
    ).toISOString(),
    modifiedTime: new Date(
      Date.now() - Math.random() * 7 * 86400000,
    ).toISOString(),
    sourceURL: url,
    statusCode: 200,
  }

  return {
    markdown,
    html,
    rawHtml: html,
    metadata,
  }
}

/**
 * Schedule mock webhook events to simulate Firecrawl's webhook behavior
 */
function scheduleMockWebhooks(
  jobId: string,
  webhookUrl: string,
  pages: Document[],
) {
  const job = mockCrawlJobs.get(jobId)
  if (!job) return

  // Simulate sending page events with delays
  pages.forEach((page, index) => {
    const delay = 500 + index * 300 // Stagger by 300ms per page

    setTimeout(async () => {
      // Update job progress
      job.pagesScraped = index + 1

      // Send webhook for this page
      try {
        console.log(
          `📤 Sending mock webhook for page ${index + 1}/${pages.length}`,
        )
        await sendMockWebhook(webhookUrl, {
          type: "crawl.page",
          jobId,
          data: [page], // Webhook expects an array of documents
        })
        console.log("✅ Mock webhook sent successfully")
      } catch (error) {
        console.error("❌ Failed to send mock webhook:", error)
      }

      // If this is the last page, send completion webhook
      if (index === pages.length - 1) {
        job.status = "completed"
        setTimeout(async () => {
          try {
            await sendMockWebhook(webhookUrl, {
              type: "crawl.completed",
              jobId,
              data: {
                pagesScraped: pages.length,
                creditsUsed: pages.length,
              },
            })
          } catch (error) {
            console.error("Failed to send completion webhook:", error)
          }
        }, 500)
      }
    }, delay)
  })
}

/**
 * Send a mock webhook to the specified URL
 */
async function sendMockWebhook(
  webhookUrl: string,
  payload: {
    type: string
    jobId: string
    data: Document | Document[] | Record<string, unknown>
  },
) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Firecrawl-Signature": generateMockSignature(payload),
        "X-Mock-Service": "true",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.error(
        `Webhook failed with status ${response.status}: ${await response.text()}`,
      )
    }
  } catch (error) {
    console.error("Failed to send mock webhook:", error)
  }
}

/**
 * Generate a mock signature for webhook verification
 */
function generateMockSignature(payload: Record<string, unknown>): string {
  // Simple mock signature - in production this would use HMAC
  const secret = process.env.FIRECRAWL_WEBHOOK_SECRET ?? "mock_secret"
  return `mock_sig_${Buffer.from(JSON.stringify(payload)).toString("base64").slice(0, 20)}`
}

/**
 * Mock Firecrawl client for drop-in replacement during development
 */
export class MockFirecrawlClient {
  constructor(private apiKey: string) {}

  async startCrawl(
    url: string,
    options?: CrawlOptions,
  ): Promise<CrawlResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100))
    return mockStartCrawl(url, options)
  }

  async crawl(url: string, options?: CrawlOptions): Promise<CrawlJob> {
    // For the synchronous crawl method, start the crawl then wait for completion
    const crawlResponse = await this.startCrawl(url, options)

    // Simulate waiting for completion by returning the completed job
    const job = mockCrawlJobs.get(crawlResponse.id)
    if (!job) {
      throw new Error(`Crawl job not found: ${crawlResponse.id}`)
    }

    // Wait a bit to simulate processing
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Return completed job with data
    return {
      status: "completed" as const,
      total: job.pages.length,
      completed: job.pages.length,
      creditsUsed: job.pages.length,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      next: null,
      data: job.pages,
    }
  }

  async getCrawlStatus(
    jobId: string,
  ): Promise<CrawlJob & { data: Document[] }> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 50))
    return mockGetCrawlStatus(jobId)
  }

  async cancelCrawl(jobId: string): Promise<{ success: boolean }> {
    const job = mockCrawlJobs.get(jobId)
    if (job) {
      job.status = "failed"
      return { success: true }
    }
    return { success: false }
  }
}

// Export a singleton instance
export const mockFirecrawl = new MockFirecrawlClient("mock_api_key")
