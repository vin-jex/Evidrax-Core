import type { Router as ExpressRouter } from "express";
import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate";
import { authenticate, requireAdmin } from "../middleware/auth";
import * as authService from "../services/authService";

const router: ExpressRouter = Router();

/**
 * @openapi
 * /api/auth/bootstrap:
 *   post:
 *     tags: [Auth]
 *     summary: Create the first admin account
 *     description: One-time endpoint. Fails if any ADMIN already exists.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               fullName: { type: string }
 *     responses:
 *       201:
 *         description: Admin user created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 *       403:
 *         description: Admin already exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */
router.post(
  "/bootstrap",
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 8 }),
  body("fullName").optional().trim(),
  validate,
  async (req, res) => {
    const user = await authService.bootstrapAdmin(req.body);
    res.status(201).json(user);
  },
);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in and receive a JWT
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: admin@uni.edu }
 *               password: { type: string, example: SecurePass123! }
 *     responses:
 *       200:
 *         description: JWT token and user object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 user: { $ref: '#/components/schemas/User' }
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */
router.post(
  "/login",
  body("email").isEmail().normalizeEmail(),
  body("password").notEmpty(),
  validate,
  async (req, res) => {
    const ip = req.ip ?? req.socket?.remoteAddress;
    const result = await authService.login(req.body, ip);
    res.json(result);
  },
);

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user (ADMIN only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               role:
 *                 type: string
 *                 enum: [ADMIN, INVESTIGATOR, AUDITOR]
 *                 default: INVESTIGATOR
 *               fullName: { type: string }
 *     responses:
 *       201:
 *         description: New user created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */
router.post(
  "/register",
  authenticate,
  requireAdmin,
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 8 }),
  body("role").optional().isIn(["ADMIN", "INVESTIGATOR", "AUDITOR"]),
  body("fullName").optional().trim(),
  validate,
  async (req, res) => {
    const user = await authService.register(req.body, req.user);
    res.status(201).json(user);
  },
);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the currently authenticated user
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get("/me", authenticate, (req, res) => {
  const { passwordHash: _ph, ...user } = req.user as typeof req.user & {
    passwordHash?: string;
  };
  res.json(user);
});

export default router;
