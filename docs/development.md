# Developing wafrn

## Project Structure

Wafrn is split between an [Angular](https://angular.dev) frontend and a [NodeJS](https://nodejs.org/en) backend.

```text
packages/
├── frontend/
│   ├── routes/
│   ├── util/
│   ├── README.md
│   └── ...
└── backend/
    ├── src/
    │   ├── app/
    │   ├── assets/
    │   └── ...
    ├── README.md
    └── ...
```

(Tree made with [tree.nathanfriend.io](https://tree.nathanfriend.io/))

## Contributing

If you would like to help develop the Frontend or Backend, read the README.md of the respective package.

- [Frontend - README.md](../packages/frontend/README.md)
- [Backend - README.md](../packages/backend/README.md)

## Local setup pointing to the production frontend

If you want to do development on the frontend and what you do does not require doing something like posting a lot or spaming an external account, you can simply:

1. Clone the repo
2. Install node 24 or use the provided Nix shell script
3. Run `npm install` at the root of the project
4. Run `npm run frontend:develop:prod`

If you want to point to a different backend or see additional information on the nix shells script, see the Frontend README file.

## Local setup with a local dummy instance

If you want to develop Wafrn frontend but require to do more "noisy" stuff, you can point it at a working instance. See [Frontend - README.md](../packages/frontend/README.md) for more details

If you want to setup both the backend and frontend locally there are a couple of helper scripts that can help you set up a local environment:

1. Run `./install/env_local_setup.sh`. This will setup the backend and frontend environment files to point to each other locally.

2. Run `docker compose up`. This will start up the required services: PostgreSQL, Redis and Caddy

> **Note:** If you're not a fan of docker, or you already have these services running, you can also install PostgreSQL, Redis and Caddy manually.

> **Note:** If you are running Caddy manually, or you are not using Docker Desktop but a more native docker installation, you will need to edit `packages/frontend/Caddyfile` and replace `host.docker.internal` with `localhost` for it to work properly.

3. Set up the the backend:

```sh
cd packages/backend
npm i
npm run db:migrate
```

4. Set up the frontend:

```sh
cd packages/frontend
npm i
npm run prebuild
npm exec -- ng build --configuration=devlocal
```

5. Start backend & frontend

```sh
cd packages/backend
NODE_TLS_REJECT_UNAUTHORIZED=0 npm start
```

```sh
cd packages/frontend
npm run prebuild
npm exec -- ng serve --host 0.0.0.0 --configuration=devlocal
```

6. If all is well go to `https://localhost` to see your app

The default username/password for local installation is: `admin@example.com` / `Password1!`

> **Note:** You can run `caddy trust` to install Caddy's root certificates, to the system store. This will remove the security warnings from your browser. You can also do `caddy untrust` once you're finished with the development.

> **Warning:** Due to how the Fediverse and Bluesky operates not all features will be accessible when developing the backend locally. You might [want to host your own Wafrn instance](./deployment.md) as a staging server if you wish to develop features that require proper access to the Fediverse and/or Bluesky

## Fullstack development with debugger

Ok so you definetively need to do some backend stuff! As long as you do not need to do fedi stuff and bluesky stuff, it's easy!

1. Clone the repo
2. Install docker and node 24
3. Do this command on the root of the project `npm install`
4. Copy the docker compose for local development `cp docker-compose.localBackendDebuggerDev.yml docker-compose.yml`
5. Copy the development environment file for backend `cp packages/backend/environment.dev.ts packages/backend/environment.ts`
6. Start the services required for wafrn to work: redis, postgres, and a db admin tool on https://localhost:8080 (type postgres, user and pass: root, db: wafrn) `docker compose up -d`
7. Check that you can connect to the database in your browser in https://localhost:8080 . If you have problem here, contact the dev team
8. Edit the environment file. Replace adminEmail and adminUser with your desired email, user and password. Use this file as a template, check for the EDIT HERE comments:

```import { Environment } from './interfaces/environment.js'

export const baseEnvironment: Environment = {
  prod: false,
  // this makes the logs really heavy, but might be useful for queries
  logSQLQueries: true,
  workers: {
    // if you set this to true, workers will start in the main thread. no need for starting the utils/workers.ts in other tmux tab
    mainThread: true,
    low: 5,
    medium: 10,
    high: 100
  },
  // this was a dev thing. leave to true unless you are doing stuff in local or your media url is yourinstance/uploads (not recomended)
  removeFolderNameFromFileUploads: true,
  // we use now postgresql.
  databaseConnectionString: 'postgresql://root:root@localhost:5432/wafrn',
  // PROD
  // databaseConnectionString: 'postgresql://wafrn:Skied-Obscurity6-Tightwad@localhost:1111/wafrn',

  listenIp: '0.0.0.0',
  port: 3002,
  // In the case of you wantint to put fedi petitions in another thread, use a different port here. You will have to update your apache config
  fediPort: 3002,
  // If you want to run the cache routes in another port, same thing!
  cachePort: 3002,
  saltRounds: 14,
  // for jwt secret you should use something like https://www.grc.com/passwords.htm please this is SUPER DUPER SECRET.
  jwtSecret: Buffer.from('secret', 'base64'),
  // https://app.wafrn.net
  // EDIT HERE if you are gona do fedi stuff like ssh -R 192.168.100.100:3002:localhost:3002 192.168.100.100
  frontendUrl: 'https://instance3.dev.wafrn.net',
  // app.wafrn.net
  // EDIT HERE (optional)
  instanceUrl: 'instance3.dev.wafrn.net',
  // https://media.wafrn.net
  mediaUrl: 'https://local.dev.wafrn.net/api/uploads',
  // You should run also this project github.com/gabboman/fediversemediacacher. In my case, https://cache.wafrn.net/?media= The cache is there because at some point in the past I configured it to precache images. No need for it to be honest
  externalCacheurl: 'https://local.dev.wafrn.net/api/cache?media=',
  // after the first run, create the admin user. and a deleted user. You will have to edit the user url in db so it starts with an @
  adminUser: 'admin',
  // admin email wich you will recive things like "someone registred and you need to review this"
  // EDIT HERE
  adminEmail: 'YOUREMAILGOESHERE',
  adminPassword: 'ADMINPASSWORD',
  // after creating the deleted_user we advice to also set the user to BANNED
  deletedUser: '@DELETEDUSER',
  // in MB. Please make sure you have the same in the frontend
  uploadLimit: 250,
  // 20 is a good number. With the new query we could investigate a higher number but no need to do it
  postsPerPage: 20,
  // trace is extreme logging. debug is ok for now
  logLevel: 'debug',
  // There is a script that loads the file from this url and blocks the servers
  blocklistUrl: '',
  // In some cases we serve the frontend with the backend with a small preprocessing. We need the location of the frontend
  // EDIT HERE: put a location with a build of the frontend. or an index file. you may need this
  frontedLocation: '/Users/gabriel/workspace/wafrn/packages/frontend/dist/wafrn/browser',
  // oh yes, you need TWO redis connections, one for queues other for cache
  bullmqConnection: {
    host: 'localhost',
    port: 6379,
    db: 0
  },
  // second database used for cache
  redisioConnection: {
    host: 'localhost',
    port: 6379,
    db: 1
  },
  // this will create a backendlog.log file on the folder superior to this one.
  pinoTransportOptions: {
    targets: [
      {
        target: 'pino/file',
        level: 'trace',
        options: {
          destination: 1
        }
      }
    ]
  },
  // you can try with gmail but we actually use sendinblue for this. bear in mind that this might require some fiddling in your gmail account too
  // you might need to enable https://myaccount.google.com/lesssecureapps
  // https://miracleio.me/snippets/use-gmail-with-nodemailer/
  emailConfig: {
    host: 'mail.wafrn.net',
    port: 587,
    auth: {
      user: 'info@wafrn.net',
      pass: 'didYouThoughtIwouldLeaveThisOneHere?',
      from: 'info@wafrn.net'
    }
  },
  // you dont have an smtp server and you want to do a single user instance? set this to true!
  disableRequireSendEmail: true,
  // if someone is trying to scrap your place you can send a funny message in some petitions (attacks to the frontend)
  blockedIps: [] as string[],
  // do you want to manually review registrations or have them open? We advice to leave this one to true
  reviewRegistrations: true,
  // if the blocklist youre using turns out to be biased you can tell the script that loads the block host to do not block these hosts
  ignoreBlockHosts: [] as string[],
  // default SEO data that will be used when trying to load server data
  defaultSEOData: {
    title: 'localhost',
    description: 'localhost, a wafrn instance',
    img: 'https://localhost/assets/logo.png'
  },
  // EDIT HERE if you have a PDS that you want to connect
  enableBsky: false,
  bskyPds: 'at.app.wafrn.net',
  bskyPdsJwtSecret: 'SECRET1',
  bskyPdsAdminPassword: 'SECRET2',
  // to generate these keys use the following command: `npx web-push generate-vapid-keys`.
  webpushPrivateKey: 'CDUUngHrbAUOBg_1-jXZJFj3IOGMTAbR5zhJupKzMOE', // dont worry these ones are local
  webpushPublicKey: 'BIWrO9knKAnPj2TFfU7pIxo0QkO_b2-PZCqYwAPArJdHTQ3Xsvf-E_WXaKGFB531fBOxCE92SZ6R_vHTVM1yTNw',
  // this is a email that will be sent to the distribution services in the users devices in case the owner of the distribution service wants to contact the server that is sending the notifications
  webpushEmail: 'mailto:info@wafrn.net',
  frontendEnvironment: {
    logo: '/assets/logo.png',
    frontUrl: 'http://localhost:4200',
    baseUrl: 'http://localhost:4200/api',
    baseMediaUrl: '/api/uploads',
    externalCacheurl: '/api/cache?media=',
    shortenPosts: 3,
    disablePWA: false,
    maintenance: false
  }
}
```

9. Do this command to initialize the database `cd packages/backend && npm run db:migrate`
10. On the root directory, do this command to start the backend server: `npm run backend:develop`
11. Do this command to start the frontend `npm run frontend:develop:prod`
12. Enjoy!

### Fullstack development with fedi and bluesky access and debugger access

This part of the guide needs to be written properly, BUTT, the QUICK AND DIRTY explanation for this is:

Execute the steps of "Fullstack development with debugger"

You will require a VPS with caddy and a bluesky PDS and a domain

Update the config on environment.ts:
You will need to update: frontendUrl, instanceUrl, mediaUrl, externalCacheurl, email things too probably (optional), and if you want buesky too: enableBsky, bskyPds, bskyPdsJwtSecret, bskyPdsAdminPassword

Once you do that and have stuff runing, to listen to the bluesky pds you will also need to start the atproto listener

`npm run backend:atproto`

Regarding fedi, you will need to create a reverse proxy with the url of the instance pointing to your machine. What I do is that i use the vps as a jump like this:

`ssh  -R 3002:localhost:3002 USER@YOURVPS`

This will "mirror" your port 3002 to the internal port 3002 of your vps. You can reverse proxy that one.
