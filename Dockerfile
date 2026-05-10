FROM node:22-alpine

WORKDIR /app

COPY package.json server.js index.html README.md ./
COPY context ./context

ENV NODE_ENV=production
ENV PORT=80
ENV DATA_DIR=/data

RUN mkdir -p /data && addgroup -S appgroup && adduser -S appuser -G appgroup && chown -R appuser:appgroup /app /data

USER appuser

EXPOSE 80

CMD ["node", "server.js"]
