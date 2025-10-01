import type { Artifact, ArtifactKind, Domain, Job } from "@prisma/client"
import { prisma } from "./client"

export const artifactService = {
  /**
   * Get the next version number for a domain and artifact kind
   */
  async getNextVersion(domainId: string, kind: ArtifactKind): Promise<number> {
    const latestArtifact = await prisma.artifact.findFirst({
      where: {
        kind,
        job: {
          domain_id: domainId,
        },
      },
      orderBy: {
        version: "desc",
      },
      select: {
        version: true,
      },
    })

    return (latestArtifact?.version ?? 0) + 1
  },

  /**
   * Create an artifact
   */
  async create(data: {
    jobId: string
    kind: ArtifactKind
    blobUrl: string
    version?: number
  }): Promise<Artifact> {
    return prisma.artifact.create({
      data: {
        job_id: data.jobId,
        kind: data.kind,
        blob_url: data.blobUrl,
        version: data.version ?? 1,
      },
    })
  },

  /**
   * Get artifacts for a job
   */
  async getByJobId(jobId: string): Promise<Artifact[]> {
    return prisma.artifact.findMany({
      where: { job_id: jobId },
      orderBy: { created_at: "desc" },
    })
  },

  /**
   * Get latest artifact of a specific kind for a domain
   */
  async getLatestForDomain(
    domainId: string,
    kind: ArtifactKind,
  ): Promise<Artifact | null> {
    const job = await prisma.job.findFirst({
      where: {
        domain_id: domainId,
        status: "finished",
      },
      orderBy: { finished_at: "desc" },
      include: {
        artifacts: {
          where: { kind },
          orderBy: { created_at: "desc" },
          take: 1,
        },
      },
    })

    return job?.artifacts[0] ?? null
  },

  /**
   * Get all artifacts of a specific kind for a domain
   */
  async getAllForDomain(
    domainId: string,
    kind?: ArtifactKind,
  ): Promise<Artifact[]> {
    const jobs = await prisma.job.findMany({
      where: {
        domain_id: domainId,
        status: "finished",
      },
      orderBy: { finished_at: "desc" },
      include: {
        artifacts: {
          where: kind ? { kind } : undefined,
          orderBy: { created_at: "desc" },
        },
      },
    })

    return jobs.flatMap((job) => job.artifacts)
  },

  /**
   * Delete artifact
   */
  async delete(id: string): Promise<void> {
    await prisma.artifact.delete({
      where: { id },
    })
  },

  /**
   * Delete old artifacts (keep N most recent per domain/kind)
   */
  async pruneOldArtifacts(
    domainId: string,
    kind: ArtifactKind,
    keepCount = 5,
  ): Promise<number> {
    // Get all artifacts of this kind for the domain
    const artifacts = await this.getAllForDomain(domainId, kind)

    // Keep the most recent ones
    const toDelete = artifacts.slice(keepCount)

    if (toDelete.length === 0) {
      return 0
    }

    // Delete the old ones
    const result = await prisma.artifact.deleteMany({
      where: {
        id: {
          in: toDelete.map((a) => a.id),
        },
      },
    })

    return result.count
  },

  /**
   * Create multiple artifacts in a transaction
   */
  async createMany(
    artifacts: Array<{
      jobId: string
      kind: ArtifactKind
      blobUrl: string
      version?: number
    }>,
  ): Promise<Artifact[]> {
    return prisma.$transaction(
      artifacts.map((data) =>
        prisma.artifact.create({
          data: {
            job_id: data.jobId,
            kind: data.kind,
            blob_url: data.blobUrl,
            version: data.version ?? 1,
          },
        }),
      ),
    )
  },

  /**
   * Get artifact by ID with job and domain
   */
  async getById(id: string): Promise<
    | (Artifact & {
        job: Job & {
          domain: Domain
        }
      })
    | null
  > {
    return prisma.artifact.findUnique({
      where: { id },
      include: {
        job: {
          include: {
            domain: true,
          },
        },
      },
    })
  },

  /**
   * Get latest artifacts for a domain (llms.txt and llms-full.txt)
   */
  async getLatestArtifactsForDomain(domainId: string): Promise<{
    llmsTxt: Artifact | null
    llmsFullTxt: Artifact | null
  }> {
    const [llmsTxt, llmsFullTxt] = await Promise.all([
      this.getLatestForDomain(domainId, "llms_txt"),
      this.getLatestForDomain(domainId, "llms_full_txt"),
    ])
    return { llmsTxt, llmsFullTxt }
  },
}
