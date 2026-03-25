-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PRReviewFinding" (
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
    "isRedacted" BOOLEAN NOT NULL DEFAULT false,
    "redactedSnippet" TEXT,
    "revealedSnippet" TEXT,
    "scoreImpact" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PRReviewFinding_prReviewId_fkey" FOREIGN KEY ("prReviewId") REFERENCES "PRReview" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PRReviewFinding" ("category", "createdAt", "endLine", "filePath", "id", "metadataJson", "prReviewId", "ruleId", "scoreImpact", "severity", "snippet", "startLine", "suggestion", "summary", "title", "whyFlagged") SELECT "category", "createdAt", "endLine", "filePath", "id", "metadataJson", "prReviewId", "ruleId", "scoreImpact", "severity", "snippet", "startLine", "suggestion", "summary", "title", "whyFlagged" FROM "PRReviewFinding";
DROP TABLE "PRReviewFinding";
ALTER TABLE "new_PRReviewFinding" RENAME TO "PRReviewFinding";
CREATE INDEX "PRReviewFinding_prReviewId_idx" ON "PRReviewFinding"("prReviewId");
CREATE INDEX "PRReviewFinding_severity_idx" ON "PRReviewFinding"("severity");
CREATE INDEX "PRReviewFinding_category_idx" ON "PRReviewFinding"("category");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
