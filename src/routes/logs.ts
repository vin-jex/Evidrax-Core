import type { Router as ExpressRouter } from "express";
import { Router } from "express";
import { query, body } from "express-validator";
import { validate } from "../middleware/validate";
import { authenticate, requireAnyRole } from "../middleware/auth";
import * as auditService from "../services/auditService";

const router: ExpressRouter = Router();

/**
 * @openapi
 * /api/logs/audit:
 *   get:
 *     tags: [Logs]
 *     summary: Query audit logs
 *     description: Investigators can only see their own audit trail. Admins and Auditors see all.
 *     parameters:
 *       - in: query
 *   get:
 *     tags: [Logs]
 *     summary: Query audit logs
 *     description: Investigators can only see their own audit trail. Admins and Auditors see all.
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *         description: Case-insensitive substring match
 *       - in: query
 *         name: resourceType
 *         schema: { type: string }
 *       - in: query
 *         name: fromDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: toDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: skip
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: Paginated audit log results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: integer }
 *                 items:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/AuditLog' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  "/audit",
  authenticate,
  requireAnyRole,
  query("userId").optional().isUUID(),
  query("action").optional().trim(),
  query("resourceType").optional().trim(),
  query("fromDate").optional().isISO8601(),
  query("toDate").optional().isISO8601(),
  query("skip").optional().isInt({ min: 0 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 200 }).toInt(),
  validate,
  async (req, res) => {
    const filters = { ...req.query } as Record<
      string,
      string | number | undefined
    >;
    if (req.user.role === "INVESTIGATOR") {
      filters.userId = req.user.id;
    }
    const result = await auditService.queryAuditLogs(filters);
    res.json(result);
  },
);

/**
 * @openapi
 * /api/logs/access:
 *   post:
 *     tags: [Logs]
 *     summary: Write an access event
 *     description: Used by external callers (e.g. Next.js UI) to record a manual access event.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, evidenceId, action]
 *             properties:
 *               userId: { type: string, format: uuid }
 *               evidenceId: { type: string, format: uuid }
 *               action: { type: string }
 *               ip: { type: string }
 *     responses:
 *       201:
 *         description: Log entry created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 timestamp: { type: string, format: date-time }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationFailed' }
 */
router.post(
  "/access",
  authenticate,
  requireAnyRole,
  body("userId").isUUID(),
  body("evidenceId").isUUID(),
  body("action").notEmpty().trim(),
  body("ip").optional().trim(),
  validate,
  async (req, res) => {
    const { userId, evidenceId, action, ip } = req.body as {
      userId: string;
      evidenceId: string;
      action: string;
      ip?: string;
    };
    const entry = await auditService.log({
      action,
      userId,
      resourceType: "evidence",
      resourceId: evidenceId,
      ipAddress: ip ?? req.ip,
    });
    res.status(201).json({ id: entry.id, timestamp: entry.timestamp });
  },
);

export default router;
