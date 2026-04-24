FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=optional --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime

ARG SEMGREP_VERSION=1.161.0
ENV NODE_ENV=production
ENV MCP_SERVER_SEMGREP_ALLOWED_ROOTS=/workspace:/app

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git python3 python3-pip \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --no-cache-dir --break-system-packages "semgrep==${SEMGREP_VERSION}" \
  && semgrep --version

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts \
  && npm cache clean --force

COPY --from=build /app/build ./build
RUN mkdir -p /workspace

CMD ["node", "build/index.js"]
