-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('ROAD', 'SEA', 'RAIL', 'AIR', 'MULTIMODAL');

-- CreateEnum
CREATE TYPE "ProcurementLegKind" AS ENUM ('APPROVAL', 'PURCHASE_ORDER', 'PRODUCTION', 'LOADING', 'TRANSIT', 'CUSTOMS', 'DELIVERY');

-- CreateEnum
CREATE TYPE "ProcurementStatus" AS ENUM ('PLANNED', 'ORDERED', 'IN_PRODUCTION', 'IN_TRANSIT', 'CUSTOMS', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ProcurementPackage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "spec" TEXT,
    "supplierId" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "transportMode" "TransportMode",
    "consumingTaskId" TEXT,
    "bufferDays" INTEGER NOT NULL DEFAULT 0,
    "currentEtaDate" TIMESTAMP(3),
    "orderedDate" TIMESTAMP(3),
    "status" "ProcurementStatus" NOT NULL DEFAULT 'PLANNED',
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementLeg" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "kind" "ProcurementLegKind" NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "ProcurementLeg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcurementPackage_projectId_status_idx" ON "ProcurementPackage"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementPackage_projectId_code_key" ON "ProcurementPackage"("projectId", "code");

-- CreateIndex
CREATE INDEX "ProcurementLeg_packageId_sequence_idx" ON "ProcurementLeg"("packageId", "sequence");

-- AddForeignKey
ALTER TABLE "ProcurementPackage" ADD CONSTRAINT "ProcurementPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementPackage" ADD CONSTRAINT "ProcurementPackage_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementPackage" ADD CONSTRAINT "ProcurementPackage_consumingTaskId_fkey" FOREIGN KEY ("consumingTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementLeg" ADD CONSTRAINT "ProcurementLeg_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ProcurementPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

