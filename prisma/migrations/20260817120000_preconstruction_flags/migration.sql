-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "designComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permitsObtained" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "procurementPlaced" BOOLEAN NOT NULL DEFAULT false;

