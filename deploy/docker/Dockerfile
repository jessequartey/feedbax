FROM node:22.18.0-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @feedbax/portal... build

FROM node:22.18.0-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app/apps/portal/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
