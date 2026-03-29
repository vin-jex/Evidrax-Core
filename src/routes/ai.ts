import type { Router as ExpressRouter } from "express";
import { Router } from "express";
import { body, param, query } from "express-validator";
import { validate } from "../middleware/validate";
import { authenticate, requireAdmin, requireAnyRole } from "../middleware/auth";
import * as fastapiService from "../services/fastapiService";
import * as alertService from "../services/alertService";
import * as auditService from "../services/auditService";
import prisma from "../config/prisma";

const router: ExpressRouter = Router();

/**
 * @openapi
 * /api/ai/analyze:
 *   post:
 *     tags: [AI]
 *     summary: Submit access logs for anomaly scoring
 *     description: Node authenticates the caller, forwards logs to the stateless FastAPI service, persists any anomaly records, and triggers alerts if needed.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [logs]
 *             properties:
 *               logs:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [userId, timestamp, action]
 *                   properties:
 *                     userId: { type: string }
 *                     timestamp: { type: string, format: date-time }
 *                     action: { type: string }
 *                     evidenceId: { type: string }
 *     responses:
 *       200:
 *         description: Anomaly scoring result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 anomalyDetected: { type: boolean }
 *                 riskLevel: { type: string, enum: [low, medium, high, critical] }
 *                 score: { type: number }
 *                 details: { type: array, items: { type: object } }
 *                 analyzedAt: { type: string, format: date-time }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationFailed' }
 */
router.post(
  "/analyze",
  authenticate,
  requireAnyRole,
  body("logs").isArray({ min: 1 }),
  body("logs.*.userId").notEmpty(),
  body("logs.*.timestamp").notEmpty(),
  body("logs.*.action").notEmpty(),
  validate,
  async (req, res) => {
    const result = await fastapiService.analyzeAnomalies(req.body.logs);

    if (result.anomalyDetected) {
      const flaggedUsers = result.details.filter((d) => d.anomaly);
      for (const detail of flaggedUsers) {
        await prisma.anomalyLog.create({
          data: {
            userId: detail.userId,
            riskLevel: detail.riskLevel,
            score: detail.score,
            reason:
              `Isolation Forest flagged user ${detail.userId} - ` +
              `access_count=${detail.features.access_count}, ` +
              `is_off_hours=${detail.features.is_off_hours}, ` +
              `action_entropy=${detail.features.action_entropy?.toFixed(3)}`,
          },
        });
      }
      await alertService.sendAnomalyAlert(result);
      await auditService.log({
        action: "ANOMALY_DETECTED",
        userId: req.user.id,
        resourceType: "system",
        metadata: {
          riskLevel: result.riskLevel,
          score: result.score,
          logCount: req.body.logs.length,
          flaggedUsers: flaggedUsers.length,
        },
      });
    }

    res.json(result);
  },
);

/**
 * @openapi
 * /api/ai/train:
 *   post:
 *     tags: [AI]
 *     summary: Trigger model retraining (ADMIN only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [logs]
 *             properties:
 *               logs:
 *                 type: array
 *                 minItems: 5
 *                 items: { type: object }
 *     responses:
 *       200:
 *         description: Training result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 samples: { type: integer }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
  "/train",
  authenticate,
  requireAdmin,
  body("logs").isArray({ min: 5 }),
  validate,
  async (req, res) => {
    const result = await fastapiService.trainModel(req.body.logs);
    await auditService.log({
      action: "AI_MODEL_TRAINED",
      userId: req.user.id,
      resourceType: "system",
      metadata: result,
    });
    res.json(result);
  },
);

/**
 * @openapi
 * /api/ai/anomalies:
 *   get:
 *     tags: [AI]
 *     summary: List anomaly records
 *     parameters:
 *       - in: query
 *         name: resolved
 *         schema: { type: boolean, default: false }
 *         description: Filter by resolved status
 *     responses:
 *       200:
 *         description: List of anomaly log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/AnomalyLog' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  "/anomalies",
  authenticate,
  requireAnyRole,
  query("resolved").optional().isBoolean().toBoolean(),
  validate,
  async (req, res) => {
    const resolved = req.query.resolved as unknown as boolean;
    const anomalies = await prisma.anomalyLog.findMany({
      where: { isResolved: resolved },
      orderBy: { createdAt: "desc" },
    });
    res.json(anomalies);
  },
);

/**
 * @openapi
 * /api/ai/anomalies/{id}/resolve:
 *   patch:
 *     tags: [AI]
 *     summary: Mark an anomaly as resolved (ADMIN only)
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
 *               notes: { type: string, description: Resolution notes appended to the reason field }
 *     responses:
 *       200:
 *         description: Updated anomaly record
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AnomalyLog' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch(
  "/anomalies/:id/resolve",
  authenticate,
  requireAdmin,
  param("id").isUUID(),
  body("notes").optional().trim(),
  validate,
  async (req, res) => {
    const existing = await prisma.anomalyLog.findUnique({
      where: { id: req.params.id },
    });
    const anomaly = await prisma.anomalyLog.update({
      where: { id: req.params.id },
      data: {
        isResolved: true,
        resolvedBy: req.user.id,
        resolvedAt: new Date(),
        reason: req.body.notes
          ? `${existing?.reason ?? ""}\n[Resolved]: ${req.body.notes}`
          : undefined,
      },
    });
    await auditService.log({
      action: "ANOMALY_RESOLVED",
      userId: req.user.id,
      resourceType: "anomaly",
      resourceId: req.params.id,
      metadata: { notes: req.body.notes },
    });
    res.json(anomaly);
  },
);

export default router;
