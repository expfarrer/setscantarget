-- CreateTable
CREATE TABLE "PRReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL DEFAULT 'github',
    "prUrl" TEXT NOT NULL,
    "repoOwner" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "title" TEXT,
    "author" TEXT,
    "headRef" TEXT,
    "baseRef" TEXT,
    "checksStatus" TEXT,
    "reviewStatus" TEXT,
    "overallRisk" TEXT,
    "mergeRecommendation" TEXT,
    "maintainabilityStatus" TEXT,
    "highRiskCount" INTEGER NOT NULL DEFAULT 0,
    "exposureRiskCount" INTEGER NOT NULL DEFAULT 0,
    "testGapCount" INTEGER NOT NULL DEFAULT 0,
    "anatomyLogicPct" REAL NOT NULL DEFAULT 0,
    "anatomyTestsPct" REAL NOT NULL DEFAULT 0,
    "anatomyConfigPct" REAL NOT NULL DEFAULT 0,
    "anatomyNoisePct" REAL NOT NULL DEFAULT 0,
    "reviewerAssigned" BOOLEAN,
    "prSize" TEXT,
    "stale" BOOLEAN,
    "rawPayloadJson" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PRReviewFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prReviewId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "whyFlagged" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "startLine" INTEGER,
    "endLine" INTEGER,
    "snippet" TEXT,
    "scoreImpact" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PRReviewFinding_prReviewId_fkey" FOREIGN KEY ("prReviewId") REFERENCES "PRReview" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PRReview_status_idx" ON "PRReview"("status");

-- CreateIndex
CREATE INDEX "PRReviewFinding_prReviewId_idx" ON "PRReviewFinding"("prReviewId");

-- CreateIndex
CREATE INDEX "PRReviewFinding_severity_idx" ON "PRReviewFinding"("severity");
