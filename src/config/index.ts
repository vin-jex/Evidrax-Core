import "dotenv/config";

const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "4000", 10),

  jwt: {
    secret: process.env.JWT_SECRET || "change-me-in-production",
    algorithm: (process.env.JWT_ALGORITHM || "HS256") as "HS256",
    expiresIn: process.env.JWT_EXPIRES_IN || "60m",
  },

  database: {
    url: process.env.DATABASE_URL,
  },

  fastapi: {
    baseUrl: process.env.FASTAPI_BASE_URL || "http://localhost:8000",
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.ALERT_EMAIL_FROM || "evidrax-core@localhost",
    to: process.env.ALERT_EMAIL_TO || "admin@localhost",
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
  },
} as const;

export default config;
