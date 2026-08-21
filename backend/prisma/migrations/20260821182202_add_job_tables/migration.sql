-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'CONTRACT', 'WORKING_STUDENT');

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "jobId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "location" TEXT,
    "countryCode" CHAR(2),
    "workplaceType" "WorkplaceType",
    "employmentType" "EmploymentType",
    "language" CHAR(2) NOT NULL DEFAULT 'en',
    "description" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "technologies" TEXT[],
    "postedAt" TIMESTAMPTZ(3),
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "location" TEXT,
    "countryCode" CHAR(2),
    "workplaceType" "WorkplaceType",
    "employmentType" "EmploymentType",
    "language" CHAR(2) NOT NULL DEFAULT 'en',
    "description" TEXT NOT NULL,
    "technologies" TEXT[],
    "dedupHash" TEXT NOT NULL,
    "mergedIntoJobId" TEXT,
    "postedAt" TIMESTAMPTZ(3),
    "effectivePostedAt" TIMESTAMPTZ(3) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobPosting_jobId_idx" ON "JobPosting"("jobId");

-- CreateIndex
CREATE INDEX "JobPosting_companySlug_idx" ON "JobPosting"("companySlug");

-- CreateIndex
CREATE INDEX "JobPosting_sourceId_lastSeenAt_idx" ON "JobPosting"("sourceId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobPosting_sourceId_externalId_key" ON "JobPosting"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupHash_key" ON "Job"("dedupHash");

-- CreateIndex
CREATE INDEX "Job_countryCode_workplaceType_idx" ON "Job"("countryCode", "workplaceType");

-- CreateIndex
CREATE INDEX "Job_companySlug_normalizedTitle_idx" ON "Job"("companySlug", "normalizedTitle");

-- CreateIndex
CREATE INDEX "Job_lastSeenAt_idx" ON "Job"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_mergedIntoJobId_fkey" FOREIGN KEY ("mergedIntoJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
