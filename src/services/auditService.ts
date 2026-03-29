import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";

interface LogParams {
  action: string;
  userId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

interface CustodyParams {
  evidenceId: string;
  userId: string;
  action: string;
  ipAddress?: string | null;
  location?: string | null;
  notes?: string | null;
}

interface QueryParams {
  userId?: string;
  action?: string;
  resourceType?: string;
  fromDate?: string;
  toDate?: string;
  skip?: number;
  limit?: number;
}

export async function log(params: LogParams = { action: "" }) {
  return prisma.auditLog.create({
    data: {
      action: params.action,
      userId: params.userId ?? null,
      resourceType: params.resourceType ?? null,
      resourceId: params.resourceId ? String(params.resourceId) : null,
      metadata: (params.metadata as Prisma.JsonValue) ?? {},
      ipAddress: params.ipAddress ?? null,
    },
  });
}

export async function logCustody(params: CustodyParams) {
  return prisma.custodyLog.create({
    data: {
      evidenceId: params.evidenceId,
      userId: params.userId,
      action: params.action,
      ipAddress: params.ipAddress ?? null,
      location: params.location ?? null,
      notes: params.notes ?? null,
    },
  });
}

export async function queryAuditLogs(params: QueryParams = {}) {
  const {
    userId,
    action,
    resourceType,
    fromDate,
    toDate,
    skip = 0,
    limit = 50,
  } = params;

  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (resourceType) where.resourceType = resourceType;
  if (fromDate || toDate) {
    const ts: Record<string, Date> = {};
    if (fromDate) ts.gte = new Date(fromDate);
    if (toDate) ts.lte = new Date(toDate);
    where.timestamp = ts;
  }

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: Number(skip),
      take: Math.min(Number(limit), 200),
    }),
  ]);

  return { total, items };
}
