# Build stage
FROM --platform=$BUILDPLATFORM node:24-alpine AS builder

RUN apk add --no-cache perl curl tini bash git

RUN mkdir -p /app/packages/frontend
WORKDIR /app/packages/frontend

# install dependencies before setting NODE_ENV=production (needed for angular-devkit in devDependencies)
COPY package.json /app
COPY package-lock.json /app
COPY packages/frontend/package.json .
RUN npm install

# copy the rest of the files
COPY packages/frontend .

# copy git info too so the prebuild script can read it
COPY .git /app

# Override frontend files with files put here. Allows easy overriding of assets, and potentially actual code as well
RUN cp -af /app/packages/frontend/overrides/* /app/packages/frontend/src || true

# copy default ngsw config and use the frontend environment file for docker
RUN cp /app/packages/frontend/ngsw-config.json.example /app/packages/frontend/ngsw-config.json && \
  rm -rf src/environments/environment.prod.ts && \
  mv src/environments/environment.docker.ts src/environments/environment.prod.ts

ENV NODE_ENV=production

RUN npm run build && mv dist/wafrn/browser /app/frontend

FROM caddy:2

RUN apk add perl jq bash

# eMudhra CA compromise (2026-10): caddy 2.11.x is built with Go < 1.26.10, so its
# embedded root store lacks the eMudhra key block. Point Go at a trimmed copy of
# the system store until caddy re-releases with the fix.
# Note: newer caddy bases use hashed cert filenames, hence the glob on *.
RUN mkdir -p /etc/cacerts && \
    i=0; \
    for f in /etc/ssl/certs/*; do \
        s=$(openssl x509 -in "$f" -noout -subject 2>/dev/null) || continue; \
        case "$s" in \
            *emSign* | *EmSign* | *"AAA Certificate Services"* | *Comodo*AAA*) ;; \
            *) cp "$f" "/etc/cacerts/c$i.pem"; i=$((i+1));; \
        esac; \
    done; \
    if [ "$i" -gt 0 ]; then \
        cat /etc/cacerts/c*.pem > /etc/cacerts/bundle.pem && rm -f /etc/cacerts/c*.pem; \
    fi
ENV SSL_CERT_FILE=/etc/cacerts/bundle.pem

COPY packages/frontend/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/packages/frontend/src/assets/pds-homepage.txt /pds-homepage/pds.txt
COPY --from=builder /app/frontend/ /usr/share/wafrn/frontend
COPY --from=builder /app/packages/frontend/overrides.sh /overrides.sh
COPY --from=builder /app/packages/frontend/docker-entrypoint.sh /docker-entrypoint.sh

RUN mkdir -p /var/www/html/frontend

# overrides volume for run-time overrides (useful if you use the pre-compiled wafrn images)
VOLUME ["/overrides"]
VOLUME ["/var/www/html/frontend"]
VOLUME ["/var/www/html/uploads"]

ENTRYPOINT [ "/docker-entrypoint.sh" ]

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
