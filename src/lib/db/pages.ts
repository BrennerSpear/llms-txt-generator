import type { Page, PageVersion, Prisma } from "@prisma/client"
import { prisma } from "./client"

export const pageService = {
  /**
   * Create or get a page
   */
  async upsert(data: {
    jobId: string
    domainId: string
    url: string
  }): Promise<Page> {
    return prisma.page.upsert({
      where: {
        domain_id_url: {
          domain_id: data.domainId,
          url: data.url,
        },
      },
      update: {
        job_id: data.jobId,
      },
      create: {
        job_id: data.jobId,
        domain_id: data.domainId,
        url: data.url,
      },
    })
  },

  /**
   * Get a page by ID with its latest version
   */
  async getById(id: string): Promise<
    | (Page & {
        page_versions: PageVersion[]
      })
    | null
  > {
    return prisma.page.findUnique({
      where: { id },
      include: {
        page_versions: {
          orderBy: { created_at: "desc" },
          take: 1,
        },
      },
    })
  },

  /**
   * Get pages for a job with their latest version
   */
  async getByJobId(jobId: string): Promise<
    (Page & {
      page_versions: PageVersion[]
    })[]
  > {
    return prisma.page.findMany({
      where: { job_id: jobId },
      include: {
        page_versions: {
          where: { job_id: jobId },
          orderBy: { created_at: "desc" },
          take: 1,
        },
      },
    })
  },

  /**
   * Update last known version
   */
  async updateLastKnownVersion(id: string, versionId: string): Promise<Page> {
    return prisma.page.update({
      where: { id },
      data: {
        last_known_version_id: versionId,
      },
    })
  },

  /**
   * Create a page version
   */
  async createVersion(data: {
    pageId: string
    jobId: string
    url: string
    rawMdBlobUrl?: string
    htmlMdBlobUrl?: string
    changeStatus?: string
    reason?: string
    semanticImportance?: number | null
    pageTitle?: string
    pageDescription?: string
    pageSummary?: string
  }): Promise<PageVersion> {
    return prisma.pageVersion.create({
      data: {
        page_id: data.pageId,
        job_id: data.jobId,
        url: data.url,
        raw_md_blob_url: data.rawMdBlobUrl,
        html_md_blob_url: data.htmlMdBlobUrl,
        change_status: data.changeStatus,
        reason: data.reason,
        semantic_importance: data.semanticImportance,
        page_title: data.pageTitle,
        page_description: data.pageDescription,
        page_summary: data.pageSummary,
      },
    })
  },

  /**
   * Get latest version for a page
   */
  async getLatestVersion(pageId: string): Promise<PageVersion | null> {
    return prisma.pageVersion.findFirst({
      where: { page_id: pageId },
      orderBy: { created_at: "desc" },
    })
  },

  /**
   * Get previous version for a page (for change detection)
   */
  async getPreviousVersion(
    domainId: string,
    url: string,
  ): Promise<PageVersion | null> {
    // First find the page
    const page = await prisma.page.findUnique({
      where: {
        domain_id_url: {
          domain_id: domainId,
          url: url,
        },
      },
    })

    if (!page) return null

    // Get the latest version
    return prisma.pageVersion.findFirst({
      where: { page_id: page.id },
      orderBy: { created_at: "desc" },
    })
  },

  /**
   * Get changed pages for a job (semantic_importance >= 2 or null for backward compatibility)
   */
  async getChangedPagesForJob(jobId: string): Promise<
    (PageVersion & {
      page: Page
    })[]
  > {
    return prisma.pageVersion.findMany({
      where: {
        job_id: jobId,
        OR: [
          { semantic_importance: null },
          { semantic_importance: { gte: 2 } },
        ],
      },
      include: {
        page: true,
      },
    })
  },

  /**
   * Get all page versions for a job (to check changeStatus)
   */
  async getAllPageVersionsForJob(jobId: string): Promise<
    (PageVersion & {
      page: Page
    })[]
  > {
    return prisma.pageVersion.findMany({
      where: {
        job_id: jobId,
      },
      include: {
        page: true,
      },
    })
  },

  /**
   * Count pages for job
   */
  async countPagesForJob(jobId: string): Promise<{
    total: number
    changed: number
    skipped: number
  }> {
    const [total, changed, skipped] = await Promise.all([
      prisma.pageVersion.count({
        where: { job_id: jobId },
      }),
      prisma.pageVersion.count({
        where: {
          job_id: jobId,
          OR: [
            { semantic_importance: null },
            { semantic_importance: { gte: 2 } },
          ],
        },
      }),
      prisma.pageVersion.count({
        where: {
          job_id: jobId,
          semantic_importance: { lt: 2 },
        },
      }),
    ])

    return { total, changed, skipped }
  },

  /**
   * Batch create page versions
   */
  async createManyVersions(
    versions: Array<{
      pageId: string
      jobId: string
      url: string
      rawMdBlobUrl?: string
      htmlMdBlobUrl?: string
      changeStatus?: string
      reason?: string
      semanticImportance?: number | null
      pageTitle?: string
      pageDescription?: string
      pageSummary?: string
    }>,
  ): Promise<Prisma.BatchPayload> {
    return prisma.pageVersion.createMany({
      data: versions.map((v) => ({
        page_id: v.pageId,
        job_id: v.jobId,
        url: v.url,
        raw_md_blob_url: v.rawMdBlobUrl,
        html_md_blob_url: v.htmlMdBlobUrl,
        change_status: v.changeStatus,
        reason: v.reason,
        semantic_importance: v.semanticImportance,
        page_title: v.pageTitle,
        page_description: v.pageDescription,
        page_summary: v.pageSummary,
      })),
    })
  },
}
