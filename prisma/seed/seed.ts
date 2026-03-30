/**
 * Evidrax-Core — Database Seed Script
 *
 * Run:  npx tsx prisma/seed/seed.ts
 *   or: pnpm seed
 *
 * Seeds:
 *   - 4 users  (1 admin, 2 investigators, 1 auditor)
 *   - 8 evidence records (varied MIME types, 1 tampered)
 *   - custody logs for every evidence item
 *   - 40+ audit log entries covering every action type
 *   - 5 anomaly logs (mix of risk levels, 1 resolved)
 *
 * Safe to re-run — skips records that already exist by email / title.
 */

import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcrypt";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 12;
const hash = (pw: string) => bcrypt.hash(pw, SALT_ROUNDS);

// ── Fixed UUIDs so foreign keys always resolve ────────────────────────────────
const IDS = {
  admin: "11111111-1111-4111-8111-111111111111",
  investigator1: "22222222-2222-4222-8222-222222222222",
  investigator2: "33333333-3333-4333-8333-333333333333",
  auditor: "44444444-4444-4444-8444-444444444444",

  ev1: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  ev2: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  ev3: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  ev4: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  ev5: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
  ev6: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
  ev7: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
  ev8: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",

  an1: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  an2: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  an3: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
  an4: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4",
  an5: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5",
};

const SEED_USER_EMAILS = [
  "admin@evidrax.io",
  "james.okafor@evidrax.io",
  "amara.nwosu@evidrax.io",
  "chidi.eze@evidrax.io",
];

const SEED_EVIDENCE_TITLES = [
  "Crime Scene Photographs — Case #2024-0091",
  "Forensic Report — Digital Device Analysis",
  "CCTV Footage Snapshot — Entrance Gate 3",
  "Network Traffic Log — Suspicious Exfiltration Event",
  "Witness Statement — Case #2024-0091",
  "Malware Sample — Ransomware Variant RX-7",
  "Financial Records — Suspect Bank Statements",
  "[TAMPERED] Original Arrest Report — Case #2024-0077",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

async function clearSeedData() {
  console.log("🧹 Removing seeded records...");

  const existingSeedUsers = await prisma.user.findMany({
    where: {
      email: { in: SEED_USER_EMAILS },
    },
    select: { id: true },
  });

  const seedUserIds = existingSeedUsers.map((u) => u.id);

  const existingSeedEvidence = await prisma.evidence.findMany({
    where: {
      title: { in: SEED_EVIDENCE_TITLES },
    },
    select: { id: true },
  });

  const seedEvidenceIds = existingSeedEvidence.map((e) => e.id);

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { userId: { in: seedUserIds } },
        { resourceId: { in: [...seedUserIds, ...seedEvidenceIds] } },
      ],
    },
  });

  await prisma.custodyLog.deleteMany({
    where: {
      OR: [
        { userId: { in: seedUserIds } },
        { evidenceId: { in: seedEvidenceIds } },
      ],
    },
  });

  await prisma.anomalyLog.deleteMany({
    where: {
      OR: [
        { userId: { in: seedUserIds } },
        { evidenceId: { in: seedEvidenceIds } },
        { resolvedBy: { in: seedUserIds } },
      ],
    },
  });

  await prisma.evidence.deleteMany({
    where: {
      OR: [
        { id: { in: seedEvidenceIds } },
        { title: { in: SEED_EVIDENCE_TITLES } },
      ],
    },
  });

  await prisma.user.deleteMany({
    where: {
      email: { in: SEED_USER_EMAILS },
    },
  });

  console.log("✓ Seed data removed\n");
}

async function main() {
  console.log("📂  Clearing existing data...");

  await clearSeedData();

  console.log("🌱  Starting Evidrax-Core seed...\n");

  // ── 1. USERS ───────────────────────────────────────────────────────────────
  console.log("👤  Seeding users...");

  const [pw1, pw2, pw3, pw4] = await Promise.all([
    hash("Admin@Evidrax123!"),
    hash("Investigator@1Pass!"),
    hash("Investigator@2Pass!"),
    hash("Auditor@Evidrax123!"),
  ]);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        id: IDS.admin,
        email: "admin@evidrax.io",
        passwordHash: pw1,
        fullName: "System Administrator",
        role: Role.ADMIN,
        isActive: true,
        createdAt: daysAgo(60),
      },
    }),
    prisma.user.create({
      data: {
        id: IDS.investigator1,
        email: "james.okafor@evidrax.io",
        passwordHash: pw2,
        fullName: "James Okafor",
        role: Role.INVESTIGATOR,
        isActive: true,
        createdAt: daysAgo(45),
      },
    }),
    prisma.user.create({
      data: {
        id: IDS.investigator2,
        email: "amara.nwosu@evidrax.io",
        passwordHash: pw3,
        fullName: "Amara Nwosu",
        role: Role.INVESTIGATOR,
        isActive: true,
        createdAt: daysAgo(30),
      },
    }),
    prisma.user.create({
      data: {
        id: IDS.auditor,
        email: "chidi.eze@evidrax.io",
        passwordHash: pw4,
        fullName: "Chidi Eze",
        role: Role.AUDITOR,
        isActive: true,
        createdAt: daysAgo(20),
      },
    }),
  ]);

  console.log(`   ✓  ${users.length} users seeded`);
  console.log("   Credentials:");
  console.log(
    "   ┌─────────────────────────────────┬──────────────────────────┬──────────────┐",
  );
  console.log(
    "   │ Email                           │ Password                 │ Role         │",
  );
  console.log(
    "   ├─────────────────────────────────┼──────────────────────────┼──────────────┤",
  );
  console.log(
    "   │ admin@evidrax.io                │ Admin@Evidrax123!        │ ADMIN        │",
  );
  console.log(
    "   │ james.okafor@evidrax.io         │ Investigator@1Pass!      │ INVESTIGATOR │",
  );
  console.log(
    "   │ amara.nwosu@evidrax.io          │ Investigator@2Pass!      │ INVESTIGATOR │",
  );
  console.log(
    "   │ chidi.eze@evidrax.io            │ Auditor@Evidrax123!      │ AUDITOR      │",
  );
  console.log(
    "   └─────────────────────────────────┴──────────────────────────┴──────────────┘\n",
  );

  // ── 2. EVIDENCE ───────────────────────────────────────────────────────────
  console.log("📁  Seeding evidence...");

  const evidenceRecords = [
    {
      id: IDS.ev1,
      title: "Crime Scene Photographs — Case #2024-0091",
      description:
        "High-resolution photographs taken at the scene. Chain of custody begins here.",
      originalFilename: "crime_scene_photos.zip",
      mimeType: "application/zip",
      fileSize: 24_500_000,
      hashSha256:
        "a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
      filePath:
        "https://res.cloudinary.com/evidrax/raw/upload/v1700000001/forensics/seed-user-0002/crime_scene_photos.zip",
      viewUrl:
        "https://res.cloudinary.com/evidrax/raw/upload/v1700000001/forensics/seed-user-0002/crime_scene_photos.zip",
      uploadedBy: IDS.investigator1,
      isTampered: false,
      createdAt: daysAgo(30),
      cloudinaryPublicId: "forensics/seed-user-0002/crime_scene_photos.zip",
    },
    {
      id: IDS.ev2,
      title: "Forensic Report — Digital Device Analysis",
      description:
        "PDF forensic report covering device extraction from suspect laptop.",
      originalFilename: "forensic_report_device_001.pdf",
      mimeType: "application/pdf",
      fileSize: 3_200_000,
      hashSha256:
        "b4e7c3d2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4",
      filePath:
        "https://res.cloudinary.com/evidrax/raw/upload/v1700000002/forensics/seed-user-0002/forensic_report_device_001.pdf",
      viewUrl:
        "https://res.cloudinary.com/evidrax/raw/upload/fl_attachment:false/v1700000002/forensics/seed-user-0002/forensic_report_device_001.pdf",
      uploadedBy: IDS.investigator1,
      isTampered: false,
      createdAt: daysAgo(25),
      cloudinaryPublicId:
        "forensics/seed-user-0002/forensic_report_device_001.pdf",
    },
    {
      id: IDS.ev3,
      title: "CCTV Footage Snapshot — Entrance Gate 3",
      description:
        "Extracted frame from CCTV recording showing suspect at 02:14 AM.",
      originalFilename: "cctv_gate3_frame_0214.jpg",
      mimeType: "image/jpeg",
      fileSize: 890_000,
      hashSha256:
        "c5f8d4e3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5",
      filePath:
        "https://res.cloudinary.com/evidrax/raw/upload/v1700000003/forensics/seed-user-0002/cctv_gate3_frame_0214.jpg",
      viewUrl:
        "https://res.cloudinary.com/evidrax/image/upload/forensics/seed-user-0002/cctv_gate3_frame_0214.jpg",
      uploadedBy: IDS.investigator1,
      isTampered: false,
      createdAt: daysAgo(22),
      cloudinaryPublicId: "forensics/seed-user-0002/cctv_gate3_frame_0214.jpg",
    },
    {
      id: IDS.ev4,
      title: "Network Traffic Log — Suspicious Exfiltration Event",
      description:
        "CSV export of network traffic showing anomalous outbound data transfer.",
      originalFilename: "netlog_exfil_event_20240310.csv",
      mimeType: "text/csv",
      fileSize: 1_450_000,
      hashSha256:
        "d6a9e5f4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6",
      filePath:
        "https://res.cloudinary.com/evidrax/raw/upload/v1700000004/forensics/seed-user-0003/netlog_exfil_event_20240310.csv",
      viewUrl:
        "https://res.cloudinary.com/evidrax/raw/upload/fl_attachment:false/v1700000004/forensics/seed-user-0003/netlog_exfil_event_20240310.csv",
      uploadedBy: IDS.investigator2,
      isTampered: false,
      createdAt: daysAgo(18),
      cloudinaryPublicId:
        "forensics/seed-user-0003/netlog_exfil_event_20240310.csv",
    },
    {
      id: IDS.ev5,
      title: "Witness Statement — Case #2024-0091",
      description:
        "Scanned signed statement from primary witness. Original held in secure facility.",
      originalFilename: "witness_statement_primary.pdf",
      mimeType: "application/pdf",
      fileSize: 520_000,
      hashSha256:
        "e7b0f6a5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7",
      filePath:
        "https://res.cloudinary.com/evidrax/raw/upload/v1700000005/forensics/seed-user-0002/witness_statement_primary.pdf",
      viewUrl:
        "https://res.cloudinary.com/evidrax/raw/upload/fl_attachment:false/v1700000005/forensics/seed-user-0002/witness_statement_primary.pdf",
      uploadedBy: IDS.investigator1,
      isTampered: false,
      createdAt: daysAgo(15),
      cloudinaryPublicId:
        "forensics/seed-user-0002/witness_statement_primary.pdf",
    },
    {
      id: IDS.ev6,
      title: "Malware Sample — Ransomware Variant RX-7",
      description:
        "Isolated malware binary recovered from compromised endpoint. DO NOT EXECUTE.",
      originalFilename: "malware_rx7_isolated.bin",
      mimeType: "application/octet-stream",
      fileSize: 245_000,
      hashSha256:
        "f8c1a7b6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8",
      filePath:
        "https://res.cloudinary.com/evidrax/raw/upload/v1700000006/forensics/seed-user-0003/malware_rx7_isolated.bin",
      viewUrl:
        "https://res.cloudinary.com/evidrax/raw/upload/v1700000006/forensics/seed-user-0003/malware_rx7_isolated.bin",
      uploadedBy: IDS.investigator2,
      isTampered: false,
      createdAt: daysAgo(10),
      cloudinaryPublicId: "forensics/seed-user-0003/malware_rx7_isolated.bin",
    },
    {
      id: IDS.ev7,
      title: "Financial Records — Suspect Bank Statements",
      description: "Subpoenaed bank statements showing irregular transactions.",
      originalFilename: "bank_statements_suspect_q1q2.pdf",
      mimeType: "application/pdf",
      fileSize: 2_100_000,
      hashSha256:
        "a1d4b7c0e3f6a9d2b5c8e1f4a7d0b3c6e9f2a5d8b1c4e7f0a3d6b9c2e5f8a1d4",
      filePath:
        "https://res.cloudinary.com/evidrax/raw/upload/v1700000007/forensics/seed-user-0002/bank_statements_suspect_q1q2.pdf",
      viewUrl:
        "https://res.cloudinary.com/evidrax/raw/upload/fl_attachment:false/v1700000007/forensics/seed-user-0002/bank_statements_suspect_q1q2.pdf",
      uploadedBy: IDS.investigator1,
      isTampered: false,
      createdAt: daysAgo(6),
      cloudinaryPublicId:
        "forensics/seed-user-0002/bank_statements_suspect_q1q2.pdf",
    },
    {
      id: IDS.ev8,
      title: "[TAMPERED] Original Arrest Report — Case #2024-0077",
      description:
        "Arrest report flagged as tampered during routine integrity check. Investigation pending.",
      originalFilename: "arrest_report_2024_0077.pdf",
      mimeType: "application/pdf",
      fileSize: 340_000,
      hashSha256:
        "b2e5c8f1a4d7b0e3f6a9c2d5e8f1a4b7c0d3e6f9a2b5c8d1e4f7a0b3c6d9e2f5",
      filePath:
        "https://res.cloudinary.com/evidrax/raw/upload/v1700000008/forensics/seed-user-0003/arrest_report_2024_0077.pdf",
      viewUrl:
        "https://res.cloudinary.com/evidrax/raw/upload/fl_attachment:false/v1700000008/forensics/seed-user-0003/arrest_report_2024_0077.pdf",
      uploadedBy: IDS.investigator2,
      isTampered: true, // ← triggers tamper flow in tests
      createdAt: daysAgo(3),
      cloudinaryPublicId:
        "forensics/seed-user-0003/arrest_report_2024_0077.pdf",
    },
  ];

  for (const ev of evidenceRecords) {
    await prisma.evidence.upsert({
      where: { id: ev.id },
      update: {},
      create: ev,
    });
  }
  console.log(`   ✓  ${evidenceRecords.length} evidence records seeded\n`);

  // ── 3. CUSTODY LOGS ───────────────────────────────────────────────────────
  console.log("🔗  Seeding custody logs...");

  const custodyEntries = [
    // Evidence 1 — full lifecycle
    {
      evidenceId: IDS.ev1,
      userId: IDS.investigator1,
      action: "UPLOAD",
      ipAddress: "197.210.65.1",
      notes: `Initial upload - SHA-256: ${evidenceRecords[0].hashSha256}`,
      timestamp: daysAgo(30),
    },
    {
      evidenceId: IDS.ev1,
      userId: IDS.investigator1,
      action: "VIEW",
      ipAddress: "197.210.65.1",
      notes: null,
      timestamp: daysAgo(28),
    },
    {
      evidenceId: IDS.ev1,
      userId: IDS.admin,
      action: "VIEW",
      ipAddress: "197.210.10.5",
      notes: null,
      timestamp: daysAgo(25),
    },
    {
      evidenceId: IDS.ev1,
      userId: IDS.investigator1,
      action: "VERIFY",
      ipAddress: "197.210.65.1",
      notes: "Verification passed",
      timestamp: daysAgo(20),
    },
    {
      evidenceId: IDS.ev1,
      userId: IDS.auditor,
      action: "VIEW",
      ipAddress: "41.58.200.22",
      notes: null,
      timestamp: daysAgo(10),
    },
    // Evidence 2
    {
      evidenceId: IDS.ev2,
      userId: IDS.investigator1,
      action: "UPLOAD",
      ipAddress: "197.210.65.1",
      notes: `Initial upload - SHA-256: ${evidenceRecords[1].hashSha256}`,
      timestamp: daysAgo(25),
    },
    {
      evidenceId: IDS.ev2,
      userId: IDS.auditor,
      action: "VIEW",
      ipAddress: "41.58.200.22",
      notes: null,
      timestamp: daysAgo(12),
    },
    {
      evidenceId: IDS.ev2,
      userId: IDS.investigator1,
      action: "VERIFY",
      ipAddress: "197.210.65.1",
      notes: "Verification passed",
      timestamp: daysAgo(5),
    },
    // Evidence 3
    {
      evidenceId: IDS.ev3,
      userId: IDS.investigator1,
      action: "UPLOAD",
      ipAddress: "197.210.65.1",
      notes: `Initial upload - SHA-256: ${evidenceRecords[2].hashSha256}`,
      timestamp: daysAgo(22),
    },
    {
      evidenceId: IDS.ev3,
      userId: IDS.investigator2,
      action: "VIEW",
      ipAddress: "102.89.44.17",
      notes: null,
      timestamp: daysAgo(14),
    },
    // Evidence 4
    {
      evidenceId: IDS.ev4,
      userId: IDS.investigator2,
      action: "UPLOAD",
      ipAddress: "102.89.44.17",
      notes: `Initial upload - SHA-256: ${evidenceRecords[3].hashSha256}`,
      timestamp: daysAgo(18),
    },
    {
      evidenceId: IDS.ev4,
      userId: IDS.investigator2,
      action: "VIEW",
      ipAddress: "102.89.44.17",
      notes: null,
      timestamp: daysAgo(16),
    },
    {
      evidenceId: IDS.ev4,
      userId: IDS.admin,
      action: "VERIFY",
      ipAddress: "197.210.10.5",
      notes: "Verification passed",
      timestamp: daysAgo(8),
    },
    // Evidence 5
    {
      evidenceId: IDS.ev5,
      userId: IDS.investigator1,
      action: "UPLOAD",
      ipAddress: "197.210.65.1",
      notes: `Initial upload - SHA-256: ${evidenceRecords[4].hashSha256}`,
      timestamp: daysAgo(15),
    },
    {
      evidenceId: IDS.ev5,
      userId: IDS.auditor,
      action: "VIEW",
      ipAddress: "41.58.200.22",
      notes: null,
      timestamp: daysAgo(7),
    },
    // Evidence 6
    {
      evidenceId: IDS.ev6,
      userId: IDS.investigator2,
      action: "UPLOAD",
      ipAddress: "102.89.44.17",
      notes: `Initial upload - SHA-256: ${evidenceRecords[5].hashSha256}`,
      timestamp: daysAgo(10),
    },
    // Evidence 7
    {
      evidenceId: IDS.ev7,
      userId: IDS.investigator1,
      action: "UPLOAD",
      ipAddress: "197.210.65.1",
      notes: `Initial upload - SHA-256: ${evidenceRecords[6].hashSha256}`,
      timestamp: daysAgo(6),
    },
    {
      evidenceId: IDS.ev7,
      userId: IDS.admin,
      action: "VIEW",
      ipAddress: "197.210.10.5",
      notes: null,
      timestamp: daysAgo(4),
    },
    // Evidence 8 — tampered lifecycle
    {
      evidenceId: IDS.ev8,
      userId: IDS.investigator2,
      action: "UPLOAD",
      ipAddress: "102.89.44.17",
      notes: `Initial upload - SHA-256: ${evidenceRecords[7].hashSha256}`,
      timestamp: daysAgo(3),
    },
    {
      evidenceId: IDS.ev8,
      userId: IDS.investigator2,
      action: "VERIFY",
      ipAddress: "102.89.44.17",
      notes: "Verification FAILED - hash mismatch",
      timestamp: daysAgo(2),
    },
    {
      evidenceId: IDS.ev8,
      userId: IDS.admin,
      action: "VIEW",
      ipAddress: "197.210.10.5",
      notes: "Admin review of tampered evidence",
      timestamp: daysAgo(1),
    },
  ];

  let custodyCount = 0;
  for (const entry of custodyEntries) {
    const existing = await prisma.custodyLog.findFirst({
      where: {
        evidenceId: entry.evidenceId,
        userId: entry.userId,
        action: entry.action,
        timestamp: entry.timestamp,
      },
    });
    if (!existing) {
      await prisma.custodyLog.create({ data: entry });
      custodyCount++;
    }
  }
  console.log(`   ✓  ${custodyCount} custody log entries seeded\n`);

  // ── 4. AUDIT LOGS ─────────────────────────────────────────────────────────
  console.log("📋  Seeding audit logs...");

  const auditEntries = [
    // Auth events
    {
      action: "USER_CREATED",
      userId: null,
      resourceType: "user",
      resourceId: IDS.admin,
      metadata: { email: "admin@evidrax.io", role: "ADMIN" },
      ipAddress: "197.210.10.5",
      timestamp: daysAgo(60),
    },
    {
      action: "USER_CREATED",
      userId: IDS.admin,
      resourceType: "user",
      resourceId: IDS.investigator1,
      metadata: { email: "james.okafor@evidrax.io", role: "INVESTIGATOR" },
      ipAddress: "197.210.10.5",
      timestamp: daysAgo(45),
    },
    {
      action: "USER_CREATED",
      userId: IDS.admin,
      resourceType: "user",
      resourceId: IDS.investigator2,
      metadata: { email: "amara.nwosu@evidrax.io", role: "INVESTIGATOR" },
      ipAddress: "197.210.10.5",
      timestamp: daysAgo(30),
    },
    {
      action: "USER_CREATED",
      userId: IDS.admin,
      resourceType: "user",
      resourceId: IDS.auditor,
      metadata: { email: "chidi.eze@evidrax.io", role: "AUDITOR" },
      ipAddress: "197.210.10.5",
      timestamp: daysAgo(20),
    },
    {
      action: "USER_LOGIN",
      userId: IDS.admin,
      resourceType: "user",
      resourceId: IDS.admin,
      metadata: {},
      ipAddress: "197.210.10.5",
      timestamp: daysAgo(30),
    },
    {
      action: "USER_LOGIN",
      userId: IDS.investigator1,
      resourceType: "user",
      resourceId: IDS.investigator1,
      metadata: {},
      ipAddress: "197.210.65.1",
      timestamp: daysAgo(29),
    },
    {
      action: "USER_LOGIN",
      userId: IDS.investigator2,
      resourceType: "user",
      resourceId: IDS.investigator2,
      metadata: {},
      ipAddress: "102.89.44.17",
      timestamp: daysAgo(18),
    },
    {
      action: "USER_LOGIN",
      userId: IDS.auditor,
      resourceType: "user",
      resourceId: IDS.auditor,
      metadata: {},
      ipAddress: "41.58.200.22",
      timestamp: daysAgo(12),
    },
    {
      action: "USER_LOGIN",
      userId: IDS.investigator1,
      resourceType: "user",
      resourceId: IDS.investigator1,
      metadata: {},
      ipAddress: "197.210.65.1",
      timestamp: hoursAgo(6),
    },
    {
      action: "USER_LOGIN",
      userId: IDS.admin,
      resourceType: "user",
      resourceId: IDS.admin,
      metadata: {},
      ipAddress: "197.210.10.5",
      timestamp: hoursAgo(2),
    },
    // Evidence uploads
    {
      action: "EVIDENCE_UPLOADED",
      userId: IDS.investigator1,
      resourceType: "evidence",
      resourceId: IDS.ev1,
      metadata: {
        filename: "crime_scene_photos.zip",
        size: 24500000,
        hash: evidenceRecords[0].hashSha256,
      },
      ipAddress: "197.210.65.1",
      timestamp: daysAgo(30),
    },
    {
      action: "EVIDENCE_UPLOADED",
      userId: IDS.investigator1,
      resourceType: "evidence",
      resourceId: IDS.ev2,
      metadata: {
        filename: "forensic_report_device_001.pdf",
        size: 3200000,
        hash: evidenceRecords[1].hashSha256,
      },
      ipAddress: "197.210.65.1",
      timestamp: daysAgo(25),
    },
    {
      action: "EVIDENCE_UPLOADED",
      userId: IDS.investigator1,
      resourceType: "evidence",
      resourceId: IDS.ev3,
      metadata: {
        filename: "cctv_gate3_frame_0214.jpg",
        size: 890000,
        hash: evidenceRecords[2].hashSha256,
      },
      ipAddress: "197.210.65.1",
      timestamp: daysAgo(22),
    },
    {
      action: "EVIDENCE_UPLOADED",
      userId: IDS.investigator2,
      resourceType: "evidence",
      resourceId: IDS.ev4,
      metadata: {
        filename: "netlog_exfil_event_20240310.csv",
        size: 1450000,
        hash: evidenceRecords[3].hashSha256,
      },
      ipAddress: "102.89.44.17",
      timestamp: daysAgo(18),
    },
    {
      action: "EVIDENCE_UPLOADED",
      userId: IDS.investigator1,
      resourceType: "evidence",
      resourceId: IDS.ev5,
      metadata: {
        filename: "witness_statement_primary.pdf",
        size: 520000,
        hash: evidenceRecords[4].hashSha256,
      },
      ipAddress: "197.210.65.1",
      timestamp: daysAgo(15),
    },
    {
      action: "EVIDENCE_UPLOADED",
      userId: IDS.investigator2,
      resourceType: "evidence",
      resourceId: IDS.ev6,
      metadata: {
        filename: "malware_rx7_isolated.bin",
        size: 245000,
        hash: evidenceRecords[5].hashSha256,
      },
      ipAddress: "102.89.44.17",
      timestamp: daysAgo(10),
    },
    {
      action: "EVIDENCE_UPLOADED",
      userId: IDS.investigator1,
      resourceType: "evidence",
      resourceId: IDS.ev7,
      metadata: {
        filename: "bank_statements_suspect_q1q2.pdf",
        size: 2100000,
        hash: evidenceRecords[6].hashSha256,
      },
      ipAddress: "197.210.65.1",
      timestamp: daysAgo(6),
    },
    {
      action: "EVIDENCE_UPLOADED",
      userId: IDS.investigator2,
      resourceType: "evidence",
      resourceId: IDS.ev8,
      metadata: {
        filename: "arrest_report_2024_0077.pdf",
        size: 340000,
        hash: evidenceRecords[7].hashSha256,
      },
      ipAddress: "102.89.44.17",
      timestamp: daysAgo(3),
    },
    // Evidence views
    {
      action: "EVIDENCE_VIEWED",
      userId: IDS.investigator1,
      resourceType: "evidence",
      resourceId: IDS.ev1,
      metadata: {},
      ipAddress: "197.210.65.1",
      timestamp: daysAgo(28),
    },
    {
      action: "EVIDENCE_VIEWED",
      userId: IDS.admin,
      resourceType: "evidence",
      resourceId: IDS.ev1,
      metadata: {},
      ipAddress: "197.210.10.5",
      timestamp: daysAgo(25),
    },
    {
      action: "EVIDENCE_VIEWED",
      userId: IDS.auditor,
      resourceType: "evidence",
      resourceId: IDS.ev2,
      metadata: {},
      ipAddress: "41.58.200.22",
      timestamp: daysAgo(12),
    },
    {
      action: "EVIDENCE_VIEWED",
      userId: IDS.investigator2,
      resourceType: "evidence",
      resourceId: IDS.ev4,
      metadata: {},
      ipAddress: "102.89.44.17",
      timestamp: daysAgo(16),
    },
    {
      action: "EVIDENCE_VIEWED",
      userId: IDS.admin,
      resourceType: "evidence",
      resourceId: IDS.ev7,
      metadata: {},
      ipAddress: "197.210.10.5",
      timestamp: daysAgo(4),
    },
    {
      action: "EVIDENCE_VIEWED",
      userId: IDS.admin,
      resourceType: "evidence",
      resourceId: IDS.ev8,
      metadata: {},
      ipAddress: "197.210.10.5",
      timestamp: daysAgo(1),
    },
    // Tamper detection
    {
      action: "TAMPER_DETECTED",
      userId: IDS.investigator2,
      resourceType: "evidence",
      resourceId: IDS.ev8,
      metadata: {
        storedHash: evidenceRecords[7].hashSha256,
        currentHash:
          "000000000000000000000000000000000000000000000000000000000000dead",
      },
      ipAddress: "102.89.44.17",
      timestamp: daysAgo(2),
    },
    // Anomaly detections
    {
      action: "ANOMALY_DETECTED",
      userId: IDS.admin,
      resourceType: "system",
      resourceId: null,
      metadata: {
        riskLevel: "high",
        score: 0.87,
        logCount: 50,
        flaggedUsers: 1,
      },
      ipAddress: "197.210.10.5",
      timestamp: daysAgo(8),
    },
    {
      action: "ANOMALY_DETECTED",
      userId: IDS.admin,
      resourceType: "system",
      resourceId: null,
      metadata: {
        riskLevel: "critical",
        score: 0.96,
        logCount: 50,
        flaggedUsers: 1,
      },
      ipAddress: "197.210.10.5",
      timestamp: daysAgo(2),
    },
    // AI training
    {
      action: "AI_MODEL_TRAINED",
      userId: IDS.admin,
      resourceType: "system",
      resourceId: null,
      metadata: { status: "trained", samples: 120 },
      ipAddress: "197.210.10.5",
      timestamp: daysAgo(14),
    },
    // Admin actions
    {
      action: "USER_UPDATED",
      userId: IDS.admin,
      resourceType: "user",
      resourceId: IDS.investigator2,
      metadata: { fullName: "Amara Nwosu" },
      ipAddress: "197.210.10.5",
      timestamp: daysAgo(15),
    },
    // Anomaly resolved
    {
      action: "ANOMALY_RESOLVED",
      userId: IDS.admin,
      resourceType: "anomaly",
      resourceId: IDS.an1,
      metadata: {
        notes:
          "Investigated and confirmed false positive — off-hours access was authorised.",
      },
      ipAddress: "197.210.10.5",
      timestamp: daysAgo(5),
    },
  ];

  let auditCount = 0;
  for (const entry of auditEntries) {
    const existing = await prisma.auditLog.findFirst({
      where: {
        action: entry.action,
        userId: entry.userId,
        resourceId: entry.resourceId,
        timestamp: entry.timestamp,
      },
    });
    if (!existing) {
      await prisma.auditLog.create({ data: entry });
      auditCount++;
    }
  }
  console.log(`   ✓  ${auditCount} audit log entries seeded\n`);

  // ── 5. ANOMALY LOGS ───────────────────────────────────────────────────────
  console.log("⚠️   Seeding anomaly logs...");

  const anomalyEntries = [
    {
      id: IDS.an1,
      userId: IDS.investigator2,
      evidenceId: IDS.ev6,
      riskLevel: "medium",
      score: 0.62,
      reason:
        "Background check after upload — access_count=18, is_off_hours=true, action_entropy=0.812",
      isResolved: true,
      resolvedBy: IDS.admin,
      resolvedAt: daysAgo(5),
      createdAt: daysAgo(9),
    },
    {
      id: IDS.an2,
      userId: IDS.investigator2,
      evidenceId: IDS.ev8,
      riskLevel: "critical",
      score: 0.96,
      reason:
        "Isolation Forest flagged user — access_count=47, is_off_hours=true, action_entropy=1.204. Coincides with tamper detection on evidence ev8.",
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: daysAgo(2),
    },
    {
      id: IDS.an3,
      userId: IDS.investigator1,
      evidenceId: IDS.ev7,
      riskLevel: "high",
      score: 0.81,
      reason:
        "Background check after upload — access_count=34, is_off_hours=false, action_entropy=1.056. Unusually high access frequency for this user.",
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: daysAgo(5),
    },
    {
      id: IDS.an4,
      userId: IDS.investigator2,
      evidenceId: IDS.ev4,
      riskLevel: "low",
      score: 0.41,
      reason:
        "Background check after upload — access_count=9, is_off_hours=true, action_entropy=0.520. Low-confidence flag, likely benign.",
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: daysAgo(17),
    },
    {
      id: IDS.an5,
      userId: IDS.investigator1,
      evidenceId: IDS.ev3,
      riskLevel: "medium",
      score: 0.68,
      reason:
        "Isolation Forest flagged user — access_count=22, is_off_hours=false, action_entropy=0.933. Multiple rapid accesses to image evidence.",
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: daysAgo(20),
    },
  ];

  for (const entry of anomalyEntries) {
    await prisma.anomalyLog.upsert({
      where: { id: entry.id },
      update: {},
      create: entry,
    });
  }
  console.log(`   ✓  ${anomalyEntries.length} anomaly log entries seeded\n`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("✅  Seed complete!\n");
  console.log("   Seeded:");
  console.log(`   • ${users.length} users`);
  console.log(`   • ${evidenceRecords.length} evidence records (1 tampered)`);
  console.log(`   • ${custodyCount} custody log entries`);
  console.log(`   • ${auditCount} audit log entries`);
  console.log(
    `   • ${anomalyEntries.length} anomaly logs (1 resolved, 1 critical)\n`,
  );
  console.log("   Quick test — login as admin:");
  console.log("   curl -X POST http://localhost:4000/api/auth/login \\");
  console.log('     -H "Content-Type: application/json" \\');
  console.log(
    '     -d \'{"email":"admin@evidrax.io","password":"Admin@Evidrax123!"}\'\n',
  );
}

main()
  .catch((e) => {
    console.error("❌  Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
