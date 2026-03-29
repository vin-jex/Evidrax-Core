import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '@prisma/client';
import prisma from '../config/prisma';
import config from '../config';
import { createError } from '../middleware/errorHandler';
import * as auditService from './auditService';
import {
  sendWelcomeEmail,
  sendLoginNotificationEmail,
} from './alertService';

const SALT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  const bytes = Buffer.from(password, 'utf-8');
  if (bytes.length > 72) throw createError(400, 'Password too long (max 72 bytes)');
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

interface RegisterParams {
  email: string;
  password: string;
  fullName?: string;
  role?: string;
}

export async function register(
  { email, password, fullName, role }: RegisterParams,
  actingUser?: User,
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw createError(409, 'Email already registered');

  const passwordHash = await hashPassword(password);
  const assignedRole = (role as 'ADMIN' | 'INVESTIGATOR' | 'AUDITOR') || 'INVESTIGATOR';

  const user = await prisma.user.create({
    data: { email, passwordHash, fullName, role: assignedRole },
  });

  await auditService.log({
    action: 'USER_CREATED',
    userId: actingUser?.id,
    resourceType: 'user',
    resourceId: user.id,
    metadata: { email: user.email, role: user.role },
  });

  // Send welcome email to the new user (fire-and-forget)
  sendWelcomeEmail({
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    createdBy: actingUser?.email,
  });

  return sanitizeUser(user);
}

interface LoginParams {
  email: string;
  password: string;
}

export async function login({ email, password }: LoginParams, ipAddress?: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw createError(401, 'Invalid email or password');

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw createError(401, 'Invalid email or password');

  if (!user.isActive) throw createError(403, 'Account is disabled');

  const token = signToken(user);

  await auditService.log({
    action: 'USER_LOGIN',
    userId: user.id,
    resourceType: 'user',
    resourceId: user.id,
    ipAddress,
  });

  // Send login notification email (fire-and-forget)
  sendLoginNotificationEmail({
    email: user.email,
    fullName: user.fullName,
    ipAddress,
    timestamp: new Date(),
  });

  return { token, user: sanitizeUser(user) };
}

interface BootstrapParams {
  email: string;
  password: string;
  fullName?: string;
}

export async function bootstrapAdmin({ email, password, fullName }: BootstrapParams) {
  const adminExists = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (adminExists) throw createError(403, 'Bootstrap disabled: an admin account already exists.');

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName, role: 'ADMIN' },
  });

  // Welcome the first admin
  sendWelcomeEmail({ email: user.email, fullName: user.fullName, role: 'ADMIN' });

  return sanitizeUser(user);
}

function signToken(user: User): string {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
    algorithm: config.jwt.algorithm,
    expiresIn: config.jwt.expiresIn,
  });
}

export function sanitizeUser(user: User) {
  const { passwordHash: _ph, ...safe } = user;
  return safe;
}
