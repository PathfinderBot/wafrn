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


# Build stage
FROM node:24-alpine AS build

# include important binaries
RUN apk add --no-cache perl curl tini bash ffmpeg exiv2

# set working directory
WORKDIR /app/packages/backend

# copy package.json and package-lock.json
COPY package.json /app
COPY package-lock.json /app
COPY packages/backend/package.json .

# set node_env as production for the npm install command
ENV NODE_ENV=production

# install dependencies
RUN npm install

# copy the rest of the files
COPY packages/backend .


# create log folder early to prevent node err: cannot open logs/*.log
RUN mkdir -p logs
COPY --from=builder /app/frontend/ /app/packages/frontend

COPY packages/backend/environment.example.ts environment.ts

# some default values
ENV POSTGRES_HOST=db
ENV POSTGRES_PORT=5432
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379
ENV LISTEN_IP=0.0.0.0
ENV PORT=9000
ENV LOG_DESTINATION=1

VOLUME ["/app/packages/backend/uploads"]
VOLUME ["/app/packages/backend/cache"]

# expose port from environment.ts
EXPOSE ${PORT}

# set up configuration from environment, then run tini as entrypoint to be able to handle kernel signals
ENTRYPOINT ["tini","--"]

ENV NODE_OPTIONS=--dns-result-order=ipv4first

CMD ["npm","start"]
