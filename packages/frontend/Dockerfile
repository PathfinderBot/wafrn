# Build stage
FROM node:24-alpine AS builder

RUN apk add --no-cache perl curl tini bash git

WORKDIR /app/packages/frontend

COPY package.json /app
COPY package-lock.json /app

COPY packages/frontend/package.json .

COPY .git .

# install dependencies
RUN npm install

COPY packages/frontend .

# Override frontend files with files put here. Allows easy overriding of assets, and potentially actual code as well
RUN cp -af /app/packages/frontend/overrides/* /app/packages/frontend/src || true

# ngsw config
RUN cp /app/packages/frontend/ngsw-config.json.example /app/packages/frontend/ngsw-config.json

# copy the frontend environment file
RUN rm -rf src/environments/environment.prod.ts && mv src/environments/environment.docker.ts src/environments/environment.prod.ts

ENV NODE_ENV=production

RUN npm run build

RUN mv dist/wafrn/browser /app/frontend

COPY packages/frontend/Caddyfile.example /app/Caddyfile
RUN cp /app/packages/frontend/src/assets/pds-homepage.txt /app/pds-homepage.txt

COPY packages/cadd[y]/Caddyfil[e] /app/Caddyfile

FROM caddy:2

RUN apk add perl

COPY --from=builder /app/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/pds-homepage.txt /pds-homepage/pds.txt
COPY --from=builder /app/frontend/ /app/frontend
COPY --from=builder /app/packages/frontend/docker-entrypoint.sh /docker-entrypoint.sh

ENTRYPOINT [ "/docker-entrypoint.sh" ]

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
