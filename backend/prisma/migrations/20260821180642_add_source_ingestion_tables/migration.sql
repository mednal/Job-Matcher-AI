-- CreateEnum
CREATE TYPE "AccessMethod" AS ENUM ('PUBLIC_API', 'PARTNER_API', 'OFFICIAL_FEED', 'DATA_AGREEMENT', 'LICENSED_CONTENT');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "IngestionTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateTable
CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accessMethod" "AccessMethod" NOT NULL,
    "termsUrl" TEXT,
    "attributionText" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "trigger" "IngestionTrigger" NOT NULL DEFAULT 'SCHEDULED',
    "status" "IngestionStatus" NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawJobDocument" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ingestionRunId" TEXT,
    "externalId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawJobDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_key_key" ON "JobSource"("key");

-- CreateIndex
CREATE INDEX "IngestionRun_sourceId_startedAt_idx" ON "IngestionRun"("sourceId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "IngestionRun_status_startedAt_idx" ON "IngestionRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "RawJobDocument_sourceId_externalId_fetchedAt_idx" ON "RawJobDocument"("sourceId", "externalId", "fetchedAt" DESC);

-- CreateIndex
CREATE INDEX "RawJobDocument_fetchedAt_idx" ON "RawJobDocument"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RawJobDocument_sourceId_externalId_contentHash_key" ON "RawJobDocument"("sourceId", "externalId", "contentHash");

-- AddForeignKey
ALTER TABLE "IngestionRun" ADD CONSTRAINT "IngestionRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawJobDocument" ADD CONSTRAINT "RawJobDocument_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawJobDocument" ADD CONSTRAINT "RawJobDocument_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
