### Base layer shared by every stage
FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./

### Development dependencies
FROM base AS deps-dev
RUN npm ci

### Production dependencies only
FROM base AS deps-prod
RUN npm ci --omit=dev

### Development runtime, source is bind mounted by compose
FROM base AS dev
COPY --from=deps-dev /app/node_modules ./node_modules
COPY . .
RUN mkdir -p uploads/avatars
EXPOSE 5000
CMD ["npm", "run", "dev"]

### Production runtime
FROM base AS prod
ENV NODE_ENV=production
COPY --from=deps-prod /app/node_modules ./node_modules
COPY src ./src
COPY seeds ./seeds
RUN mkdir -p uploads/avatars && chown -R node:node /app
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
