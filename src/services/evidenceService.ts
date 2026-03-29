import prisma from "../config/prisma";
import * as storageService from "./storageService";
import * as auditService from "./auditService";
import * as alertService from "./alertService";
import * as fastapiService from "./fastapiService";
import { cacheGet, cacheSet, cacheDel } from "../config/redis";
import { createError } from "../middleware/errorHandler";
import { User, Evidence } from "@prisma/client";
import logger from "../utils/logger";

const EVIDENCE_CACHE_TTL = 60;

interface UploadPayload {
  file: Express.Multer.File;
  title: string;
  description?: string;
}

export async function uploadEvidence(
  { file, title, description }: UploadPayload,
  user: User,
  ipAddress?: string,
): Promise<Evidence> {
  const { url, viewUrl, publicId, sha256, fileSize } =
    await storageService.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      user.id,
    );

  const evidence = await prisma.evidence.create({
    data: {
      title,
      description: description ?? null,
      filePath: url,
      viewUrl,
      cloudinaryPublicId: publicId,
      originalFilename: file.originalname,
      fileSize,
      mimeType: file.mimetype,
      hashSha256: sha256,
      uploadedBy: user.id,
    },
  });

  await auditService.logCustody({
    evidenceId: evidence.id,
    userId: user.id,
    action: "UPLOAD",
    ipAddress,
    notes: `Initial upload - SHA-256: ${sha256}`,
  });

  await auditService.log({
    action: "EVIDENCE_UPLOADED",
    userId: user.id,
    resourceType: "evidence",
    resourceId: evidence.id,
    metadata: { filename: file.originalname, size: fileSize, hash: sha256 },
    ipAddress,
  });

  // Notify the uploader by email (fire-and-forget)
  alertService.sendEvidenceUploadedEmail({
    email: user.email,
    fullName: user.fullName,
    evidenceTitle: title,
    evidenceId: evidence.id,
    filename: file.originalname,
    fileSize,
    sha256,
    viewUrl: viewUrl ?? url,
  });

  // Background anomaly check
  _runAnomalyCheckInBackground(user.id, evidence.id);

  return evidence;
}

export async function getEvidence(
  evidenceId: string,
  user: User,
  ipAddress?: string,
): Promise<Evidence> {
  const cacheKey = `evidence:${evidenceId}`;
  const cached = await cacheGet<Evidence>(cacheKey);

  let evidence: Evidence;
  if (cached) {
    evidence = cached;
  } else {
    const found = await prisma.evidence.findUnique({
      where: { id: evidenceId },
    });
    if (!found) throw createError(404, "Evidence not found");
    evidence = found;
    await cacheSet(cacheKey, evidence, EVIDENCE_CACHE_TTL);
  }

  await auditService.logCustody({
    evidenceId,
    userId: user.id,
    action: "VIEW",
    ipAddress,
  });
  await auditService.log({
    action: "EVIDENCE_VIEWED",
    userId: user.id,
    resourceType: "evidence",
    resourceId: evidenceId,
    ipAddress,
  });

  return evidence;
}

export async function listEvidence({ skip = 0, limit = 20 } = {}) {
  return prisma.evidence.findMany({
    orderBy: { createdAt: "desc" },
    skip: Number(skip),
    take: Math.min(Number(limit), 100),
    include: {
      uploader: { select: { id: true, email: true, fullName: true } },
    },
  });
}

export async function verifyEvidence(
  evidenceId: string,
  user: User,
  ipAddress?: string,
) {
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
  });
  if (!evidence) throw createError(404, "Evidence not found");

  const currentHash = await storageService.recomputeHashFromUrl(
    evidence.filePath,
  );
  const isValid = currentHash === evidence.hashSha256;

  if (!isValid) {
    await prisma.evidence.update({
      where: { id: evidenceId },
      data: { isTampered: true },
    });
    await cacheDel(`evidence:${evidenceId}`);
    await alertService.sendTamperAlert(
      evidenceId,
      evidence.hashSha256,
      currentHash,
    );
    await auditService.log({
      action: "TAMPER_DETECTED",
      userId: user.id,
      resourceType: "evidence",
      resourceId: evidenceId,
      metadata: { storedHash: evidence.hashSha256, currentHash },
      ipAddress,
    });
  }

  await auditService.logCustody({
    evidenceId,
    userId: user.id,
    action: "VERIFY",
    ipAddress,
    notes: `Verification ${isValid ? "passed" : "FAILED - hash mismatch"}`,
  });

  return {
    evidenceId,
    valid: isValid,
    storedHash: evidence.hashSha256,
    currentHash,
    message: isValid
      ? "Evidence integrity verified"
      : "TAMPER DETECTED: hash mismatch",
    verifiedAt: new Date(),
  };
}

export async function getCustodyChain(evidenceId: string) {
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
  });
  if (!evidence) throw createError(404, "Evidence not found");

  return prisma.custodyLog.findMany({
    where: { evidenceId },
    orderBy: { timestamp: "asc" },
    include: {
      user: { select: { id: true, email: true, fullName: true, role: true } },
    },
  });
}

async function _runAnomalyCheckInBackground(
  userId: string,
  evidenceId: string,
): Promise<void> {
  try {
    const recentLogs = await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { timestamp: "desc" },
      take: 50,
    });

    if (recentLogs.length < 3) return;

    const logPayload = recentLogs.map((l) => ({
      userId,
      timestamp: l.timestamp.toISOString(),
      action: l.action,
      evidenceId: l.resourceId ?? evidenceId,
    }));

    const result = await fastapiService.analyzeAnomalies(logPayload);

    if (result.anomalyDetected) {
      const flagged = result.details.filter((d) => d.anomaly);
      for (const detail of flagged) {
        await prisma.anomalyLog.create({
          data: {
            userId: detail.userId,
            evidenceId,
            riskLevel: detail.riskLevel,
            score: detail.score,
            reason:
              `Background check after upload - ` +
              `access_count=${detail.features.access_count}, ` +
              `is_off_hours=${detail.features.is_off_hours}, ` +
              `action_entropy=${detail.features.action_entropy?.toFixed(3)}`,
          },
        });
      }
      await alertService.sendAnomalyAlert(result, evidenceId);
    }
  } catch (err) {
    logger.warn("Background anomaly check failed", {
      error: (err as Error).message,
    });
  }
}
