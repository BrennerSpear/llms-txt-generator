import type { Domain, Job, PromptProfile } from "@prisma/client"
import { prisma } from "./client"

export const domainService = {
  /**
   * Create a new domain
   */
  async create(data: {
    domain: string
    checkIntervalMinutes?: number
    openrouterModel?: string
    promptProfileId?: string
    isActive?: boolean
  }): Promise<Domain> {
    return prisma.domain.create({
      data: {
        domain: data.domain,
        check_interval_minutes: data.checkIntervalMinutes ?? 1440,
        openrouter_model: data.openrouterModel ?? "openai/gpt-4o-mini",
        prompt_profile_id: data.promptProfileId,
        is_active: data.isActive ?? true,
      },
    })
  },

  /**
   * Get an existing domain by name or create it with provided defaults.
   * Always returns the domain including its prompt profile relation.
   */
  async getOrCreate(data: {
    domain: string
    checkIntervalMinutes?: number
    openrouterModel?: string
    promptProfileId?: string
    isActive?: boolean
  }): Promise<Domain & { prompt_profile: PromptProfile | null }> {
    // First try find to avoid unnecessary upsert writes
    const existing = await prisma.domain.findUnique({
      where: { domain: data.domain },
      include: { prompt_profile: true },
    })
    if (existing) {
      return existing
    }

    // Create new domain
    const created = await prisma.domain.create({
      data: {
        domain: data.domain,
        check_interval_minutes: data.checkIntervalMinutes ?? 1440,
        openrouter_model: data.openrouterModel ?? "openai/gpt-4o-mini",
        prompt_profile_id: data.promptProfileId,
        is_active: data.isActive ?? true,
      },
      include: { prompt_profile: true },
    })
    return created
  },

  /**
   * Get a domain by ID with prompt profile
   */
  async getById(id: string): Promise<
    | (Domain & {
        prompt_profile: PromptProfile | null
      })
    | null
  > {
    return prisma.domain.findUnique({
      where: { id },
      include: {
        prompt_profile: true,
      },
    })
  },

  /**
   * Get domain with pages and their latest versions
   */
  async getWithPages(id: string): Promise<
    | (Domain & {
        prompt_profile: PromptProfile | null
        _count: {
          pages: number
          jobs: number
        }
        pages: Array<{
          id: string
          url: string
          created_at: Date
          page_versions: Array<{
            id: string
            created_at: Date
            raw_md_blob_url: string | null
            html_md_blob_url: string | null
          }>
        }>
      })
    | null
  > {
    return prisma.domain.findUnique({
      where: { id },
      include: {
        prompt_profile: true,
        _count: {
          select: {
            pages: true,
            jobs: true,
          },
        },
        pages: {
          include: {
            page_versions: {
              orderBy: { created_at: "desc" },
              take: 1,
            },
          },
          orderBy: { url: "asc" },
        },
      },
    })
  },

  /**
   * Get a domain by URL with prompt profile
   */
  async getByDomain(domain: string): Promise<
    | (Domain & {
        prompt_profile: PromptProfile | null
      })
    | null
  > {
    return prisma.domain.findUnique({
      where: { domain },
      include: {
        prompt_profile: true,
      },
    })
  },

  /**
   * Get all active domains with prompt profiles
   */
  async getActive(): Promise<
    (Domain & {
      prompt_profile: PromptProfile | null
    })[]
  > {
    return prisma.domain.findMany({
      where: { is_active: true },
      include: {
        prompt_profile: true,
      },
    })
  },

  /**
   * Get domains due for recrawl
   */
  async getDueForRecrawl(): Promise<
    (Domain & {
      jobs: Job[]
      prompt_profile: PromptProfile | null
    })[]
  > {
    const now = new Date()

    // Get domains with their latest job
    const domains = await prisma.domain.findMany({
      where: { is_active: true },
      include: {
        jobs: {
          orderBy: { started_at: "desc" },
          take: 1,
        },
        prompt_profile: true,
      },
    })

    // Filter domains that are due for recrawl
    return domains.filter((domain) => {
      if (domain.jobs.length === 0) {
        // Never crawled
        return true
      }

      const lastJob = domain.jobs[0]
      if (!lastJob || !lastJob.finished_at) {
        // No job or job still running
        return false
      }

      const timeSinceLastCrawl = now.getTime() - lastJob.finished_at.getTime()
      const intervalMs = domain.check_interval_minutes * 60 * 1000

      return timeSinceLastCrawl >= intervalMs
    })
  },

  /**
   * Update a domain
   */
  async update(
    id: string,
    data: {
      checkIntervalMinutes?: number
      openrouterModel?: string
      promptProfileId?: string | null
      isActive?: boolean
      firecrawlLlmsTxtUrl?: string | null
    },
  ): Promise<Domain> {
    return prisma.domain.update({
      where: { id },
      data: {
        check_interval_minutes: data.checkIntervalMinutes,
        openrouter_model: data.openrouterModel,
        prompt_profile_id: data.promptProfileId,
        is_active: data.isActive,
        firecrawl_llms_txt_url: data.firecrawlLlmsTxtUrl,
      },
    })
  },

  /**
   * Delete a domain
   */
  async delete(id: string): Promise<void> {
    await prisma.domain.delete({
      where: { id },
    })
  },

  /**
   * Get all domains with stats for the table view
   */
  async getAllWithStats(): Promise<
    (Domain & {
      prompt_profile: PromptProfile | null
      _count: {
        pages: number
      }
      lastJob: (Job & { _count: { page_versions: number } }) | null
    })[]
  > {
    const domains = await prisma.domain.findMany({
      include: {
        prompt_profile: true,
        _count: {
          select: {
            pages: true,
          },
        },
      },
      orderBy: {
        updated_at: "desc",
      },
    })

    // Get the last job for each domain
    const domainsWithLastJob = await Promise.all(
      domains.map(async (domain) => {
        const lastJob = await prisma.job.findFirst({
          where: { domain_id: domain.id },
          orderBy: { started_at: "desc" },
          include: {
            _count: {
              select: {
                page_versions: true,
              },
            },
          },
        })
        return {
          ...domain,
          lastJob,
        }
      }),
    )

    return domainsWithLastJob
  },
}
