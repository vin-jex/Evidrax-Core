import { mockDeep, mockReset } from "jest-mock-extended";
import prisma from "../src/config/prisma";

jest.mock("../src/config/prisma", () => ({
  __esModule: true,
  default: mockDeep(),
  prisma: mockDeep(),
}));

jest.mock("../src/config/redis", () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  getRedis: jest.fn(),
}));

jest.mock("../src/services/storageService", () => ({
  uploadFile: jest.fn().mockResolvedValue({
    url: "https://res.cloudinary.com/test/raw/upload/v1/forensics/test.pdf",
    publicId: "forensics/test",
    sha256: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    fileSize: 1024,
  }),
  recomputeHashFromUrl: jest
    .fn()
    .mockResolvedValue(
      "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    ),
  deleteFile: jest.fn().mockResolvedValue({ result: "ok" }),
}));

jest.mock("../src/services/fastapiService", () => ({
  analyzeAnomalies: jest.fn().mockResolvedValue({
    anomalyDetected: false,
    riskLevel: "low",
    score: 0.5,
    details: [],
    analyzedAt: new Date().toISOString(),
  }),
  trainModel: jest.fn().mockResolvedValue({ status: "trained", samples: 10 }),
  ping: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock("../src/services/alertService", () => ({
  sendAlert: jest.fn().mockResolvedValue(undefined),
  sendTamperAlert: jest.fn().mockResolvedValue(undefined),
  sendAnomalyAlert: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../src/services/auditService", () => ({
  log: jest.fn().mockResolvedValue({ id: "audit-1", timestamp: new Date() }),
  logCustody: jest
    .fn()
    .mockResolvedValue({ id: "custody-1", timestamp: new Date() }),
  queryAuditLogs: jest.fn().mockResolvedValue({ total: 0, items: [] }),
}));

beforeEach(() => {
  mockReset(prisma);
});
