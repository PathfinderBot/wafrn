import process from 'node:process'
import { Environment } from './interfaces/environment.js'
import { Buffer } from 'node:buffer'

export const baseEnvironment: Environment = {
  prod: true,
  // this makes the logs really heavy, but might be useful for queries
  logSQLQueries: process.env.LOG_SQL_QUERIES ? process.env.LOG_SQL_QUERIES == 'true' : false,
  workers: {
    // if you set this to true, workers will start in the main thread. no need for starting the utils/workers.ts in other tmux tab
    mainThread: process.env.USE_WORKERS ? process.env.USE_WORKERS == 'true' : true,
    low: parseInt(process.env.WORKERS_LOW || '5'),
    medium: parseInt(process.env.WORKERS_MEDIUM || '10'),
    high: parseInt(process.env.WORKERS_HIGH || '30'),
    mediaOptimize: 2
  },
  // this was a dev thing. leave to true unless you are doing stuff in local or your media url is yourinstance/uploads (not recomended)
  removeFolderNameFromFileUploads: true,
  // we use now postgresql.
  databaseConnectionString: `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DBNAME}`,
  listenIp: process.env.LISTEN_IP || '0.0.0.0',
  port: parseInt(process.env.PORT || '9000'),
  // In the case of you wantint to put fedi petitions in another thread, use a different port here. You will have to update your apache config
  fediPort: parseInt(process.env.PORT || '9000'),
  // If you want to run the cache routes in another port, same thing!
  cachePort: parseInt(process.env.PORT || '9000'),

  saltRounds: 14,
  // for jwt secret you should use something like https://www.grc.com/passwords.htm please this is SUPER DUPER SECRET.
  jwtSecret: Buffer.from(process.env.JWT_SECRET || '', 'base64'),
  // https://app.wafrn.net
  frontendUrl: `https://${process.env.DOMAIN_NAME}`,
  // app.wafrn.net
  instanceUrl: process.env.DOMAIN_NAME!, // TODO: error if env var not defined, use some npm module for that like 'tiny-invariant'
  // https://media.wafrn.net
  mediaUrl: process.env.FRONTEND_MEDIA_URL!, // TODO: error if env var not defined
  // You should run also this project github.com/gabboman/fediversemediacacher. In my case, https://cache.wafrn.net/?media= The cache is there because at some point in the past I configured it to precache images. No need for it to be honest
  externalCacheurl: process.env.FRONTEND_CACHE_URL!, // TODO: error if env var not defined
  // after the first run, create the admin user. and a deleted user. You will have to edit the user url in db so it starts with an @
  adminUser: process.env.ADMIN_USER || '',
  // admin email wich you will recive things like "someone registred and you need to review this"
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  // after creating the deleted_user we advice to also set the user to BANNED
  deletedUser: '@DELETEDUSER',
  // in MB. Please make sure you have the same in the frontend
  uploadLimit: parseInt(process.env.UPLOAD_LIMIT || '250'),
  // 20 is a good number. With the new query we could investigate a higher number but no need to do it
  postsPerPage: parseInt(process.env.POSTS_PER_PAGE || '20'),
  // trace is extreme logging. debug is ok for now
  logLevel: process.env.LOG_LEVEL || 'debug',
  // There is a script that loads the file from this url and blocks the servers
  blocklistUrl: process.env.BLOCKLIST_URI || '',
  // In some cases we serve the frontend with the backend with a small preprocessing. We need the location of the frontend
  frontedLocation: process.env.FRONTEND_PATH || '/app/packages/frontend',
  // oh yes, you need TWO redis connections, one for queues other for cache
  bullmqConnection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    db: 0
  },
  // second database used for cache
  redisioConnection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    db: 1
  },
  // this will create a backendlog.log file on the folder superior to this one.
  pinoTransportOptions: {
    targets: [
      {
        target: 'pino/file',
        level: 'debug',
        options: {
          destination: 1 // set to 1 to log to stdout
        }
      }
    ]
  },
  // you can try with gmail but we actually use sendinblue for this. bear in mind that this might require some fiddling in your gmail account too
  // you might need to enable https://myaccount.google.com/lesssecureapps
  // https://miracleio.me/snippets/use-gmail-with-nodemailer/
  emailConfig: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASSWORD || '',
      from: process.env.SMTP_FROM || ''
    }
  },
  // This one is for wafrn behind TWO caddys
  trustProxy: process.env.HTTPS_PORT ? 2 : 1,
  // you dont have an smtp server and you want to do a single user instance? set this to true!
  disableRequireSendEmail: process.env.DISABLE_REQUIRE_SEND_EMAIL == 'true',
  // if someone is trying to scrap your place you can send a funny message in some petitions (attacks to the frontend)
  blockedIps: process.env.BLOCKED_IPS ? process.env.BLOCKED_IPS.split(',') : [],
  // do you want to manually review registrations or have them open? We advice to leave this one to true
  reviewRegistrations: process.env.REVIEW_REGISTRATIONS ? process.env.REVIEW_REGISTRATIONS == 'true' : true,
  // if the blocklist youre using turns out to be biased you can tell the script that loads the block host to do not block these hosts
  ignoreBlockHosts: process.env.IGNORE_BLOCK_HOSTS ? process.env.IGNORE_BLOCK_HOSTS.split(',') : [],
  // default SEO data that will be used when trying to load server data
  defaultSEOData: {
    title: process.env.FRONTEND_SHORT_TITLE || 'Wafrn, the social media that respects you',
    description:
      process.env.FRONTEND_DESCRIPTION ||
      'Wafrn is a federated social media inspired by tumblr that connects with the fediverse and bluesky',
    img: `https://${process.env.DOMAIN_NAME}/assets/logo.png`
  },
  enableBsky: process.env.ENABLE_BSKY == 'true',
  bskyPds: process.env.PDS_DOMAIN_NAME || '',
  bskyPdsJwtSecret: process.env.PDS_JWT_SECRET,
  bskyPdsAdminPassword: process.env.PDS_ADMIN_PASSWORD,
  bskySlingshotUrl: process.env.SLINGSHOT_URL || 'https://slingshot.microcosm.blue',
  bskyJetstreamUrl: process.env.JETSTREAM_URL || 'wss://jetstream1.eurosky.network/subscribe',
  bskyConstellationUrl: process.env.CONSTELLATION_URL || 'https://constellation.microcosm.blue',
  // to generate these keys use the following command: `npx web-push generate-vapid-keys`. Remember to do the environment one too!!
  webpushPrivateKey: process.env.WEBPUSH_PRIVATE || '',
  webpushPublicKey: process.env.WEBPUSH_PUBLIC || '',
  // this is a email that will be sent to the distribution services in the users devices in case the owner of the distribution service wants to contact the server that is sending the notifications
  webpushEmail: process.env.WEBPUSH_EMAIL || '',
  autoFollowAdmin: process.env.AUTOFOLLOW_MAIN_ADMIN ? process.env.AUTOFOLLOW_MAIN_ADMIN == 'true' : true,
  minimumAgeToRegister: parseInt(process.env.REGISTRATION_MINIMUM_AGE || '18'),
  registrationLevel: (process.env.REGISTRATION_LEVEL || 'PUBLIC') as 'PRIVATE' | 'INVITE' | 'PUBLIC',
  disableShowingBlockedServers: process.env.HIDE_BLOCKED_SERVERS == 'true',
  bubbleHostsShowType: (process.env.BUBBLE_SERVERS_SHOW_TYPE || 'PUBLIC') as 'PUBLIC' | 'HIDDEN' | 'LOGGEDIN',
  blockedHostsShowType: (process.env.BLOCKED_SERVERS_SHOW_TYPE || 'LOGGEDIN') as 'PUBLIC' | 'HIDDEN' | 'LOGGEDIN',
  donationUrl: process.env.DONATION_URL || '',
  bskyRotationKeyK256: process.env.PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX || '',
  frontendEnvironment: {
    logo: process.env.FRONTEND_LOGO || '/assets/logo.png',
    frontUrl: process.env.FRONTEND_FQDN_URL || '',
    baseUrl: process.env.FRONTEND_API_URL || '/api',
    baseMediaUrl: process.env.FRONTEND_MEDIA_URL || '',
    externalCacheurl: process.env.FRONTEND_CACHE_URL || '',
    shortenPosts: parseInt(process.env.FRONTEND_SHORTEN_POSTS || '3'),
    disablePWA: process.env.FRONTEND_DISABLE_PWA == 'true',
    maintenance: process.env.FRONTEND_MAINTENANCE == 'true',
    enableRawOutput: process.env.ENABLE_RAW_OUTPUT == 'true',
    privateInstanceRegistrationText:
      process.env.REGISTRATIONS_DISABLED_TEXT ||
      'This instance is a private instance, and does not allow registrations',
    minimumAgeToRegister: parseInt(process.env.REGISTRATION_MINIMUM_AGE || '18'),
    donationUrl: process.env.DONATION_URL || '',
    disableShowingBlockedServers: process.env.HIDE_BLOCKED_SERVERS == 'true',
    bubbleHostsShowType: process.env.BUBBLE_SERVERS_SHOW_TYPE || 'PUBLIC',
    blockedHostsShowType: process.env.BLOCKED_SERVERS_SHOW_TYPE || 'LOGGEDIN'
  }
}
