# KAO // 顔 — single-image deploy for Railway / Fly / any Docker host.
# Builds the client and serves it + the Socket.io endpoint from one Node process.
FROM node:22-slim

WORKDIR /app

# Install ALL deps (devDeps like vite/typescript are needed for the build step).
COPY package*.json ./
RUN npm install --include=dev

# Build the client (server runs straight from TS via tsx — no server build step).
COPY . .
RUN npm run build

ENV NODE_ENV=production
# The host injects $PORT; the server reads it (defaults to 3000 locally).
EXPOSE 3000

CMD ["npm", "start"]
