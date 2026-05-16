# Type-check stage - runs on native architecture for better performance
FROM --platform=$BUILDPLATFORM node:24-alpine AS type-check

WORKDIR /app/packages/backend

COPY package.json /app
COPY package-lock.json /app
COPY packages/backend/package.json .

ENV NODE_ENV=production
RUN npm install

COPY packages/backend .
COPY packages/backend/environment.example.ts environment.ts

RUN npm run type-check

# Build stage - depends on successful type-check
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

# Copy from type-check stage - ensures type-check passed before continuing

COPY --from=type-check /app/packages/backend .


# install dependencies
RUN npm install


# create log folder early to prevent node err: cannot open logs/*.log
RUN mkdir -p logs

# some default values
ENV POSTGRES_HOST=db
ENV POSTGRES_PORT=5432
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379
ENV LISTEN_IP=0.0.0.0
ENV PORT=9000
ENV LOG_DESTINATION=1

# expose port from environment.ts
EXPOSE ${PORT}

# set up configuration from environment, then run tini as entrypoint to be able to handle kernel signals
ENTRYPOINT ["tini","--"]

ENV NODE_OPTIONS=--dns-result-order=ipv4first

CMD ["npm","start"]
