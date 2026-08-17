-- DropForeignKey
ALTER TABLE "BaselineTask" DROP CONSTRAINT "BaselineTask_taskId_fkey";

-- DropIndex
DROP INDEX "BaselineTask_baselineId_taskId_key";

-- AlterTable
ALTER TABLE "BaselineTask" ALTER COLUMN "taskId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BaselineTask_baselineId_code_key" ON "BaselineTask"("baselineId", "code");

-- AddForeignKey
ALTER TABLE "BaselineTask" ADD CONSTRAINT "BaselineTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

