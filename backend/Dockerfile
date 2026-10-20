FROM node:20-slim

WORKDIR /app

# Install from the lockfile so every deploy gets the same dependency tree.
# (A fresh `npm install` on each build began failing on 2026-10-20 with an npm
# internal error, "Cannot read properties of null (reading 'edgesOut')".)
COPY package.json package-lock.json ./

RUN npm ci --no-audit --no-fund

COPY . .

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
