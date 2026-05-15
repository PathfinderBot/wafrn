# Build stage
FROM --platform=$BUILDPLATFORM node:24-alpine AS builder

RUN apk add --no-cache perl curl tini bash git

RUN mkdir -p /app/packages/frontend
WORKDIR /app/packages/frontend

# install dependencies
COPY packages/frontend/package.json .
RUN npm install

# copy the rest of the files
COPY packages/frontend .

# Override frontend files with files put here. Allows easy overriding of assets, and potentially actual code as well
RUN cp -af /app/packages/frontend/overrides/* /app/packages/frontend/src || true

# copy default ngsw config and use the frontend environment file for docker
RUN cp /app/packages/frontend/ngsw-config.json.example /app/packages/frontend/ngsw-config.json
  && rm -rf src/environments/environment.prod.ts
  && mv src/environments/environment.docker.ts src/environments/environment.prod.ts

ENV NODE_ENV=production

RUN npm run build && mv dist/wafrn/browser /app/frontend

FROM caddy:2

RUN apk add perl

COPY packages/frontend/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/packages/frontend/src/assets/pds-homepage.txt /pds-homepage/pds.txt
COPY --from=builder /app/frontend/ /var/www/html/frontend
COPY --from=builder /app/packages/frontend/docker-entrypoint.sh /docker-entrypoint.sh

# overrides volume for run-time overrides (useful if you use the pre-compiled wafrn images)
VOLUME ["/overrides"]
VOLUME ["/var/www/html/frontend"]
VOLUME ["/var/www/html/uploads"]

ENTRYPOINT [ "/docker-entrypoint.sh" ]

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
