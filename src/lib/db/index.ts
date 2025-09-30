import { artifactService } from "./artifacts"
import { prisma } from "./client"
import { domainService } from "./domains"
import { jobService } from "./jobs"
import { pageService } from "./pages"
import { promptProfileService } from "./prompt-profiles"

// Unified database object with table-based organization
export const db = {
  domain: domainService,
  job: jobService,
  page: pageService,
  artifact: artifactService,
  promptProfile: promptProfileService,
  // Direct prisma access if needed
  prisma,
} as const

// Re-export types from Prisma
export type {
  Domain,
  PromptProfile,
  Job,
  Page,
  PageVersion,
  Artifact,
  JobType,
  JobStatus,
  ArtifactKind,
} from "@prisma/client"
