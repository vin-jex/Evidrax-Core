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

const SAMPLE_LOGS = [
  {
    userId: "seed-user-0002-0000-0000-000000000002",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    action: "EVIDENCE_VIEWED",
    evidenceId: "seed-evid-0001-0000-0000-000000000001",
  },
  {
    userId: "seed-user-0002-0000-0000-000000000002",
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    action: "EVIDENCE_UPLOADED",
    evidenceId: "seed-evid-0002-0000-0000-000000000002",
  },
  {
    userId: "seed-user-0002-0000-0000-000000000002",
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    action: "EVIDENCE_VIEWED",
    evidenceId: "seed-evid-0003-0000-0000-000000000003",
  },
];

// ── Analyze ───────────────────────────────────────────────────────────────────
describe("POST /api/ai/analyze", () => {
  it("200 — returns no anomaly for normal activity", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());
    jest.spyOn(fastapiService, "analyzeAnomalies").mockResolvedValue({
      anomalyDetected: false,
      riskLevel: "low",
      score: 0.21,
      details: [],
      analyzedAt: new Date().toISOString(),
    });

    const res = await request(app)
      .post("/api/ai/analyze")
      .set("Authorization", `Bearer ${investigatorToken()}`)
      .send({ logs: SAMPLE_LOGS });

    expect(res.status).toBe(200);
    expect(res.body.anomalyDetected).toBe(false);
    expect(res.body.riskLevel).toBe("low");
  });

  it("200 — persists anomaly record when anomaly is detected", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    (prisma.anomalyLog.create as jest.Mock).mockResolvedValue({
      id: "new-anomaly-id",
    });

    jest.spyOn(fastapiService, "analyzeAnomalies").mockResolvedValue({
      anomalyDetected: true,
      riskLevel: "critical",
      score: 0.96,
      details: [
        {
          userId: "seed-user-0003-0000-0000-000000000003",
          anomaly: true,
          riskLevel: "critical",
          score: 0.96,
          features: {
            access_count: 47,
            is_off_hours: true,
            action_entropy: 1.204,
          },
        },
      ],
      analyzedAt: new Date().toISOString(),
    });

    const res = await request(app)
      .post("/api/ai/analyze")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ logs: SAMPLE_LOGS });

    expect(res.status).toBe(200);
    expect(res.body.anomalyDetected).toBe(true);
    expect(res.body.score).toBe(0.96);
    expect(prisma.anomalyLog.create).toHaveBeenCalled();
  });

  it("422 — empty logs array rejected", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());

    const res = await request(app)
      .post("/api/ai/analyze")
      .set("Authorization", `Bearer ${investigatorToken()}`)
      .send({ logs: [] });

    expect(res.status).toBe(422);
  });

  it("401 — unauthenticated request rejected", async () => {
    const res = await request(app)
      .post("/api/ai/analyze")
      .send({ logs: SAMPLE_LOGS });
    expect(res.status).toBe(401);
  });
});

// ── Train ─────────────────────────────────────────────────────────────────────
describe("POST /api/ai/train", () => {
  const LARGE_LOGS = Array.from({ length: 10 }, (_, i) => ({
    userId: "seed-user-0002",
    timestamp: new Date(Date.now() - i * 3600000).toISOString(),
    action: "EVIDENCE_VIEWED",
  }));

  it("200 — admin can trigger retraining", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    jest
      .spyOn(fastapiService, "trainModel")
      .mockResolvedValue({ status: "trained", samples: 10 });

    const res = await request(app)
      .post("/api/ai/train")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ logs: LARGE_LOGS });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("trained");
  });

  it("403 — investigator cannot train model", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());

    const res = await request(app)
      .post("/api/ai/train")
      .set("Authorization", `Bearer ${investigatorToken()}`)
      .send({ logs: LARGE_LOGS });

    expect(res.status).toBe(403);
  });

  it("422 — fewer than 5 logs rejected", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());

    const res = await request(app)
      .post("/api/ai/train")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ logs: LARGE_LOGS.slice(0, 3) });

    expect(res.status).toBe(422);
  });
});

// ── Get anomalies ─────────────────────────────────────────────────────────────
describe("GET /api/ai/anomalies", () => {
  const mockAnomalies = [
    {
      id: "seed-anom-0002",
      userId: "seed-user-0003",
      riskLevel: "critical",
      score: 0.96,
      isResolved: false,
      createdAt: new Date(),
    },
    {
      id: "seed-anom-0003",
      userId: "seed-user-0002",
      riskLevel: "high",
      score: 0.81,
      isResolved: false,
      createdAt: new Date(),
    },
  ];

  it("200 — returns unresolved anomalies by default", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    (prisma.anomalyLog.findMany as jest.Mock).mockResolvedValue(mockAnomalies);

    const res = await request(app)
      .get("/api/ai/anomalies")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].riskLevel).toBe("critical");
  });

  it("200 — auditor can view anomalies", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(auditorUser());
    (prisma.anomalyLog.findMany as jest.Mock).mockResolvedValue(mockAnomalies);

    const res = await request(app)
      .get("/api/ai/anomalies")
      .set("Authorization", `Bearer ${auditorToken()}`);

    expect(res.status).toBe(200);
  });

  it("200 — ?resolved=true returns resolved anomalies", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    (prisma.anomalyLog.findMany as jest.Mock).mockResolvedValue([
      {
        id: "seed-anom-0001",
        riskLevel: "medium",
        score: 0.62,
        isResolved: true,
        createdAt: new Date(),
      },
    ]);

    const res = await request(app)
      .get("/api/ai/anomalies?resolved=true")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body[0].isResolved).toBe(true);
  });
});

// ── Resolve anomaly ───────────────────────────────────────────────────────────
describe("PATCH /api/ai/anomalies/:id/resolve", () => {
  const ANOMALY_ID = "seed-anom-0002-0000-0000-000000000002";

  it("200 — admin can resolve an anomaly with notes", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    (prisma.anomalyLog.findUnique as jest.Mock).mockResolvedValue({
      id: ANOMALY_ID,
      reason: "Isolation Forest flagged user",
      riskLevel: "critical",
      score: 0.96,
      isResolved: false,
    });
    (prisma.anomalyLog.update as jest.Mock).mockResolvedValue({
      id: ANOMALY_ID,
      isResolved: true,
      resolvedBy: "admin-uuid-5678",
      resolvedAt: new Date(),
      reason:
        "Isolation Forest flagged user\n[Resolved]: Confirmed malicious — account suspended.",
    });

    const res = await request(app)
      .patch(`/api/ai/anomalies/${ANOMALY_ID}/resolve`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ notes: "Confirmed malicious — account suspended." });

    expect(res.status).toBe(200);
    expect(res.body.isResolved).toBe(true);
  });

  it("403 — investigator cannot resolve anomalies", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());

    const res = await request(app)
      .patch(`/api/ai/anomalies/${ANOMALY_ID}/resolve`)
      .set("Authorization", `Bearer ${investigatorToken()}`)
      .send({ notes: "Trying to resolve" });

    expect(res.status).toBe(403);
  });

  it("422 — non-UUID id rejected", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());

    const res = await request(app)
      .patch("/api/ai/anomalies/not-a-uuid/resolve")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});

    expect(res.status).toBe(422);
  });
});
