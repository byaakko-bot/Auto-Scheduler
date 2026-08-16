-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "finishShiftDays" INTEGER,
    "isFeasible" BOOLEAN,
    "evaluatedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioChange" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "taskCode" TEXT NOT NULL,
    "predecessorCode" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "dependencyType" TEXT,
    "constraintType" TEXT,
    "note" TEXT,

    CONSTRAINT "ScenarioChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Scenario_projectId_name_key" ON "Scenario"("projectId", "name");

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioChange" ADD CONSTRAINT "ScenarioChange_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

