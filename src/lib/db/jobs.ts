import type {
  Artifact,
  Domain,
  Job,
  JobStatus,
  JobType,
  Page,
  PageVersion,
  Prisma,
} from "@prisma/client"
import { prisma } from "./client"

export const jobService = {
  /**
   * Create a new job
   */
  async create(data: {
    domainId: string
    type: JobType
    firecrawlJobId?: string
  }): Promise<Job & { domain: Domain }> {
    return prisma.job.create({
      data: {
        domain_id: data.domainId,
        type: data.type,
        firecrawl_job_id: data.firecrawlJobId,
        status: "processing",
      },
      include: {
        domain: true,
      },
    })
  },

  /**
   * Get a job by ID with relations
   */
  async getById(id: string): Promise<
    | (Job & {
        domain: Domain
        pages: Page[]
        artifacts: Artifact[]
      })
    | null
  > {
    return prisma.job.findUnique({
      where: { id },
      include: {
        domain: true,
        pages: true,
        artifacts: true,
      },
    })
  },

  /**
   * Get a job by Firecrawl job ID
   */
  async getByFirecrawlId(firecrawlJobId: string): Promise<
    | (Job & {
        domain: Domain
      })
    | null
  > {
    return prisma.job.findFirst({
      where: { firecrawl_job_id: firecrawlJobId },
      include: {
        domain: true,
      },
    })
  },

  /**
   * Update job status
   */
  async updateStatus(
    id: string,
    status: JobStatus,
    finishedAt?: Date,
  ): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: {
        status,
        finished_at: finishedAt,
      },
    })
  },

  /**
   * Update job stats
   * Note: Type casting to Prisma.InputJsonValue is the canonical workaround
   * for Prisma's JSON type incompatibility issue
   */
  async updateStats(id: string, stats: Record<string, unknown>): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: {
        stats: stats as Prisma.InputJsonValue,
      },
    })
  },

  /**
   * Update Firecrawl job ID
   */
  async updateFirecrawlJobId(id: string, firecrawlJobId: string): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: {
        firecrawl_job_id: firecrawlJobId,
      },
    })
  },

  /**
   * Get latest job for a domain
   */
  async getLatestForDomain(domainId: string): Promise<
    | (Job & {
        domain: Domain
        artifacts: Artifact[]
      })
    | null
  > {
    return prisma.job.findFirst({
      where: { domain_id: domainId },
      orderBy: { started_at: "desc" },
      include: {
        domain: true,
        artifacts: true,
      },
    })
  },

  /**
   * Get jobs by status
   */
  async getByStatus(status: JobStatus): Promise<
    (Job & {
      domain: Domain
    })[]
  > {
    return prisma.job.findMany({
      where: { status },
      include: {
        domain: true,
      },
      orderBy: { started_at: "desc" },
    })
  },

  /**
   * Check if domain has active job
   */
  async hasActiveJob(domainId: string): Promise<boolean> {
    const activeJob = await prisma.job.findFirst({
      where: {
        domain_id: domainId,
        status: "processing",
      },
    })
    return activeJob !== null
  },

  /**
   * Mark job as finished with stats
   */
  async finish(
    id: string,
    stats: {
      pagesProcessed: number
      pagesChanged: number
      pagesSkipped: number
      duration: number
      errors?: string[]
    },
  ): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: {
        status: "finished",
        finished_at: new Date(),
        stats: stats as Prisma.InputJsonValue,
      },
    })
  },

  /**
   * Mark job as failed
   */
  async fail(id: string, error: string): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: {
        status: "failed",
        finished_at: new Date(),
        stats: { error } as Prisma.InputJsonValue,
      },
    })
  },

  /**
   * Merge stats with existing stats
   */
  async mergeStats(
    id: string,
    newStats: Record<string, unknown>,
  ): Promise<Job> {
    const job = await prisma.job.findUnique({
      where: { id },
      select: { stats: true },
    })

    const existingStats = (job?.stats as Record<string, unknown>) || {}

    return prisma.job.update({
      where: { id },
      data: {
        stats: {
          ...existingStats,
          ...newStats,
        } as Prisma.InputJsonValue,
      },
    })
  },

  /**
   * Mark job as completed with final stats
   */
  async complete(id: string, stats: Record<string, unknown>): Promise<Job> {
    const job = await prisma.job.findUnique({
      where: { id },
      select: { stats: true },
    })

    const existingStats = (job?.stats as Record<string, unknown>) || {}

    return prisma.job.update({
      where: { id },
      data: {
        status: "finished",
        finished_at: new Date(),
        stats: {
          ...existingStats,
          ...stats,
        } as Prisma.InputJsonValue,
      },
    })
  },

  /**
   * Get job with full relations for finalization
   */
  async getForFinalization(id: string): Promise<
    | (Job & {
        domain: Domain
        pages: Page[]
        page_versions: PageVersion[]
        artifacts: Artifact[]
      })
    | null
  > {
    return prisma.job.findUnique({
      where: { id },
      include: {
        domain: true,
        pages: true,
        page_versions: true,
        artifacts: true,
      },
    })
  },
}
