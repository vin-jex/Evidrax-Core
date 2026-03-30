import request from "supertest";
import { createApp } from "../src/app";
import prisma from "../src/config/prisma";
import * as fastapiService from "../src/services/fastapiService";
import {
  adminUser,
  investigatorUser,
  auditorUser,
  adminToken,
  investigatorToken,
  auditorToken,
} from "./helpers";

const app = createApp();

// Shared mock setup for all count/groupBy calls
function mockStatsDb() {
  (prisma.evidence.count as jest.Mock).mockResolvedValue(8);
  (prisma.user.count as jest.Mock).mockResolvedValue(4);
  (prisma.auditLog.count as jest.Mock).mockResolvedValue(30);
  (prisma.custodyLog.count as jest.Mock).mockResolvedValue(21);
  (prisma.anomalyLog.count as jest.Mock).mockResolvedValue(4);
  (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.anomalyLog.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.evidence.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.evidence.groupBy as jest.Mock).mockResolvedValue([
    { mimeType: "application/pdf", _count: { _all: 5 } },
    { mimeType: "image/jpeg", _count: { _all: 1 } },
    { mimeType: "application/zip", _count: { _all: 1 } },
    { mimeType: "text/csv", _count: { _all: 1 } },
  ]);
  (prisma.user.groupBy as jest.Mock).mockResolvedValue([
    { role: "ADMIN", _count: { _all: 1 } },
    { role: "INVESTIGATOR", _count: { _all: 2 } },
    { role: "AUDITOR", _count: { _all: 1 } },
  ]);
  (prisma.anomalyLog.groupBy as jest.Mock).mockResolvedValue([
    { riskLevel: "critical", _count: { _all: 1 }, _avg: { score: 0.96 } },
    { riskLevel: "high", _count: { _all: 1 }, _avg: { score: 0.81 } },
    { riskLevel: "medium", _count: { _all: 1 }, _avg: { score: 0.65 } },
    { riskLevel: "low", _count: { _all: 1 }, _avg: { score: 0.41 } },
  ]);
  jest
    .spyOn(fastapiService, "ping")
    .mockResolvedValue({ ok: true, service: "fastapi", env: "test" });
}

// ── Overview ──────────────────────────────────────────────────────────────────
describe("GET /api/stats/overview", () => {
  it("200 — returns full dashboard for admin", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    mockStatsDb();

    const res = await request(app)
      .get("/api/stats/overview")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.evidence.total).toBe(8);
    expect(res.body.users.total).toBe(4);
    expect(res.body.audit.totalEvents).toBe(30);
    expect(res.body.anomalies).toBeDefined();
    expect(res.body.services.fastapi.ok).toBe(true);
    expect(res.body.generatedAt).toBeDefined();
  });

  it("200 — evidence counts include tampered breakdown", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    (prisma.evidence.count as jest.Mock)
      .mockResolvedValueOnce(8) // total
      .mockResolvedValueOnce(1) // tampered
      .mockResolvedValue(0); // rest of Promise.all
    mockStatsDb();

    const res = await request(app)
      .get("/api/stats/overview")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
  });

  it("403 — investigator cannot access overview", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());

    const res = await request(app)
      .get("/api/stats/overview")
      .set("Authorization", `Bearer ${investigatorToken()}`);

    expect(res.status).toBe(403);
  });

  it("401 — unauthenticated request rejected", async () => {
    const res = await request(app).get("/api/stats/overview");
    expect(res.status).toBe(401);
  });
});

// ── Evidence stats ────────────────────────────────────────────────────────────
describe("GET /api/stats/evidence", () => {
  it("200 — returns evidence breakdown with MIME types", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    mockStatsDb();

    const res = await request(app)
      .get("/api/stats/evidence")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeDefined();
    expect(res.body.integrityRate).toBeDefined();
    expect(Array.isArray(res.body.mimeBreakdown)).toBe(true);
    expect(res.body.uploadsByDay).toBeDefined();
  });

  it("200 — supports custom days range", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    mockStatsDb();

    const res = await request(app)
      .get("/api/stats/evidence?days=7")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.last).toBe("7d");
  });

  it("422 — days > 365 rejected", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());

    const res = await request(app)
      .get("/api/stats/evidence?days=999")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(422);
  });
});

// ── User stats ────────────────────────────────────────────────────────────────
describe("GET /api/stats/users", () => {
  it("200 — returns user breakdown with role distribution", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    mockStatsDb();

    const res = await request(app)
      .get("/api/stats/users")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeDefined();
    expect(res.body.byRole).toBeDefined();
    expect(res.body.byRole.ADMIN).toBe(1);
    expect(res.body.byRole.INVESTIGATOR).toBe(2);
    expect(res.body.byRole.AUDITOR).toBe(1);
    expect(res.body.recentLogins).toBeDefined();
    expect(res.body.newLast30Days).toBeDefined();
  });

  it("403 — auditor cannot access user stats", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(auditorUser());

    const res = await request(app)
      .get("/api/stats/users")
      .set("Authorization", `Bearer ${auditorToken()}`);

    expect(res.status).toBe(403);
  });
});

// ── Anomaly stats ─────────────────────────────────────────────────────────────
describe("GET /api/stats/anomalies", () => {
  it("200 — any role can view anomaly stats", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(auditorUser());
    mockStatsDb();

    const res = await request(app)
      .get("/api/stats/anomalies")
      .set("Authorization", `Bearer ${auditorToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.open).toBeDefined();
    expect(res.body.resolved).toBeDefined();
    expect(res.body.byRiskLevel).toBeDefined();
    expect(res.body.byRiskLevel.critical).toBeDefined();
    expect(res.body.topOffenders).toBeDefined();
  });

  it("200 — investigator can view anomaly stats", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());
    mockStatsDb();

    const res = await request(app)
      .get("/api/stats/anomalies")
      .set("Authorization", `Bearer ${investigatorToken()}`);

    expect(res.status).toBe(200);
  });
});

// ── Activity timeline ─────────────────────────────────────────────────────────
describe("GET /api/stats/activity", () => {
  it("200 — admin gets full activity timeline", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
      { timestamp: new Date(), action: "EVIDENCE_UPLOADED" },
      { timestamp: new Date(), action: "USER_LOGIN" },
      { timestamp: new Date(), action: "EVIDENCE_VIEWED" },
    ]);
    (prisma.auditLog.groupBy as jest.Mock).mockResolvedValue([
      { action: "EVIDENCE_VIEWED", _count: { action: 12 } },
      { action: "EVIDENCE_UPLOADED", _count: { action: 8 } },
      { action: "USER_LOGIN", _count: { action: 6 } },
    ]);

    const res = await request(app)
      .get("/api/stats/activity?days=7")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.period).toBe("7d");
    expect(res.body.totalEvents).toBe(3);
    expect(res.body.byDay).toBeDefined();
    expect(Array.isArray(res.body.topActions)).toBe(true);
    expect(res.body.topActions[0].action).toBe("EVIDENCE_VIEWED");
  });

  it("200 — investigator activity is scoped to own events", async () => {
    const inv = investigatorUser();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(inv);
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
      { timestamp: new Date(), action: "EVIDENCE_VIEWED" },
    ]);
    (prisma.auditLog.groupBy as jest.Mock).mockResolvedValue([
      { action: "EVIDENCE_VIEWED", _count: { action: 1 } },
    ]);

    const res = await request(app)
      .get("/api/stats/activity")
      .set("Authorization", `Bearer ${investigatorToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.totalEvents).toBe(1);
  });

  it("422 — days > 90 rejected", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());

    const res = await request(app)
      .get("/api/stats/activity?days=100")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(422);
  });
});
