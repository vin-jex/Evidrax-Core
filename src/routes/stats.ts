import type { Router as ExpressRouter } from "express";
import { Router } from "express";
import { query } from "express-validator";
import { validate } from "../middleware/validate";
import { authenticate, requireAdmin, requireAnyRole } from "../middleware/auth";
import prisma from "../config/prisma";
import * as fastapiService from "../services/fastapiService";

const router: ExpressRouter = Router();

/**
 * @openapi
 * /api/stats/overview:
 *   get:
 *     tags: [Stats]
 *     summary: Full system overview dashboard (ADMIN only)
 *     description: Returns evidence counts, user counts, audit totals, open anomalies, recent alerts, and service health.
 *     responses:
 *       200:
 *         description: System overview stats
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
 *                     uploadedLast7Days: { type: integer }
 *                     uploadedLast30Days: { type: integer }
 *                 users:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     active: { type: integer }
 *                     inactive: { type: integer }
 *                     byRole: { type: object }
 *                 audit:
 *                   type: object
 *                   properties:
 *                     totalEvents: { type: integer }
 *                     custodyEvents: { type: integer }
 *                     eventsLast24h: { type: integer }
 *                     eventsLast7Days: { type: integer }
 *                 anomalies:
 *                   type: object
 *                   properties:
 *                     open: { type: integer }
 *                     resolved: { type: integer }
 *                     byRiskLevel: { type: object }
 *                 services:
 *                   type: object
 *                   properties:
 *                     fastapi: { type: object }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/overview", authenticate, requireAdmin, async (_req, res) => {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalEvidence,
    tamperedCount,
    evidenceLast7d,
    evidenceLast30d,
    totalUsers,
    activeUsers,
    adminCount,
    investigatorCount,
    auditorCount,
    totalAuditLogs,
    totalCustodyEvents,
    auditLast24h,
    auditLast7d,
    openAnomalies,
    resolvedAnomalies,
    lowRisk,
    mediumRisk,
    highRisk,
    criticalRisk,
    recentAlerts,
    fastapiStatus,
  ] = await Promise.all([
    prisma.evidence.count(),
    prisma.evidence.count({ where: { isTampered: true } }),
    prisma.evidence.count({ where: { createdAt: { gte: last7d } } }),
    prisma.evidence.count({ where: { createdAt: { gte: last30d } } }),
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { role: "INVESTIGATOR" } }),
    prisma.user.count({ where: { role: "AUDITOR" } }),
    prisma.auditLog.count(),
    prisma.custodyLog.count(),
    prisma.auditLog.count({ where: { timestamp: { gte: last24h } } }),
    prisma.auditLog.count({ where: { timestamp: { gte: last7d } } }),
    prisma.anomalyLog.count({ where: { isResolved: false } }),
    prisma.anomalyLog.count({ where: { isResolved: true } }),
    prisma.anomalyLog.count({ where: { isResolved: false, riskLevel: "low" } }),
    prisma.anomalyLog.count({
      where: { isResolved: false, riskLevel: "medium" },
    }),
    prisma.anomalyLog.count({
      where: { isResolved: false, riskLevel: "high" },
    }),
    prisma.anomalyLog.count({
      where: { isResolved: false, riskLevel: "critical" },
    }),
    prisma.auditLog.findMany({
      where: { action: { in: ["TAMPER_DETECTED", "ANOMALY_DETECTED"] } },
      orderBy: { timestamp: "desc" },
      take: 10,
      select: {
        action: true,
        timestamp: true,
        metadata: true,
        resourceId: true,
      },
    }),
    fastapiService.ping(),
  ]);

  res.json({
    evidence: {
      total: totalEvidence,
      tampered: tamperedCount,
      clean: totalEvidence - tamperedCount,
      uploadedLast7Days: evidenceLast7d,
      uploadedLast30Days: evidenceLast30d,
    },
    users: {
      total: totalUsers,
      active: activeUsers,
      inactive: totalUsers - activeUsers,
      byRole: {
        ADMIN: adminCount,
        INVESTIGATOR: investigatorCount,
        AUDITOR: auditorCount,
      },
    },
    audit: {
      totalEvents: totalAuditLogs,
      custodyEvents: totalCustodyEvents,
      eventsLast24h: auditLast24h,
      eventsLast7Days: auditLast7d,
    },
    anomalies: {
      open: openAnomalies,
      resolved: resolvedAnomalies,
      byRiskLevel: {
        low: lowRisk,
        medium: mediumRisk,
        high: highRisk,
        critical: criticalRisk,
      },
    },
    recentAlerts,
    services: { fastapi: fastapiStatus },
    generatedAt: now.toISOString(),
  });
});

/**
 * @openapi
 * /api/stats/evidence:
 *   get:
 *     tags: [Stats]
 *     summary: Evidence statistics (ADMIN only)
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, default: 30 }
 *         description: Number of days back to aggregate activity
 *     responses:
 *       200:
 *         description: Evidence counts and daily upload activity
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  "/evidence",
  authenticate,
  requireAdmin,
  query("days").optional().isInt({ min: 1, max: 365 }).toInt(),
  validate,
  async (req, res) => {
    const days = (req.query.days as unknown as number) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [total, tampered, recent, mimeBreakdown] = await Promise.all([
      prisma.evidence.count(),
      prisma.evidence.count({ where: { isTampered: true } }),
      prisma.evidence.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          fileSize: true,
          mimeType: true,
          isTampered: true,
        },
      }),
      prisma.evidence.groupBy({
        by: ["mimeType"],
        _count: { _all: true },
        orderBy: { _count: { mimeType: "desc" } },
      }),
    ]);

    // Bucket uploads by day
    const byDay: Record<string, number> = {};
    for (const e of recent) {
      const day = e.createdAt.toISOString().split("T")[0];
      byDay[day] = (byDay[day] ?? 0) + 1;
    }

    const totalSize = recent.reduce(
      (sum: number, e: { fileSize: number }) => sum + e.fileSize,
      0,
    );

    res.json({
      total,
      tampered,
      clean: total - tampered,
      integrityRate:
        total > 0
          ? (((total - tampered) / total) * 100).toFixed(1) + "%"
          : "100%",
      last: `${days}d`,
      uploadedInPeriod: recent.length,
      totalStorageMb: (totalSize / (1024 * 1024)).toFixed(2),
      uploadsByDay: byDay,
      mimeBreakdown: mimeBreakdown.map(
        (m: { mimeType: string; _count: { _all: number } }) => ({
          mimeType: m.mimeType,
          count: m._count._all,
        }),
      ),
    });
  },
);

/**
 * @openapi
 * /api/stats/users:
 *   get:
 *     tags: [Stats]
 *     summary: User statistics (ADMIN only)
 *     responses:
 *       200:
 *         description: User counts by role and activity
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/users", authenticate, requireAdmin, async (_req, res) => {
  const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [total, active, byRole, recentLogins, newUsersLast30d] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.auditLog.findMany({
        where: { action: "USER_LOGIN", timestamp: { gte: last30d } },
        orderBy: { timestamp: "desc" },
        take: 20,
        select: {
          userId: true,
          timestamp: true,
          ipAddress: true,
          user: { select: { email: true, fullName: true, role: true } },
        },
      }),
      prisma.user.count({ where: { createdAt: { gte: last30d } } }),
    ]);

  res.json({
    total,
    active,
    inactive: total - active,
    newLast30Days: newUsersLast30d,
    byRole: Object.fromEntries(
      byRole.map((r: { role: string; _count: { _all: number } }) => [
        r.role,
        r._count._all,
      ]),
    ),
    recentLogins,
  });
});

/**
 * @openapi
 * /api/stats/anomalies:
 *   get:
 *     tags: [Stats]
 *     summary: Anomaly detection statistics (any authenticated role)
 *     responses:
 *       200:
 *         description: Anomaly counts and recent high-risk entries
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/anomalies", authenticate, requireAnyRole, async (_req, res) => {
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [open, resolved, last7dCount, byRisk, topOffenders] = await Promise.all(
    [
      prisma.anomalyLog.count({ where: { isResolved: false } }),
      prisma.anomalyLog.count({ where: { isResolved: true } }),
      prisma.anomalyLog.count({ where: { createdAt: { gte: last7d } } }),
      prisma.anomalyLog.groupBy({
        by: ["riskLevel"],
        where: { isResolved: false },
        _count: { _all: true },
        _avg: { score: true },
      }),
      prisma.anomalyLog.findMany({
        where: { isResolved: false, riskLevel: { in: ["high", "critical"] } },
        orderBy: { score: "desc" },
        take: 10,
        select: {
          id: true,
          riskLevel: true,
          score: true,
          reason: true,
          createdAt: true,
          user: { select: { email: true, fullName: true } },
          evidence: { select: { title: true } },
        },
      }),
    ],
  );

  res.json({
    open,
    resolved,
    newLast7Days: last7dCount,
    byRiskLevel: Object.fromEntries(
      byRisk.map(
        (r: {
          riskLevel: string;
          _count: { _all: number };
          _avg: { score: number | null };
        }) => [
          r.riskLevel,
          {
            count: r._count._all,
            avgScore: Number(r._avg.score?.toFixed(3) ?? 0),
          },
        ],
      ),
    ),
    topOffenders,
  });
});

/**
 * @openapi
 * /api/stats/activity:
 *   get:
 *     tags: [Stats]
 *     summary: Audit log activity timeline (any authenticated role)
 *     description: Investigators see only their own activity.
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, default: 7, maximum: 90 }
 *     responses:
 *       200:
 *         description: Daily event counts and top actions
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  "/activity",
  authenticate,
  requireAnyRole,
  query("days").optional().isInt({ min: 1, max: 90 }).toInt(),
  validate,
  async (req, res) => {
    const days = (req.query.days as unknown as number) || 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where: Record<string, unknown> = { timestamp: { gte: since } };
    if (req.user.role === "INVESTIGATOR") where.userId = req.user.id;

    const [logs, topActions] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "asc" },
        select: { timestamp: true, action: true },
      }),
      prisma.auditLog.groupBy({
        by: ["action"],
        where,
        _count: { _all: true },
        orderBy: { _count: { action: "desc" } },
        take: 10,
      }),
    ]);

    const byDay: Record<string, number> = {};
    for (const l of logs) {
      const day = l.timestamp.toISOString().split("T")[0];
      byDay[day] = (byDay[day] ?? 0) + 1;
    }

    interface TopAction {
      action: string;
      _count: { _all: number };
    }

    interface ActivityResponse {
      period: string;
      totalEvents: number;
      byDay: Record<string, number>;
      topActions: { action: string; count: number }[];
    }

    const response: ActivityResponse = {
      period: `${days}d`,
      totalEvents: logs.length,
      byDay,
      topActions: topActions.map((a: TopAction) => ({
        action: a.action,
        count: a._count._all,
      })),
    };

    res.json(response);
  },
);

export default router;
