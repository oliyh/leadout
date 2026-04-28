# Stage 1: build UI
FROM node:22-alpine AS ui-builder
WORKDIR /build
COPY ui/package.json ui/package-lock.json* ./
RUN npm install
COPY ui/ .
RUN npm run build

# Stage 2: run server
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev
COPY server/server.js .
COPY server/app.js .
COPY server/src/ ./src/
COPY --from=ui-builder /build/dist ./public
EXPOSE 3000
CMD ["node", "server.js"]
