import swaggerJsdoc from "swagger-jsdoc";
import { version } from "../../package.json";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Evidrax-Core API",
      version,
      description:
        "REST API for the Evidrax-Core Forensic Evidence Security Platform. " +
        "Handles authentication, evidence management, integrity verification, " +
        "anomaly detection, audit logging, and admin operations.",
      contact: {
        name: "Evidrax-Core",
      },
      license: {
        name: "Private",
      },
    },
    servers: [
      {
        url: "http://localhost:4000",
        description: "Development server",
      },
      {
        url: "https://api.evidrax.io",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token obtained from POST /api/auth/login",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            email: { type: "string", format: "email" },
            fullName: { type: "string", nullable: true },
            role: {
              type: "string",
              enum: ["ADMIN", "INVESTIGATOR", "AUDITOR"],
            },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Evidence: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            filePath: {
              type: "string",
              format: "uri",
              description:
                "Canonical Cloudinary storage URL (used for integrity checks)",
            },
            viewUrl: {
              type: "string",
              format: "uri",
              nullable: true,
              description:
                "Browser-viewable URL - PDFs and images open inline, other types fall back to the download URL",
            },
            originalFilename: { type: "string" },
            fileSize: { type: "number" },
            mimeType: { type: "string" },
            hashSha256: { type: "string" },
            uploadedBy: { type: "string", format: "uuid" },
            isTampered: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        CustodyLog: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            evidenceId: { type: "string", format: "uuid" },
            userId: { type: "string", format: "uuid" },
            action: { type: "string" },
            ipAddress: { type: "string", nullable: true },
            location: { type: "string", nullable: true },
            notes: { type: "string", nullable: true },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        AuditLog: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            userId: { type: "string", format: "uuid", nullable: true },
            action: { type: "string" },
            resourceType: { type: "string", nullable: true },
            resourceId: { type: "string", nullable: true },
            metadata: { type: "object" },
            ipAddress: { type: "string", nullable: true },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        AnomalyLog: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            evidenceId: { type: "string", format: "uuid", nullable: true },
            userId: { type: "string", format: "uuid", nullable: true },
            riskLevel: {
              type: "string",
              enum: ["low", "medium", "high", "critical"],
            },
            score: { type: "number" },
            reason: { type: "string" },
            isResolved: { type: "boolean" },
            resolvedBy: { type: "string", format: "uuid", nullable: true },
            resolvedAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
        },
        ValidationError: {
          type: "object",
          properties: {
            error: { type: "string", example: "Validation failed" },
            details: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: "Missing or invalid JWT token",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: { error: "Missing or malformed Authorization header" },
            },
          },
        },
        Forbidden: {
          description: "Insufficient role",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: { error: "Access denied. Required role(s): ADMIN" },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: { error: "Evidence not found" },
            },
          },
        },
        ValidationFailed: {
          description: "Request body or params failed validation",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ValidationError" },
            },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: "Auth", description: "Authentication and user identity" },
      {
        name: "Evidence",
        description: "Evidence upload, retrieval, and integrity verification",
      },
      { name: "AI", description: "Anomaly detection and model training" },
      { name: "Logs", description: "Audit and access log queries" },
      {
        name: "Stats",
        description: "System statistics and activity dashboards",
      },
      {
        name: "Admin",
        description: "User management and system stats (ADMIN only)",
      },
    ],
  },
  apis: ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
