FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/media-worker/package.json packages/media-worker/package.json
RUN pnpm install --filter @repo/media-worker --prod --frozen-lockfile
COPY packages/media-worker/src packages/media-worker/src
WORKDIR /workspace/packages/media-worker
CMD ["node", "--max-old-space-size=384", "--experimental-strip-types", "src/worker.ts"]
