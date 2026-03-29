# Evidrax-Core - Node.js API

> Forensic Evidence Security Platform · TypeScript · Express · Prisma · Swagger

## Architecture

```
Next.js (UI)
    ↓
Evidrax-Core (Node API)  ←── Auth · DB · Business Logic · Cloudinary · Swagger Docs
    ↓
FastAPI                  ←── Anomaly scoring only (stateless, no DB)
```

| Concern              | Owner          | Location                              |
|----------------------|----------------|---------------------------------------|
| Authentication       | Evidrax-Core   | `src/services/authService.ts`         |
| JWT issuing          | Evidrax-Core   | `src/services/authService.ts`         |
| Password hashing     | Evidrax-Core   | `src/services/authService.ts`         |
| Role enforcement     | Evidrax-Core   | `src/middleware/auth.ts`              |
| DB schema            | Evidrax-Core   | `prisma/schema.prisma`                |
| DB migrations        | Evidrax-Core   | Prisma only - no SQLAlchemy           |
| Evidence upload      | Evidrax-Core   | `src/services/evidenceService.ts`     |
| SHA-256 integrity    | Evidrax-Core   | `src/services/storageService.ts`      |
| Audit + custody logs | Evidrax-Core   | `src/services/auditService.ts`        |
| Anomaly records      | Evidrax-Core   | `src/routes/ai.ts` (after score)      |
| Email alerts         | Evidrax-Core   | `src/services/alertService.ts`        |
| Anomaly *scoring*    | FastAPI        | `POST /analyze` (stateless)           |

FastAPI is called only from `src/services/fastapiService.ts`.  
It receives log data and returns scores. Evidrax-Core persists the results.

---

## Setup

```bash
cp .env.example .env        # fill in DB, Cloudinary, JWT secret, and Resend key
pnpm install
pnpm generate               # generate Prisma client
pnpm migrate                # run migrations
pnpm dev                    # start with tsx watch (hot reload)
```

Bootstrap the first admin account (one-time):

```bash
curl -X POST http://localhost:4000/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@uni.edu","password":"SecurePass123!","fullName":"Admin"}'
```

### Build for production

```bash
pnpm build    # tsc → dist/
pnpm start    # node dist/server.js
```

---

## Environment Variables

| Variable                | Required | Description                        |
|-------------------------|----------|------------------------------------|
| `DATABASE_URL`          | ✅        | PostgreSQL connection string        |
| `JWT_SECRET`            | ✅        | JWT signing secret                  |
| `CLOUDINARY_CLOUD_NAME` | ✅        | Cloudinary cloud name               |
| `CLOUDINARY_API_KEY`    | ✅        | Cloudinary API key                  |
| `CLOUDINARY_API_SECRET` | ✅        | Cloudinary API secret               |
| `RESEND_API_KEY`        | –         | Resend key for email alerts         |
| `ALERT_EMAIL_FROM`      | –         | Sender address for alerts           |
| `ALERT_EMAIL_TO`        | –         | Recipient address for alerts        |
| `REDIS_URL`             | –         | Redis URL (optional cache)          |
| `FASTAPI_BASE_URL`      | –         | FastAPI service URL                 |
| `FRONTEND_URL`          | –         | Allowed CORS origin (production)    |
| `PORT`                  | –         | Server port (default: `4000`)       |

---

## API Reference

| Method | Path                              | Role                          |
|--------|-----------------------------------|-------------------------------|
| POST   | `/api/auth/bootstrap`             | -                             |
| POST   | `/api/auth/login`                 | -                             |
| POST   | `/api/auth/register`              | ADMIN                         |
| GET    | `/api/auth/me`                    | Any                           |
| POST   | `/api/evidence`                   | INVESTIGATOR, ADMIN           |
| GET    | `/api/evidence`                   | Any                           |
| GET    | `/api/evidence/:id`               | Any                           |
| POST   | `/api/evidence/:id/verify`        | Any                           |
| GET    | `/api/evidence/:id/custody`       | Any                           |
| POST   | `/api/ai/analyze`                 | Any (Node calls FastAPI, persists result) |
| POST   | `/api/ai/train`                   | ADMIN                         |
| GET    | `/api/ai/anomalies`               | Any                           |
| PATCH  | `/api/ai/anomalies/:id/resolve`   | ADMIN                         |
| GET    | `/api/logs/audit`                 | Any*                          |
| POST   | `/api/logs/access`                | Any                           |
| GET    | `/api/stats/overview`             | ADMIN                         |
| GET    | `/api/stats/evidence`             | ADMIN                         |
| GET    | `/api/stats/users`                | ADMIN                         |
| GET    | `/api/stats/anomalies`            | Any                           |
| GET    | `/api/stats/activity`             | Any                           |
| GET    | `/api/admin/users`                | ADMIN                         |
| PATCH  | `/api/admin/users/:id`            | ADMIN                         |
| DELETE | `/api/admin/users/:id`            | ADMIN                         |
| GET    | `/api/admin/stats`                | ADMIN                         |

*Investigators see only their own audit trail.*

---

## Tests

```bash
pnpm test              # run all tests
pnpm test:watch        # watch mode
pnpm test:coverage     # with coverage report
```

All external dependencies (Prisma, Redis, Cloudinary, FastAPI, Resend) are mocked in `tests/setup.ts`.

---

## Swagger / OpenAPI Docs

Interactive API documentation is served automatically when the server starts.

| URL | Description |
|-----|-------------|
| `http://localhost:4000/docs` | Swagger UI (interactive browser) |
| `http://localhost:4000/docs.json` | Raw OpenAPI 3.0 spec (JSON) |

All routes are annotated with `@openapi` JSDoc comments in `src/routes/*.ts`. The spec is generated at startup via `swagger-jsdoc` and mounted with `swagger-ui-express`. The Swagger UI topbar is styled to match the Evidrax-Core brand.

---

## Stack

- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Express 4
- **ORM**: Prisma 7 (PostgreSQL via `@prisma/adapter-pg`)
- **Cache**: Redis (ioredis) - optional, fails silently
- **Storage**: Cloudinary (`resource_type: raw`)
- **Auth**: bcrypt + JWT
- **Email**: Resend
- **Docs**: swagger-jsdoc + swagger-ui-express (OpenAPI 3.0)
- **Tests**: Jest + ts-jest + supertest + jest-mock-extended
