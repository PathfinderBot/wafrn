import { Op } from 'sequelize'
import { User } from '../../models/index.js'
import { wait } from '../wait.js'
import { logger } from '../logger.js'
import { syncBskyAccountData } from '../atproto/syncBskyAccountData.js'

console.log(`---Initiating full sync of follows with bluesky---`)
const users = await User.findAll({
  where: {
    email: {
      [Op.ne]: null
    },
    enableBsky: true
  },
  order: [['createdAt', 'DESC']]
})

for await (const user of users) {
  console.log(`Syncing ${user.url}`)
  try {
    await syncBskyAccountData(user.id, {syncPosts: true, syncFollows: true})
  } catch (error) {
    logger.warn(error)
  }
  // await wait(500)
}
