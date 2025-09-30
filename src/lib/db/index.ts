export { prisma } from "./client"
export { domainService } from "./domains"
export { jobService } from "./jobs"
export { pageService } from "./pages"
export { artifactService } from "./artifacts"
export { promptProfileService } from "./prompt-profiles"

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
