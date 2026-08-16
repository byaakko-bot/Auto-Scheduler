-- CreateEnum
CREATE TYPE "ConstraintType" AS ENUM ('SNET', 'FNLT', 'MSO', 'MFO');

-- CreateEnum
CREATE TYPE "CriticalityBand" AS ENUM ('CRITICAL', 'NEAR_CRITICAL', 'WATCH', 'NORMAL');

-- CreateEnum
CREATE TYPE "BaselineStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "defaultCalendarId" TEXT,
ADD COLUMN     "nearCriticalThresholdDays" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "watchThresholdDays" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "actualQuantity" DOUBLE PRECISION,
ADD COLUMN     "calendarId" TEXT,
ADD COLUMN     "constraintDate" TIMESTAMP(3),
ADD COLUMN     "constraintType" "ConstraintType",
ADD COLUMN     "criticalityBand" "CriticalityBand" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "earlyFinishOffset" INTEGER,
ADD COLUMN     "earlyStartOffset" INTEGER,
ADD COLUMN     "freeFloatDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lateFinishOffset" INTEGER,
ADD COLUMN     "lateStartOffset" INTEGER,
ADD COLUMN     "remainingDurationDays" INTEGER;

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "calendarId" TEXT,
ADD COLUMN     "capacity" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Calendar" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "workingWeek" BOOLEAN[],
    "hoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarException" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "working" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,

    CONSTRAINT "CalendarException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Baseline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BaselineStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Baseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaselineTask" (
    "id" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "floatDays" INTEGER NOT NULL DEFAULT 0,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BaselineTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleRevision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "author" TEXT,
    "reason" TEXT,
    "changeCount" INTEGER NOT NULL DEFAULT 0,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Calendar_projectId_name_key" ON "Calendar"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarException_calendarId_date_key" ON "CalendarException"("calendarId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Baseline_projectId_name_key" ON "Baseline"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BaselineTask_baselineId_taskId_key" ON "BaselineTask"("baselineId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleRevision_projectId_revisionNo_key" ON "ScheduleRevision"("projectId", "revisionNo");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "Task_projectId_sortOrder_idx" ON "Task"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "Task_projectId_criticalityBand_idx" ON "Task"("projectId", "criticalityBand");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_code_key" ON "Task"("projectId", "code");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultCalendarId_fkey" FOREIGN KEY ("defaultCalendarId") REFERENCES "Calendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calendar" ADD CONSTRAINT "Calendar_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarException" ADD CONSTRAINT "CalendarException_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Baseline" ADD CONSTRAINT "Baseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaselineTask" ADD CONSTRAINT "BaselineTask_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "Baseline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaselineTask" ADD CONSTRAINT "BaselineTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleRevision" ADD CONSTRAINT "ScheduleRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

