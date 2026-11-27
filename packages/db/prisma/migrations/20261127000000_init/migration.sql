-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Lang" AS ENUM ('en', 'ne', 'bn');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('app', 'phone', 'web');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('client', 'staff', 'attorney', 'management', 'admin', 'super_admin');

-- CreateEnum
CREATE TYPE "Goal" AS ENUM ('family', 'employment', 'humanitarian', 'removal_defense', 'naturalization', 'status_question', 'other');

-- CreateEnum
CREATE TYPE "UrgentFlag" AS ENUM ('detained', 'hearing_within_7_days', 'removal_order', 'ice_contact', 'deadline_within_14_days', 'stuck_abroad', 'danger');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('pending_review', 'approved', 'edited', 'rejected');

-- CreateEnum
CREATE TYPE "ReviewKind" AS ENUM ('assessment', 'legal_question');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('open', 'approved', 'edited_sent', 'call_client', 'rejected');

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "crmId" TEXT,
    "fullName" TEXT NOT NULL,
    "otherNames" TEXT[],
    "phone" TEXT,
    "email" TEXT,
    "smsConsent" BOOLEAN NOT NULL DEFAULT false,
    "preferredLang" "Lang" NOT NULL DEFAULT 'en',
    "aNumberEnc" TEXT,
    "aNumberHash" TEXT,
    "immigrationStatusEnc" TEXT,
    "countryOfBirth" TEXT,
    "citizenships" TEXT[],
    "state" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "lang" "Lang" NOT NULL,
    "personId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "disclosuresAccepted" BOOLEAN NOT NULL DEFAULT false,
    "disclosuresVersion" TEXT,
    "recordingConsent" BOOLEAN NOT NULL DEFAULT false,
    "urgentFlags" "UrgentFlag"[],
    "state" TEXT NOT NULL DEFAULT 'start',
    "transcriptRefEnc" TEXT,
    "summaryEnc" TEXT,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeRecord" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "goal" "Goal" NOT NULL,
    "modules" JSONB NOT NULL DEFAULT '{}',
    "sensitiveModulesEnc" TEXT,
    "uncertainFields" TEXT[],
    "discussWithAttorney" TEXT[],
    "documents" JSONB NOT NULL DEFAULT '[]',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "pathways" JSONB NOT NULL DEFAULT '[]',
    "redFlagsEnc" TEXT,
    "deadlines" JSONB NOT NULL DEFAULT '[]',
    "documentChecklist" JSONB NOT NULL DEFAULT '[]',
    "memoMarkdownEnc" TEXT,
    "rulesVersion" TEXT NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'pending_review',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewItem" (
    "id" TEXT NOT NULL,
    "kind" "ReviewKind" NOT NULL,
    "personId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "questionEnc" TEXT,
    "aiDraftEnc" TEXT NOT NULL,
    "finalTextEnc" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'open',
    "attorneyId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "requestId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_crmId_key" ON "Person"("crmId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_aNumberHash_key" ON "Person"("aNumberHash");

-- CreateIndex
CREATE INDEX "Person_phone_idx" ON "Person"("phone");

-- CreateIndex
CREATE INDEX "Person_email_idx" ON "Person"("email");

-- CreateIndex
CREATE INDEX "Conversation_personId_idx" ON "Conversation"("personId");

-- CreateIndex
CREATE INDEX "Conversation_startedAt_idx" ON "Conversation"("startedAt");

-- CreateIndex
CREATE INDEX "IntakeRecord_conversationId_idx" ON "IntakeRecord"("conversationId");

-- CreateIndex
CREATE INDEX "Assessment_status_idx" ON "Assessment"("status");

-- CreateIndex
CREATE INDEX "ReviewItem_status_createdAt_idx" ON "ReviewItem"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewItem_personId_idx" ON "ReviewItem"("personId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_at_idx" ON "AuditLog"("actorId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_action_at_idx" ON "AuditLog"("action", "at");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeRecord" ADD CONSTRAINT "IntakeRecord_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "IntakeRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AuditLog is append-only (CLAUDE.md guardrail 10, section 13).
-- Hand-written: block UPDATE, DELETE and TRUNCATE for every role, including the app role.
CREATE OR REPLACE FUNCTION audit_log_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_block_mutation();
