import type { ArtifactKind, JobStatus, JobType } from "@prisma/client"
import type { DocumentMetadata } from "firecrawl"
import { EventSchemas, Inngest, NonRetriableError } from "inngest"

// Define all event types according to the specification
type DomainIngestRequested = {
  data: {
    domainId: string
    type: "initial" | "update"
    requestedBy?: string
    scheduledAt?: string
    maxPages?: number
  }
}

type DomainCrawlPage = {
  data: {
    domainId: string
    jobId: string
    firecrawlJobId: string
    url: string
    markdown: string
    metadata?: DocumentMetadata
    changeTracking: Record<string, unknown>
    timestamp: string
  }
}

type DomainCrawlCompleted = {
  data: {
    domainId: string
    jobId: string
    firecrawlJobId: string
    completedAt: string
    stats?: {
      duration: number
      pagesProcessed: number
      errors?: number
    }
  }
}

type DomainCrawlFailed = {
  data: {
    domainId: string
    jobId: string
    firecrawlJobId?: string
    error: string
    failedAt: string
  }
}

type PageProcessRequested = {
  data: {
    pageId: string
    jobId: string
    domainUrl: string
    url: string
    rawContent: string
    rawMdPath: string // Path where raw markdown from Firecrawl is stored
    changeTracking?: Record<string, unknown>
    changeStatus?: string // "same", "updated", etc from Firecrawl
  }
}

type PageProcessed = {
  data: {
    pageId: string
    versionId: string
    jobId: string
    url: string
    fingerprint: string
    changedEnough: boolean
    similarityScore?: number
    reason?: string
  }
}

type JobAssembleRequested = {
  data: {
    jobId: string
    domainId: string
    completedPages: number
  }
}

type JobFinalizeRequested = {
  data: {
    jobId: string
    domainId: string
    artifactIds: string[]
  }
}

type JobCompleted = {
  data: {
    jobId: string
    domainId: string
    status: "finished" | "failed"
    completedAt: string
    stats: {
      totalPages: number
      changedPages: number
      duration: number
      artifacts: number
    }
  }
}

// Export the events type for use in functions
export type Events = {
  "domain/ingest.requested": DomainIngestRequested
  "domain/crawl.page": DomainCrawlPage
  "domain/crawl.completed": DomainCrawlCompleted
  "domain/crawl.failed": DomainCrawlFailed
  "page/process.requested": PageProcessRequested
  "page/processed": PageProcessed
  "job/assemble.requested": JobAssembleRequested
  "job/finalize.requested": JobFinalizeRequested
  "job/completed": JobCompleted
}

// Create the Inngest client with typed events
export const inngest = new Inngest({
  id: "llms-txt-generator",
  schemas: new EventSchemas().fromRecord<Events>(),
})

// Export commonly used types for functions
export type InngestClient = typeof inngest

// Type for any event in the system
export type AnyEvent = {
  [K in keyof Events]: {
    name: K
    data: Events[K]["data"]
  }
}[keyof Events]

// Helper function to send events (for use in API routes and functions)
export async function sendEvent<K extends keyof Events>(
  eventName: K,
  data: Events[K]["data"],
) {
  // We need to cast here because TypeScript can't narrow the union type properly
  // The inngest.send expects a discriminated union but our generic doesn't resolve at compile time
  return await inngest.send({
    name: eventName,
    data,
  } as AnyEvent)
}

// Helper function to send multiple events with proper typing
type EventPayload<K extends keyof Events = keyof Events> =
  K extends keyof Events ? { name: K; data: Events[K]["data"] } : never

export async function sendEvents<T extends EventPayload[]>(events: T) {
  return await inngest.send(events)
}

// Custom configuration interface for our Inngest functions
// This provides a consistent structure for function configs across the codebase
// While Inngest has its own internal types, this helps us maintain consistency
export interface InngestFunctionConfig {
  id: string
  name?: string
  concurrency?: {
    limit?: number
    key?: string
  }
  throttle?: {
    limit: number
    period: string
    key?: string
  }
  retries?: number
  rateLimit?: {
    limit: number
    period: string
    key?: string
  }
}

// Re-export NonRetriableError from Inngest for convenience
export { NonRetriableError }
