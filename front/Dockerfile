### Base layer with dependencies installed
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

### Development runtime, source is bind mounted by compose
FROM base AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

### Production build, Vite inlines VITE_ variables at build time
FROM base AS build
ARG VITE_API_URL=/api
ARG VITE_USE_STRICT_MODE=true
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_USE_STRICT_MODE=$VITE_USE_STRICT_MODE
COPY . .
RUN npm run build

### Production runtime served by nginx
FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
