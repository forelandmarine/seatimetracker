FROM node:20-slim

WORKDIR /app

ARG NPM_TOKEN
ENV NPM_TOKEN=$NPM_TOKEN

COPY package.json package-lock.json .npmrc ./

RUN echo "//npm.pkg.github.com/:_authToken=${NPM_TOKEN}" >> .npmrc && \
    npm install && \
    rm -f .npmrc

COPY . .

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
