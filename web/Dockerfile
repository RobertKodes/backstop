# Web app image. NEXT_PUBLIC_* values are inlined at build time, so they are
# build arguments (one image per environment):
#   docker build -f web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example \
#     --build-arg NEXT_PUBLIC_RPC_URL=https://rpc.example --build-arg NEXT_PUBLIC_CLUSTER=devnet \
#     --build-arg NEXT_PUBLIC_MINT=... --build-arg NEXT_PUBLIC_QUOTE_MINT=... -t backstop-web .
FROM node:20-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_RPC_URL
ARG NEXT_PUBLIC_CLUSTER=devnet
ARG NEXT_PUBLIC_MINT=""
ARG NEXT_PUBLIC_QUOTE_MINT=""
ARG NEXT_PUBLIC_SOL_PRICE_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL \
    NEXT_PUBLIC_CLUSTER=$NEXT_PUBLIC_CLUSTER \
    NEXT_PUBLIC_MINT=$NEXT_PUBLIC_MINT \
    NEXT_PUBLIC_QUOTE_MINT=$NEXT_PUBLIC_QUOTE_MINT \
    NEXT_PUBLIC_SOL_PRICE_URL=$NEXT_PUBLIC_SOL_PRICE_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY sdk ./sdk
COPY web ./web
RUN pnpm install --frozen-lockfile --filter "@backstop/web..." \
 && pnpm --filter @backstop/sdk build \
 && pnpm --filter @backstop/web build \
 && pnpm --filter @backstop/web deploy --prod /out \
 && cp -r web/.next /out/.next && cp -r web/public /out/public

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /out ./
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
