import request from "supertest";
import { createApp } from "../src/app";
import prisma from "../src/config/prisma";
import * as authService from "../src/services/authService";
import {
  adminUser,
  investigatorUser,
  makeToken,
  adminToken,
  investigatorToken,
} from "./helpers";

const app = createApp();

// ── Bootstrap ────────────────────────────────────────────────────────────────
describe("POST /api/auth/bootstrap", () => {
  it("201 — creates first admin when none exists", async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue(adminUser());

    const res = await request(app).post("/api/auth/bootstrap").send({
      email: "admin@evidrax.io",
      password: "Admin@Evidrax123!",
      fullName: "System Administrator",
    });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe("admin@evidrax.io");
    expect(res.body.passwordHash).toBeUndefined();
  });

  it("403 — rejects if admin already exists", async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(adminUser());

    const res = await request(app).post("/api/auth/bootstrap").send({
      email: "second@evidrax.io",
      password: "Admin@Evidrax123!",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Bootstrap disabled/);
  });

  it("422 — rejects weak password", async () => {
    const res = await request(app).post("/api/auth/bootstrap").send({
      email: "admin@evidrax.io",
      password: "short",
    });
    expect(res.status).toBe(422);
  });

  it("422 — rejects invalid email", async () => {
    const res = await request(app).post("/api/auth/bootstrap").send({
      email: "not-an-email",
      password: "Admin@Evidrax123!",
    });
    expect(res.status).toBe(422);
  });
});

// ── Login ────────────────────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  it("200 — returns token and user on valid credentials", async () => {
    jest.spyOn(authService, "login").mockResolvedValue({
      token: "mock.jwt.token",
      user: {
        ...adminUser(),
        role: "ADMIN" as "ADMIN" | "INVESTIGATOR" | "AUDITOR",
      },
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "admin@evidrax.io",
      password: "Admin@Evidrax123!",
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("401 — wrong password", async () => {
    jest.spyOn(authService, "login").mockRejectedValue(
      Object.assign(new Error("Invalid email or password"), {
        statusCode: 401,
      }),
    );

    const res = await request(app).post("/api/auth/login").send({
      email: "admin@evidrax.io",
      password: "WrongPassword!",
    });
    expect(res.status).toBe(401);
  });

  it("403 — disabled account cannot login", async () => {
    jest
      .spyOn(authService, "login")
      .mockRejectedValue(
        Object.assign(new Error("Account is disabled"), { statusCode: 403 }),
      );

    const res = await request(app).post("/api/auth/login").send({
      email: "disabled@evidrax.io",
      password: "SomePassword123!",
    });
    expect(res.status).toBe(403);
  });

  it("422 — missing password field", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@evidrax.io" });
    expect(res.status).toBe(422);
  });
});

// ── Register ─────────────────────────────────────────────────────────────────
describe("POST /api/auth/register", () => {
  it("201 — admin can register a new investigator", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(adminUser()) // authenticate middleware
      .mockResolvedValueOnce(null); // email uniqueness check
    (prisma.user.create as jest.Mock).mockResolvedValue(investigatorUser());

    const res = await request(app)
      .post("/api/auth/register")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        email: "james.okafor@evidrax.io",
        password: "Investigator@1Pass!",
        role: "INVESTIGATOR",
        fullName: "James Okafor",
      });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("INVESTIGATOR");
  });

  it("403 — non-admin cannot register users", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(investigatorUser());

    const res = await request(app)
      .post("/api/auth/register")
      .set("Authorization", `Bearer ${investigatorToken()}`)
      .send({
        email: "new@evidrax.io",
        password: "NewUser@Pass123!",
        role: "AUDITOR",
      });

    expect(res.status).toBe(403);
  });

  it("401 — unauthenticated request rejected", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "new@evidrax.io", password: "NewUser@Pass123!" });
    expect(res.status).toBe(401);
  });

  it("409 — duplicate email rejected", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(adminUser())
      .mockResolvedValueOnce(investigatorUser()); // email already exists

    const res = await request(app)
      .post("/api/auth/register")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        email: "james.okafor@evidrax.io",
        password: "Investigator@1Pass!",
      });

    expect(res.status).toBe(409);
  });
});

// ── Me ────────────────────────────────────────────────────────────────────────
describe("GET /api/auth/me", () => {
  it("200 — returns current user without passwordHash", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser());

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.passwordHash).toBeUndefined();
  });

  it("401 — no token returns 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("401 — invalid token returns 401", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer totally.invalid.token");
    expect(res.status).toBe(401);
  });
});
