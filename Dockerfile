FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && install -d /usr/share/postgresql-common/pgdg && curl --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
RUN echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list && apt-get update && apt-get install -y --no-install-recommends postgresql-18 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY source/package.json source/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile
COPY --chown=node:node source ./source
COPY --chown=node:node verify-linux-pg.cjs launch.cjs ./
USER node
ENV NODE_ENV=test PORT=10000 NNX_SYNTHETIC_JOB=stage9-owned-pg-v1
EXPOSE 10000
CMD ["node","launch.cjs"]
