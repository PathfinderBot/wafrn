import express from 'express'
import { logger } from './utils/logger.js'
import expressWs from 'express-ws'
import websocketRoutes from './routes/websocket.js'
import { completeEnvironment } from './utils/backendOptions.js'
import cron from 'node-cron'
import { nukeBannedUsers } from './maintenanceTasks/nukeBannedUsers.js'
import { blockHosts } from './updateDatabase/blockHosts.js'
import { sequelize } from './models/sequelize.js'
import { Op, QueryTypes } from 'sequelize'
import { Post, User } from './models/index.js'
import { follow } from './services/follow.js'
import { getAdminUser } from './utils/getAdminAndDeletedUser.js'
import { redisCache } from './utils/redis.js'
import { BlockedIps } from './models/blockedIp.js'
import { wait } from './utils/wait.js'
import { promisify } from 'util'
import { exec } from 'child_process'

const PORT = completeEnvironment.port
const app = express()
const wsServer = expressWs(app)
const server = wsServer.app
websocketRoutes(server)

await redisCache.del('blockedIps')
const blockedIps = await BlockedIps.findAll()
if (blockedIps.length) {
  await redisCache.sadd(
    'blockedIps',
    blockedIps.map((elem) => elem.ip)
  )
}

cron.schedule('0 */2 * * *', async () => {
  // maintenance tasks
  sequelize.query('VACUUM ANALYZE').then(() => {
    logger.info(`postgres vacuum analyze executed`)
  })
})

cron.schedule('0 2 * * *', async () => {
  // maintenance tasks nuking users
  nukeBannedUsers().then(() => {
    logger.info(`NukeBannedUsers Done`)
  })
})

if (!completeEnvironment.disableAutomaticBlocklistSync) {
  cron.schedule('0 3 * * *', async () => {
    // maintenance tasks: sync federated host blocklists
    blockHosts().then(() => {
      logger.info(`Blocklist sync done`)
    })
  })
}

cron.schedule('0 * * * *', async () => {
  // maintenance tasks: delete cache files older than 2 hours
  try {
    const execAsync = promisify(exec)
    await execAsync(`find cache -type f -mmin +120 -print0 | xargs -0rn 20 rm -f`)
    logger.info(`Old cache files cleaned up`)
  } catch (error) {
    logger.info({ message: `Error cleaning up old cache files`, error })
  }
})
server.listen(PORT, completeEnvironment.listenIp, () => {
  logger.info('started websocket')
})

const queryInterface = sequelize.getQueryInterface()

if (completeEnvironment.autoFollowAdmin) {
  try {
    const users = await User.findAll({
      where: {
        banned: {
          [Op.ne]: true
        },
        email: {
          [Op.ne]: null
        }
      }
    })
    const adminUser = await getAdminUser()
    await Promise.all(users.map((x) => follow(x.id, adminUser.id)))
  } catch {}
}
let postIndexes = await queryInterface.showIndex('posts')

if (!(postIndexes as Array<any>).some((index) => index.name === 'post_bsky_uri')) {
  logger.warn(
    `ATTENTION: your server doesnt seem to have an unique index on bskyuri. this is a bug. we will investigate soon in a future release`
  )
  clearDuplicatedBskyUris().then(async (res) => {
    //  well turns out that we dont have indexes
    // we have cleaned duplicated before. if a duplicate apears here we just crash and do it again :3
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS post_bsky_uri  ON "posts" ("bskyUri");`
    )
  })
}

async function clearDuplicatedBskyUris(): Promise<boolean> {
  let duplicatedURIs: any = await queryInterface.sequelize.query(
    `UPDATE "posts" SET "bskyUri"= NULL WHERE "bskyUri" IN (SELECT "bskyUri" FROM (SELECT "bskyUri", COUNT(*)
FROM "posts" WHERE "bskyUri" IS NOT NULL
GROUP BY "bskyUri"
HAVING COUNT(*) > 1))`
  )
  return true
}
