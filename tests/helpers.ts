import jwt from "jsonwebtoken";

const TEST_SECRET = "test-secret-key";
process.env.JWT_SECRET = TEST_SECRET;

export function makeToken(overrides: Record<string, unknown> = {}): string {
  const payload = { sub: "user-uuid-1234", role: "INVESTIGATOR", ...overrides };
  return jwt.sign(payload, TEST_SECRET, { expiresIn: "1h" });
}

export function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-uuid-1234",
    email: "test@university.edu",
    fullName: "Test User",
    role: "INVESTIGATOR",
    isActive: true,
    createdAt: new Date(),
    passwordHash: "$2b$12$hashedpassword",
    ...overrides,
  };
}

export const adminToken = () =>
  makeToken({ sub: "admin-uuid-5678", role: "ADMIN" });
export const adminUser = () =>
  makeUser({
    id: "admin-uuid-5678",
    email: "admin@university.edu",
    role: "ADMIN",
  });

export const investigatorToken = () =>
  makeToken({ sub: "inv-uuid-9999", role: "INVESTIGATOR" });
export const investigatorUser = () =>
  makeUser({
    id: "inv-uuid-9999",
    email: "investigator@university.edu",
    role: "INVESTIGATOR",
  });

export const auditorToken = () =>
  makeToken({ sub: "aud-uuid-7777", role: "AUDITOR" });
export const auditorUser = () =>
  makeUser({
    id: "aud-uuid-7777",
    email: "auditor@university.edu",
    role: "AUDITOR",
  });

export function makeEvidence(overrides: Record<string, unknown> = {}) {
  return {
    id: "evidence-uuid-1234",
    title: "Test Evidence",
    description: "A test file",
    filePath:
      "https://res.cloudinary.com/test/raw/upload/v1/evidrax-core/test.pdf",
    cloudinaryPublicId: "evidrax-core/test",
    originalFilename: "test.pdf",
    fileSize: 2048,
    mimeType: "application/pdf",
    hashSha256:
      "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    uploadedBy: "user-uuid-1234",
    isTampered: false,
    createdAt: new Date(),
    ...overrides,
  };
}
