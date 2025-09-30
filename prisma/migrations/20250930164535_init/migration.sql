-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('initial', 'update');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('processing', 'finished', 'failed');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('raw_md', 'html_md', 'llms_txt', 'llms_full_txt');

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "check_interval_minutes" INTEGER NOT NULL DEFAULT 1440,
    "openrouter_model" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    "firecrawl_llms_txt_url" TEXT,
    "prompt_profile_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary_prompt" TEXT NOT NULL,
    "llms_txt_header" TEXT,
    "assemble_template" TEXT,
    "params" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "domain_id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'processing',
    "firecrawl_job_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "stats" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "domain_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "last_known_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageVersion" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "raw_md_blob_url" TEXT,
    "html_md_blob_url" TEXT,
    "content_fingerprint" TEXT NOT NULL,
    "prev_fingerprint" TEXT,
    "similarity_score" DOUBLE PRECISION,
    "changed_enough" BOOLEAN NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "kind" "ArtifactKind" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "blob_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Domain_domain_key" ON "Domain"("domain");

-- CreateIndex
CREATE INDEX "Domain_domain_idx" ON "Domain"("domain");

-- CreateIndex
CREATE INDEX "Job_domain_id_started_at_idx" ON "Job"("domain_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "Page_domain_id_url_idx" ON "Page"("domain_id", "url");

-- CreateIndex
CREATE UNIQUE INDEX "Page_domain_id_url_key" ON "Page"("domain_id", "url");

-- CreateIndex
CREATE INDEX "PageVersion_page_id_created_at_idx" ON "PageVersion"("page_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "PageVersion_content_fingerprint_idx" ON "PageVersion"("content_fingerprint");

-- CreateIndex
CREATE INDEX "Artifact_job_id_idx" ON "Artifact"("job_id");

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_prompt_profile_id_fkey" FOREIGN KEY ("prompt_profile_id") REFERENCES "PromptProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageVersion" ADD CONSTRAINT "PageVersion_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageVersion" ADD CONSTRAINT "PageVersion_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
