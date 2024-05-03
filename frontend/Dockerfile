FROM node:lts-alpine AS base

# Install dependencies only when needed
FROM base AS deps

# Check https://github.com/nodejs/docker-node/tree/main#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY yarn.lock /app
RUN set -e; \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN set -e; \
  yarn next telemetry disable; \
  if [ -f yarn.lock ]; then yarn run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Production image, copy all the files and run next
FROM base AS runner

LABEL org.opencontainers.image.title="cplace-docs-chat" \
      org.opencontainers.image.description="cplace Docs Chat" \
      org.opencontainers.image.vendor="collaboration Factory AG" \
      org.opencontainers.image.authors="operations@cplace.com"



ENV NODE_ENV=production \
  HOSTNAME="0.0.0.0" \
  PORT="3000"

RUN set -e; \
  addgroup --system --gid 1001 nodejs; \
  adduser --system --uid 1001 nextjs; \
  mkdir .next; \
  chown nextjs:nodejs .next

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone /app/
COPY --from=builder --chown=nextjs:nodejs /app/.next/static /app/.next/static

USER nextjs

EXPOSE 3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "server.js"]
