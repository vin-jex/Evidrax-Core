FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache dumb-init

COPY package.json pnpm-lock.yaml ./

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

RUN pnpm prisma generate
RUN pnpm build


# ── Production ─────────────────────────

FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache dumb-init

COPY package.json pnpm-lock.yaml ./

RUN corepack enable && pnpm install --prod --frozen-lockfile

# COPY EVERYTHING YOU ACTUALLY NEED
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]