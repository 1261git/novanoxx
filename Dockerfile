FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg poppler-utils && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && install -d /usr/share/postgresql-common/pgdg && curl --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc && echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list && apt-get update && apt-get install -y --no-install-recommends postgresql-client-18 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile
COPY . .
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4317 DATA_DIR=/data
EXPOSE 4317
CMD ["node", "server.cjs"]
