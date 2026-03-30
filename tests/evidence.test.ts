import request from "supertest";
import { createApp } from "../src/app";
import prisma from "../src/config/prisma";
import * as evidenceService from "../src/services/evidenceService";
import {
  adminUser,
  investigatorUser,
  auditorUser,
  adminToken,
  investigatorToken,
  auditorToken,
  makeEvidence,
} from "./helpers";

const app = createApp();

const mockEvidence = makeEvidence();
const tamperedEvidence = makeEvidence({
  id: "seed-evid-0008-0000-0000-000000000008",
  title: "[TAMPERED] Original Arrest Report",
  isTampered: true,
  viewUrl:
    "https://res.cloudinary.com/evidrax/raw/upload/fl_attachment:false/v1/forensics/arrest_report.pdf",
});

// ── Upload evidence ───────────────────────────────────────────────────────────
describe("POST /api/evidence", () => {
  it("201 — investigator can upload a PDF", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());
    jest
      .spyOn(evidenceService, "uploadEvidence")
      .mockResolvedValue(mockEvidence as any);

    const res = await request(app)
      .post("/api/evidence")
      .set("Authorization", `Bearer ${investigatorToken()}`)
      .attach("file", Buffer.from("%PDF-1.4 mock"), "report.pdf")
      .field("title", "Forensic Report — Device Analysis")
      .field("description", "PDF report for Case #2024-0091");

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.hashSha256).toBeDefined();
  });

  it("201 — admin can upload evidence", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    jest
      .spyOn(evidenceService, "uploadEvidence")
      .mockResolvedValue(mockEvidence as any);

    const res = await request(app)
      .post("/api/evidence")
      .set("Authorization", `Bearer ${adminToken()}`)
      .attach("file", Buffer.from("image data"), "cctv.jpg")
      .field("title", "CCTV Snapshot");

    expect(res.status).toBe(201);
  });

  it("403 — auditor cannot upload evidence", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(auditorUser());

    const res = await request(app)
      .post("/api/evidence")
      .set("Authorization", `Bearer ${auditorToken()}`)
      .attach("file", Buffer.from("data"), "file.pdf")
      .field("title", "Some Title");

    expect(res.status).toBe(403);
  });

  it("400 — missing file returns 400", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());

    const res = await request(app)
      .post("/api/evidence")
      .set("Authorization", `Bearer ${investigatorToken()}`)
      .send({ title: "Missing File Evidence" });

    expect(res.status).toBe(400);
  });

  it("422 — missing title returns 422", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());

    const res = await request(app)
      .post("/api/evidence")
      .set("Authorization", `Bearer ${investigatorToken()}`)
      .attach("file", Buffer.from("data"), "file.pdf");

    expect(res.status).toBe(422);
  });

  it("401 — unauthenticated upload rejected", async () => {
    const res = await request(app)
      .post("/api/evidence")
      .attach("file", Buffer.from("data"), "file.pdf")
      .field("title", "Some Evidence");
    expect(res.status).toBe(401);
  });
});

// ── List evidence ─────────────────────────────────────────────────────────────
describe("GET /api/evidence", () => {
  it("200 — any role can list evidence", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(auditorUser());
    jest
      .spyOn(evidenceService, "listEvidence")
      .mockResolvedValue([mockEvidence] as any);

    const res = await request(app)
      .get("/api/evidence")
      .set("Authorization", `Bearer ${auditorToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("200 — supports pagination with skip and limit", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    jest.spyOn(evidenceService, "listEvidence").mockResolvedValue([] as any);

    const res = await request(app)
      .get("/api/evidence?skip=10&limit=5")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
  });

  it("401 — unauthenticated request rejected", async () => {
    const res = await request(app).get("/api/evidence");
    expect(res.status).toBe(401);
  });
});

// ── Get single evidence ───────────────────────────────────────────────────────
describe("GET /api/evidence/:id", () => {
  it("200 — returns evidence with viewUrl", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());
    jest
      .spyOn(evidenceService, "getEvidence")
      .mockResolvedValue(mockEvidence as any);

    const res = await request(app)
      .get(`/api/evidence/${mockEvidence.id}`)
      .set("Authorization", `Bearer ${investigatorToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(mockEvidence.id);
    expect(res.body.viewUrl).toBeDefined();
  });

  it("404 — unknown ID returns 404", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());
    jest
      .spyOn(evidenceService, "getEvidence")
      .mockRejectedValue(
        Object.assign(new Error("Evidence not found"), { statusCode: 404 }),
      );

    const res = await request(app)
      .get("/api/evidence/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${investigatorToken()}`);

    expect(res.status).toBe(404);
  });

  it("422 — non-UUID id returns 422", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());

    const res = await request(app)
      .get("/api/evidence/not-a-uuid")
      .set("Authorization", `Bearer ${investigatorToken()}`);

    expect(res.status).toBe(422);
  });
});

// ── Verify integrity ─────────────────────────────────────────────────────────
describe("POST /api/evidence/:id/verify", () => {
  it("200 — valid hash returns valid: true", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());
    jest.spyOn(evidenceService, "verifyEvidence").mockResolvedValue({
      evidenceId: mockEvidence.id,
      valid: true,
      storedHash: mockEvidence.hashSha256,
      currentHash: mockEvidence.hashSha256,
      message: "Evidence integrity verified",
      verifiedAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/evidence/${mockEvidence.id}/verify`)
      .set("Authorization", `Bearer ${investigatorToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it("200 — tampered evidence returns valid: false with mismatch hashes", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    jest.spyOn(evidenceService, "verifyEvidence").mockResolvedValue({
      evidenceId: tamperedEvidence.id,
      valid: false,
      storedHash: tamperedEvidence.hashSha256,
      currentHash:
        "000000000000000000000000000000000000000000000000000000000000dead",
      message: "TAMPER DETECTED: hash mismatch",
      verifiedAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/evidence/${tamperedEvidence.id}/verify`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.message).toMatch(/TAMPER/);
    expect(res.body.storedHash).not.toBe(res.body.currentHash);
  });
});

// ── Custody chain ─────────────────────────────────────────────────────────────
describe("GET /api/evidence/:id/custody", () => {
  it("200 — returns ordered custody log", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(auditorUser());
    jest.spyOn(evidenceService, "getCustodyChain").mockResolvedValue([
      {
        id: "c1",
        evidenceId: mockEvidence.id,
        userId: "seed-user-0002",
        action: "UPLOAD",
        timestamp: new Date(),
        ipAddress: "197.210.65.1",
        notes: "Initial upload",
        location: null,
        user: {
          id: "seed-user-0002",
          email: "james.okafor@evidrax.io",
          fullName: "James Okafor",
          role: "INVESTIGATOR",
        },
      },
      {
        id: "c2",
        evidenceId: mockEvidence.id,
        userId: "seed-user-0002",
        action: "VIEW",
        timestamp: new Date(),
        ipAddress: "197.210.65.1",
        notes: null,
        location: null,
        user: {
          id: "seed-user-0002",
          email: "james.okafor@evidrax.io",
          fullName: "James Okafor",
          role: "INVESTIGATOR",
        },
      },
      {
        id: "c3",
        evidenceId: mockEvidence.id,
        userId: "seed-user-0001",
        action: "VERIFY",
        timestamp: new Date(),
        ipAddress: "197.210.10.5",
        notes: "Passed",
        location: null,
        user: {
          id: "seed-user-0001",
          email: "admin@evidrax.io",
          fullName: "System Administrator",
          role: "ADMIN",
        },
      },
    ] as any);

    const res = await request(app)
      .get(`/api/evidence/${mockEvidence.id}/custody`)
      .set("Authorization", `Bearer ${auditorToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
    expect(res.body[0].action).toBe("UPLOAD");
    expect(res.body[2].action).toBe("VERIFY");
  });
});
