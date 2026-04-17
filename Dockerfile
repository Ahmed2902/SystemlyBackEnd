# Multi-stage Dockerfile for Hgezli

FROM node:18-bullseye-slim AS builder
WORKDIR /app
ARG DATABASE_URL="postgres://postgres:postgres@db:5432/hgezli"
ENV DATABASE_URL=$DATABASE_URL

# Install deps
COPY package.json package-lock.json* ./
RUN npm install --silent

# Copy source and build
COPY . .
## Generate prisma client for linux (so TS can import generated types)
RUN npx prisma generate --schema=prisma/schema.prisma

# Build TypeScript
RUN npm run build

# Final image
FROM node:18-bullseye-slim
WORKDIR /app
ENV NODE_ENV=production

# Copy built assets and node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
