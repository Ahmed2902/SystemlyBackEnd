FROM node:22-bookworm-slim AS builder

WORKDIR /app

ARG DATABASE_URL="postgresql://postgres:postgres@localhost:5432/systemly_build"
ENV DATABASE_URL=$DATABASE_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run prisma:generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package.json ./package.json

EXPOSE 3000

CMD ["node", "dist/server.js"]
