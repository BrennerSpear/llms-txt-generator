import type { Document } from "firecrawl"
import { generateMockPageContent } from "./factory"

/**
 * Webhook simulator for testing webhook handlers without real Firecrawl
 */

export interface WebhookEvent {
  type: "crawl.started" | "crawl.page" | "crawl.completed" | "crawl.failed"
  jobId: string
  timestamp: string
  data: Document[] | Document | Record<string, unknown>
}

/**
 * Simulate a complete crawl sequence with webhook events
 */
export class WebhookSimulator {
  private webhookUrl: string
  private webhookSecret: string

  constructor(webhookUrl: string, webhookSecret?: string) {
    this.webhookUrl = webhookUrl
    this.webhookSecret =
      webhookSecret ?? process.env.FIRECRAWL_WEBHOOK_SECRET ?? "test_secret"
  }

  /**
   * Simulate a crawl with custom pages (for testing change detection)
   */
  async simulateCrawlWithPages(
    domain: string,
    pages: Array<{
      url?: string
      content: string
      metadata?: Partial<Document["metadata"]>
    }>,
    options: {
      delayBetweenPages?: number
    } = {},
  ) {
    const { delayBetweenPages = 100 } = options
    const jobId = `sim_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const baseUrl = `https://${domain}`

    console.log(
      `🎭 Starting custom webhook simulation for ${domain} (Job ID: ${jobId})`,
    )

    // Send crawl.started event
    await this.sendWebhookEvent({
      type: "crawl.started",
      jobId,
      timestamp: new Date().toISOString(),
      data: {
        url: baseUrl,
        options: {
          maxPages: pages.length,
        },
      },
    })

    // Send each custom page
    const sentPages: Document[] = []
    for (let i = 0; i < pages.length; i++) {
      const pageData = pages[i]
      if (!pageData) {
        throw new Error(`Page data not found for index ${i}`)
      }
      const pageUrl = pageData.url || `${baseUrl}/page-${i}`

      const page: Document = {
        markdown: pageData.content,
        html: `<html><body>${pageData.content}</body></html>`,
        rawHtml: `<html><body>${pageData.content}</body></html>`,
        metadata: {
          title: `Page ${i}`,
          description: `Custom page ${i}`,
          sourceURL: pageUrl,
          statusCode: 200,
          ...pageData.metadata,
        },
      }

      sentPages.push(page)

      // Send crawl.page event with change tracking (data should be an array)
      await this.sendWebhookEvent({
        type: "crawl.page",
        jobId,
        timestamp: new Date().toISOString(),
        data: [
          {
            ...page,
            changeTracking: {
              hasChanges: true, // Assume all provided pages have changes
              tag: "test",
            },
          },
        ],
      })

      console.log(`📄 Sent custom page ${i + 1}/${pages.length}: ${pageUrl}`)

      if (i < pages.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenPages))
      }
    }

    // Send crawl.completed event
    await this.sendWebhookEvent({
      type: "crawl.completed",
      jobId,
      timestamp: new Date().toISOString(),
      data: {
        pagesScraped: sentPages.length,
        creditsUsed: sentPages.length,
        completedAt: new Date().toISOString(),
      },
    })

    console.log(`✅ Custom crawl simulation completed for ${domain}`)
    return { jobId, pages: sentPages }
  }

  /**
   * Simulate a full crawl with webhook events
   */
  async simulateCrawl(
    domain: string,
    options: {
      pageCount?: number
      delayBetweenPages?: number
      simulateFailure?: boolean
    } = {},
  ) {
    const {
      pageCount = 5,
      delayBetweenPages = 500,
      simulateFailure = false,
    } = options

    const jobId = `sim_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const baseUrl = `https://${domain}`

    console.log(
      `🎭 Starting webhook simulation for ${domain} (Job ID: ${jobId})`,
    )

    // Send crawl.started event
    await this.sendWebhookEvent({
      type: "crawl.started",
      jobId,
      timestamp: new Date().toISOString(),
      data: {
        url: baseUrl,
        options: {
          maxPages: pageCount,
        },
      },
    })

    // Simulate pages being crawled
    const pages: Document[] = []
    for (let i = 0; i < pageCount; i++) {
      // Simulate failure on specific page if requested
      if (simulateFailure && i === Math.floor(pageCount / 2)) {
        await this.sendWebhookEvent({
          type: "crawl.failed",
          jobId,
          timestamp: new Date().toISOString(),
          data: {
            error: "Simulated crawl failure",
            failedAt: new Date().toISOString(),
            pagesProcessed: i,
          },
        })
        console.log(`❌ Simulated failure after ${i} pages`)
        return
      }

      const pagePath = this.getPagePath(i)
      const pageUrl = `${baseUrl}${pagePath}`
      const pageType = this.getPageType(pagePath)

      const { markdown, html, title, description } = generateMockPageContent(
        pageUrl,
        pageType,
        domain,
      )

      const page: Document = {
        markdown,
        html,
        rawHtml: html,
        metadata: {
          title,
          description,
          language: "en",
          sourceURL: pageUrl,
          statusCode: 200,
          publishedTime: new Date(
            Date.now() - Math.random() * 30 * 86400000,
          ).toISOString(),
          modifiedTime: new Date(
            Date.now() - Math.random() * 7 * 86400000,
          ).toISOString(),
        },
      }

      pages.push(page)

      // Send crawl.page event (data should be an array for crawl.page events)
      await this.sendWebhookEvent({
        type: "crawl.page",
        jobId,
        timestamp: new Date().toISOString(),
        data: [page], // Wrap in array as expected by webhook handler
      })

      console.log(`📄 Simulated page ${i + 1}/${pageCount}: ${pageUrl}`)

      // Delay between pages
      if (i < pageCount - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenPages))
      }
    }

    // Send crawl.completed event
    await this.sendWebhookEvent({
      type: "crawl.completed",
      jobId,
      timestamp: new Date().toISOString(),
      data: {
        pagesScraped: pages.length,
        creditsUsed: pages.length,
        completedAt: new Date().toISOString(),
      },
    })

    console.log(`✅ Crawl simulation completed for ${domain}`)
    return { jobId, pages }
  }

  /**
   * Send a single webhook event
   */
  async sendWebhookEvent(event: WebhookEvent) {
    // Format payload to match Firecrawl webhook structure
    const payload = {
      type: event.type,
      id: event.jobId, // Firecrawl uses 'id' for job ID
      data: event.data,
      timestamp: event.timestamp,
      source: "webhook-simulator",
    }

    const signature = this.generateSignature(payload)

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Firecrawl-Signature": signature,
          "X-Mock-Service": "true",
          "X-Webhook-Simulator": "true",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Webhook failed (${response.status}): ${errorText}`)
        throw new Error(`Webhook failed with status ${response.status}`)
      }

      return response
    } catch (error) {
      console.error("❌ Failed to send webhook event:", error)
      throw error
    }
  }

  /**
   * Generate signature for webhook verification
   */
  private generateSignature(payload: Record<string, unknown>): string {
    // Simple signature for testing - in production this would use HMAC
    const payloadStr = JSON.stringify(payload)
    const hash = Buffer.from(payloadStr).toString("base64").slice(0, 32)
    return `sim_${hash}`
  }

  /**
   * Get page path based on index
   */
  private getPagePath(index: number): string {
    const paths = [
      "/",
      "/docs",
      "/docs/getting-started",
      "/docs/api-reference",
      "/blog",
      "/blog/latest-updates",
      "/features",
      "/pricing",
      "/about",
      "/contact",
    ]
    return paths[index % paths.length] ?? "/"
  }

  /**
   * Determine page type from path
   */
  private getPageType(
    path: string,
  ): "homepage" | "documentation" | "blog" | "product" {
    if (path === "/") return "homepage"
    if (path.includes("/docs")) return "documentation"
    if (path.includes("/blog")) return "blog"
    return "product"
  }
}

/**
 * Create a mock crawl.page event
 */
export function createPageEvent(
  jobId: string,
  url: string,
  options?: Partial<Document>,
): WebhookEvent {
  const domain = new URL(url).hostname
  const { markdown, html, title, description } = generateMockPageContent(
    url,
    "documentation",
    domain,
  )

  const page: Document = {
    markdown,
    html,
    rawHtml: html,
    metadata: {
      title,
      description,
      sourceURL: url,
      statusCode: 200,
    },
    ...options,
  }

  return {
    type: "crawl.page",
    jobId,
    timestamp: new Date().toISOString(),
    data: page,
  }
}

/**
 * Create a mock crawl.completed event
 */
export function createCompletedEvent(
  jobId: string,
  pageCount: number,
): WebhookEvent {
  return {
    type: "crawl.completed",
    jobId,
    timestamp: new Date().toISOString(),
    data: {
      totalPages: pageCount,
      pagesScraped: pageCount,
      creditsUsed: pageCount,
      completedAt: new Date().toISOString(),
    },
  }
}

/**
 * Create a mock crawl.failed event
 */
export function createFailedEvent(jobId: string, error: string): WebhookEvent {
  return {
    type: "crawl.failed",
    jobId,
    timestamp: new Date().toISOString(),
    data: {
      error,
      failedAt: new Date().toISOString(),
    },
  }
}

/**
 * Helper to create a webhook simulator instance
 */
export function createWebhookSimulator(webhookUrl?: string): WebhookSimulator {
  const url =
    webhookUrl ??
    process.env.FIRECRAWL_WEBHOOK_URL ??
    "http://localhost:3000/api/webhooks/firecrawl"
  return new WebhookSimulator(url)
}
