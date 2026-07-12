FROM node:22.18.0-alpine AS build
ENV CI=true
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @feedbax/portal... build

FROM node:22.18.0-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app/apps/portal/.output ./.output
COPY --from=build /app/connectors/notion/dist ./connectors/notion/dist
COPY --from=build /app/scripts/notion-doctor.mjs ./scripts/notion-doctor.mjs
COPY --from=build /app/feedbax.config.mjs ./feedbax.config.mjs
EXPOSE 3000
CMD ["sh", "-c", "node scripts/notion-doctor.mjs && node .output/server/index.mjs"]
