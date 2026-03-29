import type { Router as ExpressRouter } from "express";
import { Router } from "express";
import { body, query, param } from "express-validator";
import { validate } from "../middleware/validate";
import {
  authenticate,
  requireInvestigatorOrAdmin,
  requireAnyRole,
} from "../middleware/auth";
import { upload } from "../middleware/upload";
import * as evidenceService from "../services/evidenceService";
import { createError } from "../middleware/errorHandler";

const router: ExpressRouter = Router();

/**
 * @openapi
 * /api/evidence:
 *   post:
 *     tags: [Evidence]
 *     summary: Upload a new piece of evidence
 *     description: Accepts multipart/form-data. Computes SHA-256 and uploads to Cloudinary. Triggers a background anomaly check.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, title]
 *             properties:
 *               file: { type: string, format: binary }
 *               title: { type: string }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Evidence created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Evidence' }
 *       400: { description: No file uploaded }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationFailed' }
 */
router.post(
  "/",
  authenticate,
  requireInvestigatorOrAdmin,
  upload.single("file"),
  body("title").trim().notEmpty().withMessage("Title is required"),
  body("description").optional().trim(),
  validate,
  async (req, res) => {
    if (!req.file) throw createError(400, "No file uploaded");
    const ip = req.ip ?? req.socket?.remoteAddress;
    const evidence = await evidenceService.uploadEvidence(
      {
        file: req.file,
        title: req.body.title,
        description: req.body.description,
      },
      req.user,
      ip,
    );
    res.status(201).json(evidence);
  },
);

/**
 * @openapi
 * /api/evidence:
 *   get:
 *     tags: [Evidence]
 *     summary: List all evidence (paginated)
 *     parameters:
 *       - in: query
 *         name: skip
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Array of evidence records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Evidence' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  "/",
  authenticate,
  requireAnyRole,
  query("skip").optional().isInt({ min: 0 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  validate,
  async (req, res) => {
    const items = await evidenceService.listEvidence(
      req.query as { skip?: number; limit?: number },
    );
    res.json(items);
  },
);

/**
 * @openapi
 * /api/evidence/{id}:
 *   get:
 *     tags: [Evidence]
 *     summary: Get a single evidence record by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Evidence record
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Evidence' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  "/:id",
  authenticate,
  requireAnyRole,
  param("id").isUUID(),
  validate,
  async (req, res) => {
    const ip = req.ip ?? req.socket?.remoteAddress;
    const evidence = await evidenceService.getEvidence(
      req.params.id,
      req.user,
      ip,
    );
    res.json(evidence);
  },
);

/**
 * @openapi
 * /api/evidence/{id}/verify:
 *   post:
 *     tags: [Evidence]
 *     summary: Verify evidence integrity (SHA-256 check)
 *     description: Re-downloads the file from Cloudinary, recomputes its hash, and compares against the stored hash. Triggers a tamper alert if hashes differ.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 evidenceId: { type: string }
 *                 valid: { type: boolean }
 *                 storedHash: { type: string }
 *                 currentHash: { type: string }
 *                 message: { type: string }
 *                 verifiedAt: { type: string, format: date-time }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  "/:id/verify",
  authenticate,
  requireAnyRole,
  param("id").isUUID(),
  validate,
  async (req, res) => {
    const ip = req.ip ?? req.socket?.remoteAddress;
    const result = await evidenceService.verifyEvidence(
      req.params.id,
      req.user,
      ip,
    );
    res.json(result);
  },
);

/**
 * @openapi
 * /api/evidence/{id}/custody:
 *   get:
 *     tags: [Evidence]
 *     summary: Get the full chain-of-custody for an evidence item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Ordered list of custody events
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/CustodyLog' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  "/:id/custody",
  authenticate,
  requireAnyRole,
  param("id").isUUID(),
  validate,
  async (req, res) => {
    const chain = await evidenceService.getCustodyChain(req.params.id);
    res.json(chain);
  },
);

export default router;
