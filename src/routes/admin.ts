import type { Router as ExpressRouter } from "express";
import { Router } from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validate";
import { authenticate, requireAdmin } from "../middleware/auth";
import prisma from "../config/prisma";
import * as auditService from "../services/auditService";
import * as fastapiService from "../services/fastapiService";
import { sendAccountDisabledEmail } from "../services/alertService";
import { createError } from "../middleware/errorHandler";

const router: ExpressRouter = Router();

/**
 * @openapi
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users (ADMIN only)
 *     responses:
 *       200:
 *         description: Array of user records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/users", authenticate, requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
  res.json(users);
});

/**
 * @openapi
 * /api/admin/users/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update a user's role, name, or active status (ADMIN only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName: { type: string }
 *               isActive: { type: boolean }
 *               role: { type: string, enum: [ADMIN, INVESTIGATOR, AUDITOR] }
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch(
  "/users/:id",
  authenticate,
  requireAdmin,
  param("id").isUUID(),
  body("fullName").optional().trim(),
  body("isActive").optional().isBoolean(),
  body("role").optional().isIn(["ADMIN", "INVESTIGATOR", "AUDITOR"]),
  validate,
  async (req, res) => {
    const { id } = req.params;
    const { fullName, isActive, role } = req.body as {
      fullName?: string;
      isActive?: boolean;
      role?: string;
    };

    const data: Record<string, unknown> = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (isActive !== undefined) data.isActive = isActive;
    if (role !== undefined) data.role = role;

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await auditService.log({
      action: "USER_UPDATED",
      userId: req.user.id,
      resourceType: "user",
      resourceId: id,
      metadata: data,
      ipAddress: req.ip,
    });

    res.json(user);
  },
);

/**
 * @openapi
 * /api/admin/users/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Deactivate a user account (soft delete, ADMIN only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: User deactivated }
 *       400: { description: Cannot deactivate your own account }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.delete(
  "/users/:id",
  authenticate,
  requireAdmin,
  param("id").isUUID(),
  validate,
  async (req, res) => {
    const { id } = req.params;
    if (id === req.user.id)
      throw createError(400, "Cannot deactivate your own account");

    const target = await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    // Notify the deactivated user by email (fire-and-forget)
    sendAccountDisabledEmail({
      email: target.email,
      fullName: target.fullName,
    });

    await auditService.log({
      action: "USER_DEACTIVATED",
      userId: req.user.id,
      resourceType: "user",
      resourceId: id,
      ipAddress: req.ip,
    });
    res.status(204).send();
  },
);

/**
 * @openapi
 * /api/admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: System-wide statistics dashboard (ADMIN only)
 *     responses:
 *       200:
 *         description: Aggregated counts and recent alert activity
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 evidence:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     tampered: { type: integer }
 *                     clean: { type: integer }
 *                 users:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     active: { type: integer }
 *                     inactive: { type: integer }
 *                 audit:
 *                   type: object
 *                   properties:
 *                     totalEvents: { type: integer }
 *                     custodyEvents: { type: integer }
 *                 anomalies:
 *                   type: object
 *                   properties:
 *                     open: { type: integer }
 *                 services:
 *                   type: object
 *                   properties:
 *                     fastapi: { type: object, properties: { ok: { type: boolean } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/stats", authenticate, requireAdmin, async (_req, res) => {
  const [
    totalEvidence,
    tamperedCount,
    totalUsers,
    activeUsers,
    totalAuditLogs,
    totalCustodyEvents,
    openAnomalies,
    recentAlerts,
    fastapiStatus,
  ] = await Promise.all([
    prisma.evidence.count(),
    prisma.evidence.count({ where: { isTampered: true } }),
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.auditLog.count(),
    prisma.custodyLog.count(),
    prisma.anomalyLog.count({ where: { isResolved: false } }),
    prisma.auditLog.findMany({
      where: { action: { in: ["TAMPER_DETECTED", "ANOMALY_DETECTED"] } },
      orderBy: { timestamp: "desc" },
      take: 5,
      select: { action: true, timestamp: true, metadata: true },
    }),
    fastapiService.ping(),
  ]);

  res.json({
    evidence: {
      total: totalEvidence,
      tampered: tamperedCount,
      clean: totalEvidence - tamperedCount,
    },
    users: {
      total: totalUsers,
      active: activeUsers,
      inactive: totalUsers - activeUsers,
    },
    audit: { totalEvents: totalAuditLogs, custodyEvents: totalCustodyEvents },
    anomalies: { open: openAnomalies },
    recentAlerts,
    services: { fastapi: fastapiStatus },
  });
});

export default router;
