FROM node:22-alpine AS deps

ENV NODE_ENV=production

WORKDIR /usr/src/app

FROM node:22-alpine AS builder
WORKDIR /usr/src/app

COPY ./package.json ./
COPY ./package-lock.json ./
COPY ./.npmrc ./

RUN npm ci

COPY ./tsconfig.json ./
COPY ./tsup.config.ts ./
COPY ./src ./src
RUN npm run build

RUN NODE_NO_WARNINGS=1 npm prune --omit=dev

FROM deps AS final
WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY ./package.json /usr/src/app/
COPY ./.env.production /usr/src/app/.env
COPY ./config.example.json /usr/src/app/config.json

# Set environment variable to read config from file
ENV CONFIG_FILE=/usr/src/app/config.json

# Expose port
EXPOSE 8082

CMD ["node", "--env-file=.env", "dist/run.js"]
