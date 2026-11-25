FROM node:22-bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/rotmiha/RoomFlow"
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/build ./build
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts ./prisma.config.ts
COPY frontend/dist ./public
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && if [ \"$SEED_DEMO_DATA\" = true ]; then node build/seed.js; fi && node build/server.js"]
