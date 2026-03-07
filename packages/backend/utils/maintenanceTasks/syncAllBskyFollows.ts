import { Op } from 'sequelize'
import { User } from '../../models/index.js'
import { syncBskyFollowersAndFollowing } from '../atproto/syncBskyFollowersAndFollowing.js'
import { wait } from '../wait.js'
import { logger } from '../logger.js'

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
    await syncBskyFollowersAndFollowing(user.id, false)
  } catch (error) {
    logger.warn(error)
  }
  // await wait(500)
}
