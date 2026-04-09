FROM node:20-slim

WORKDIR /app

# Copy package.json only — package-lock will be regenerated.
# We removed @specific-dev/framework so the old lockfile is invalid.
COPY package.json ./

RUN npm install --no-audit --no-fund

COPY . .

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
