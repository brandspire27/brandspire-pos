# Build from the repository root as Docker context.
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @brandspire/api... --no-frozen-lockfile

COPY apps/api apps/api
RUN pnpm --filter @brandspire/api build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist

EXPOSE 3001
CMD ["pnpm", "--filter", "@brandspire/api", "start"]
