import request from "supertest";
import { createApp } from "../src/app";
import prisma from "../src/config/prisma";
import * as auditService from "../src/services/auditService";
import {
  adminUser,
  investigatorUser,
  auditorUser,
  adminToken,
  investigatorToken,
  auditorToken,
} from "./helpers";

const app = createApp();

const mockAuditItems = [
  {
    id: "al-1",
    action: "EVIDENCE_UPLOADED",
    userId: "seed-user-0002",
    resourceType: "evidence",
    resourceId: "seed-evid-0001",
    metadata: {},
    timestamp: new Date(),
    ipAddress: "197.210.65.1",
  },
  {
    id: "al-2",
    action: "USER_LOGIN",
    userId: "seed-user-0002",
    resourceType: "user",
    resourceId: "seed-user-0002",
    metadata: {},
    timestamp: new Date(),
    ipAddress: "197.210.65.1",
  },
  {
    id: "al-3",
    action: "TAMPER_DETECTED",
    userId: "seed-user-0001",
    resourceType: "evidence",
    resourceId: "seed-evid-0008",
    metadata: { storedHash: "abc", currentHash: "dead" },
    timestamp: new Date(),
    ipAddress: "197.210.10.5",
  },
];

// ── Query audit logs ──────────────────────────────────────────────────────────
describe("GET /api/logs/audit", () => {
  it("200 — admin sees all audit logs", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    jest
      .spyOn(auditService, "queryAuditLogs")
      .mockResolvedValue({ total: 3, items: mockAuditItems as any });

    const res = await request(app)
      .get("/api/logs/audit")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items.length).toBe(3);
  });

  it("200 — auditor can read all audit logs", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(auditorUser());
    jest
      .spyOn(auditService, "queryAuditLogs")
      .mockResolvedValue({ total: 3, items: mockAuditItems as any });

    const res = await request(app)
      .get("/api/logs/audit")
      .set("Authorization", `Bearer ${auditorToken()}`);

    expect(res.status).toBe(200);
  });

  it("200 — investigator is scoped to own logs", async () => {
    const inv = investigatorUser();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(inv);

    const spy = jest.spyOn(auditService, "queryAuditLogs").mockResolvedValue({
      total: 2,
      items: mockAuditItems.filter((l) => l.userId === "seed-user-0002") as any,
    });

    const res = await request(app)
      .get("/api/logs/audit")
      .set("Authorization", `Bearer ${investigatorToken()}`);

    expect(res.status).toBe(200);
    // Scoping injects userId of the investigator
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: inv.id }),
    );
  });

  it("200 — supports filtering by action", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    jest.spyOn(auditService, "queryAuditLogs").mockResolvedValue({
      total: 1,
      items: [mockAuditItems[2]] as any,
    });

    const res = await request(app)
      .get("/api/logs/audit?action=TAMPER_DETECTED")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.items[0].action).toBe("TAMPER_DETECTED");
  });

  it("200 — supports date range filtering", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    jest
      .spyOn(auditService, "queryAuditLogs")
      .mockResolvedValue({ total: 0, items: [] });

    const res = await request(app)
      .get(
        "/api/logs/audit?fromDate=2024-01-01T00:00:00Z&toDate=2024-12-31T23:59:59Z",
      )
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
  });

  it("422 — invalid UUID in userId param rejected", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());

    const res = await request(app)
      .get("/api/logs/audit?userId=not-a-uuid")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(422);
  });

  it("401 — unauthenticated request rejected", async () => {
    const res = await request(app).get("/api/logs/audit");
    expect(res.status).toBe(401);
  });
});

// ── Write access event ────────────────────────────────────────────────────────
describe("POST /api/logs/access", () => {
  const payload = {
    userId: "seed-user-0002-0000-0000-000000000002",
    evidenceId: "seed-evid-0001-0000-0000-000000000001",
    action: "EVIDENCE_DOWNLOADED",
    ip: "197.210.65.1",
  };

  it("201 — any authenticated role can write an access event", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(auditorUser());
    jest
      .spyOn(auditService, "log")
      .mockResolvedValue({ id: "new-log-id", timestamp: new Date() } as any);

    const res = await request(app)
      .post("/api/logs/access")
      .set("Authorization", `Bearer ${auditorToken()}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });

  it("422 — invalid evidenceId UUID rejected", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());

    const res = await request(app)
      .post("/api/logs/access")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ ...payload, evidenceId: "not-a-uuid" });

    expect(res.status).toBe(422);
  });

  it("422 — missing action rejected", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());

    const res = await request(app)
      .post("/api/logs/access")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ userId: payload.userId, evidenceId: payload.evidenceId });

    expect(res.status).toBe(422);
  });
});
