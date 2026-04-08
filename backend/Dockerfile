FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json specific-dev-framework-1.28.0.tgz ./

RUN npm install

COPY . .

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
