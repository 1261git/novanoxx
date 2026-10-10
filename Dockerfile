FROM node:24-bookworm-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4317 DATA_DIR=/data
EXPOSE 4317
CMD ["node", "server.cjs"]
