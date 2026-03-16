-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetUrl" TEXT NOT NULL,
    "normalizedOrigin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "optionsJson" TEXT NOT NULL DEFAULT '{}',
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "pagesScanned" INTEGER NOT NULL DEFAULT 0,
    "requestsCaptured" INTEGER NOT NULL DEFAULT 0,
    "findingsCount" INTEGER NOT NULL DEFAULT 0,
    "highCount" INTEGER NOT NULL DEFAULT 0,
    "mediumCount" INTEGER NOT NULL DEFAULT 0,
    "lowCount" INTEGER NOT NULL DEFAULT 0,
    "infoCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ScannedPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "statusCode" INTEGER,
    "contentType" TEXT,
    "title" TEXT,
    "htmlSnapshot" TEXT,
    "headersJson" TEXT,
    "storageJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScannedPage_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NetworkRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "pageId" TEXT,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "resourceType" TEXT,
    "statusCode" INTEGER,
    "requestHeadersJson" TEXT,
    "responseHeadersJson" TEXT,
    "responseSnippet" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NetworkRequest_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NetworkRequest_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ScannedPage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "pageId" TEXT,
    "requestId" TEXT,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "assetUrl" TEXT,
    "evidence" TEXT NOT NULL,
    "confidence" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Finding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Finding_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ScannedPage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Finding_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "NetworkRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScanLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanLog_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
