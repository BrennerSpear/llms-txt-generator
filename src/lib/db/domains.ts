import type { Domain, PromptProfile } from "@prisma/client"
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
   * Get a domain by ID
   */
  async getById(id: string): Promise<Domain | null> {
    return prisma.domain.findUnique({
      where: { id },
      include: {
        prompt_profile: true,
      },
    })
  },

  /**
   * Get a domain by URL
   */
  async getByDomain(domain: string): Promise<Domain | null> {
    return prisma.domain.findUnique({
      where: { domain },
      include: {
        prompt_profile: true,
      },
    })
  },

  /**
   * Get all active domains
   */
  async getActive(): Promise<Domain[]> {
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
  async getDueForRecrawl(): Promise<Domain[]> {
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
}
