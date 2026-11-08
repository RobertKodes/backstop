# Multi-stage image for the TypeScript services (indexer, api, keeper, agent).
#   docker build --build-arg SERVICE=api -t backstop-api .
FROM node:20-alpine AS build
ARG SERVICE
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY sdk ./sdk
COPY indexer ./indexer
COPY ${SERVICE} ./${SERVICE}
RUN pnpm install --frozen-lockfile --filter "@backstop/${SERVICE}..." \
 && pnpm --filter @backstop/sdk build \
 && (pnpm --filter @backstop/indexer build || true) \
 && pnpm --filter "@backstop/${SERVICE}" build \
 && pnpm --filter "@backstop/${SERVICE}" deploy --prod /out

FROM node:20-alpine
ARG SERVICE
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./
COPY --from=build /repo/indexer/migrations ./migrations
USER node
CMD ["node", "dist/main.js"]
