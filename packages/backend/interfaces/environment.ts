export interface Environment {
  prod: boolean
  logSQLQueries: boolean
  workers: {
    mainThread: boolean
    low: number
    medium: number
    high: number
    mediaOptimize: number
  }
  trustProxy: number,
  removeFolderNameFromFileUploads: boolean
  databaseConnectionString: string
  listenIp: string
  port: number
  fediPort: number
  cachePort: number
  saltRounds: number
  jwtSecret: Buffer
  frontendUrl: string
  instanceUrl: string
  mediaUrl: string
  externalCacheurl: string
  adminUser: string
  adminEmail: string
  adminPassword: string
  deletedUser: string
  uploadLimit: number
  postsPerPage: number
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | string
  blocklistUrl: string
  frontedLocation: string,
  bullmqConnection: {
    host: string
    port: number
    db: number
  }
  redisioConnection: {
    host: string
    port: number
    db: number
  }
  pinoTransportOptions: {
    targets: {
      target: string
      level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | string
      options: {
        destination: number | string
      }
    }[]
  }
  emailConfig: {
    host: string
    port: number
    auth: {
      user: string
      pass: string
      from: string
    }
    tls?: {
      rejectUnauthorized: boolean
    }
  }
  disableRequireSendEmail: boolean
  blockedIps: string[]
  reviewRegistrations: boolean
  ignoreBlockHosts: string[]
  defaultSEOData: {
    title: string
    description: string
    img: string
  }
  enableBsky: boolean
  bskyPds: string
  bskyPdsUrl?: string
  bskyPdsJwtSecret?: string
  bskyPdsAdminPassword?: string
  bskyMasterInviteCode?: string
  bskyConstellationUrl: string
  bskySlingshotUrl: string
  bskyJetstreamUrl: string
  webpushPrivateKey: string
  webpushPublicKey: string
  webpushEmail: string
  autoFollowAdmin: boolean
  registrationLevel: 'PRIVATE' | 'INVITE' | 'PUBLIC'
  bubbleHostsShowType: 'HIDDEN' | 'LOGGEDIN' | 'PUBLIC'
  blockedHostsShowType: 'HIDDEN' | 'LOGGEDIN' | 'PUBLIC'
  minimumAgeToRegister: number
  disableShowingBlockedServers: boolean
  donationUrl?: string
  bskyRotationKeyK256: string
  frontendEnvironment: any
}
