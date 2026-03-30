/**
 * Runs once before the entire Jest suite.
 * Sets environment variables needed by the app before any module is imported.
 */
export default async function globalSetup() {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-key";
  process.env.JWT_ALGORITHM = "HS256";
  process.env.JWT_EXPIRES_IN = "1h";
  process.env.PORT = "4001";
  process.env.DATABASE_URL =
    "postgresql://test:test@localhost:5432/evidrax_test";
  process.env.REDIS_URL = "redis://localhost:6379";
}
