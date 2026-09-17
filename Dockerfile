# syntax=docker/dockerfile:1

ARG NODE_VERSION=26.8.1
ARG NODE_IMAGE=node:${NODE_VERSION}-trixie-slim

# Multiple stage build still produces a single image WITHOUT unnecessary package
# manager, etc.

################################################################################
# Dependencies Stage: Install pnpm (via npm) and then install only production
#   dependencies for the app. Nothing in this stage will persist except for the
#   contents explicitly copied from here in the next stage, e.g. `node_modules/`.
################################################################################
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
RUN npm install --global pnpm@12.3.4
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# `--frozen-lockfile` prevents updating the lockfile.
# `--prod` skips `devDependencies`.
# `--ignore-scripts` skips the `prepare` hook, which would fail as it would
#   otherwise run `devDependencies` scripts.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

################################################################################
# Runtime Stage
################################################################################
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Sets the timezone for the container. Does not affect the app.
ENV TZ=America/Los_Angeles
# Copy `node_modules` from the "dependencies" stage to the "runtime" stage here.
COPY --from=dependencies /app/node_modules ./node_modules
# Copy so that ESM is explicit via `"type": "module"` instead of relying on
# syntax detection.
COPY package.json ./
COPY src/ ./src/
USER node
ENTRYPOINT ["node", "src/main.ts"]
