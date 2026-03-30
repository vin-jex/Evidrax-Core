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

const allUsers = [
  {
    id: "seed-user-0001",
    email: "admin@evidrax.io",
    fullName: "System Administrator",
    role: "ADMIN",
    isActive: true,
    createdAt: new Date(),
  },
  {
    id: "seed-user-0002",
    email: "james.okafor@evidrax.io",
    fullName: "James Okafor",
    role: "INVESTIGATOR",
    isActive: true,
    createdAt: new Date(),
  },
  {
    id: "seed-user-0003",
    email: "amara.nwosu@evidrax.io",
    fullName: "Amara Nwosu",
    role: "INVESTIGATOR",
    isActive: true,
    createdAt: new Date(),
  },
  {
    id: "seed-user-0004",
    email: "chidi.eze@evidrax.io",
    fullName: "Chidi Eze",
    role: "AUDITOR",
    isActive: true,
    createdAt: new Date(),
  },
];

// ── List users ────────────────────────────────────────────────────────────────
describe("GET /api/admin/users", () => {
  it("200 — admin can list all users", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    (prisma.user.findMany as jest.Mock).mockResolvedValue(allUsers);

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(4);
    expect(res.body.some((u: any) => u.role === "ADMIN")).toBe(true);
    expect(res.body.some((u: any) => u.role === "INVESTIGATOR")).toBe(true);
    expect(res.body.some((u: any) => u.role === "AUDITOR")).toBe(true);
  });

  it("403 — investigator cannot list users", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${investigatorToken()}`);

    expect(res.status).toBe(403);
  });

  it("403 — auditor cannot list users", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(auditorUser());

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${auditorToken()}`);

    expect(res.status).toBe(403);
  });

  it("401 — unauthenticated request rejected", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });
});

// ── Update user ───────────────────────────────────────────────────────────────
describe("PATCH /api/admin/users/:id", () => {
  const TARGET_ID = "seed-user-0002-0000-0000-000000000002";

  it("200 — admin can update a user role", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    (prisma.user.update as jest.Mock).mockResolvedValue({
      ...allUsers[1],
      role: "AUDITOR",
    });

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ role: "AUDITOR" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("AUDITOR");
  });

  it("200 — admin can update fullName", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    (prisma.user.update as jest.Mock).mockResolvedValue({
      ...allUsers[1],
      fullName: "James O. Revised",
    });

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ fullName: "James O. Revised" });

    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("James O. Revised");
  });

  it("422 — invalid role value rejected", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ role: "SUPERUSER" });

    expect(res.status).toBe(422);
  });

  it("403 — investigator cannot update users", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set("Authorization", `Bearer ${investigatorToken()}`)
      .send({ role: "ADMIN" });

    expect(res.status).toBe(403);
  });
});

// ── Deactivate user ───────────────────────────────────────────────────────────
describe("DELETE /api/admin/users/:id", () => {
  const TARGET_ID = "seed-user-0003-0000-0000-000000000003";

  it("204 — admin can deactivate another user", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());
    (prisma.user.update as jest.Mock).mockResolvedValue({
      ...allUsers[2],
      isActive: false,
    });

    const res = await request(app)
      .delete(`/api/admin/users/${TARGET_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(204);
  });

  it("400 — admin cannot deactivate own account", async () => {
    const admin = adminUser();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(admin);

    const res = await request(app)
      .delete(`/api/admin/users/${admin.id}`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Cannot deactivate/);
  });

  it("403 — non-admin cannot deactivate users", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());

    const res = await request(app)
      .delete(`/api/admin/users/${TARGET_ID}`)
      .set("Authorization", `Bearer ${investigatorToken()}`);

    expect(res.status).toBe(403);
  });
});

// ── System stats ──────────────────────────────────────────────────────────────
describe("GET /api/admin/stats", () => {
  beforeEach(() => {
    (prisma.evidence.count as jest.Mock).mockResolvedValue(8);
    (prisma.user.count as jest.Mock).mockResolvedValue(4);
    (prisma.auditLog.count as jest.Mock).mockResolvedValue(30);
    (prisma.custodyLog.count as jest.Mock).mockResolvedValue(21);
    (prisma.anomalyLog.count as jest.Mock).mockResolvedValue(4);
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
    jest
      .spyOn(fastapiService, "ping")
      .mockResolvedValue({ ok: true, service: "fastapi", env: "test" });
  });

  it("200 — admin gets full stats breakdown", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());

    const res = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.evidence).toBeDefined();
    expect(res.body.users).toBeDefined();
    expect(res.body.audit).toBeDefined();
    expect(res.body.anomalies).toBeDefined();
    expect(res.body.services.fastapi.ok).toBe(true);
  });

  it("403 — investigator cannot access admin stats", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());

    const res = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${investigatorToken()}`);

    expect(res.status).toBe(403);
  });
});
