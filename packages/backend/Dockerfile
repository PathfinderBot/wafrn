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

COPY packages/backend/environment.example.ts environment.ts

RUN npm run type-check

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
