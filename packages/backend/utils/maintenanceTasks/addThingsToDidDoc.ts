import { Op } from 'sequelize'
import { getAllLocalUserIds } from '../cacheGetters/getAllLocalUserIds.js'
import { Post, User } from '../../models/index.js'
import { updateUserDidDoc } from '../atproto/updateUserDidDoc.js'
import { wait } from '../wait.js'

const localUserIds = await getAllLocalUserIds()

const localUsers = await User.scope('full').findAll({
  where: {
    id: {
      [Op.in]: localUserIds
    },
    enableBsky: true,
    bskyDid: {
      [Op.ne]: null
    }
  }
})

for await (const user of localUsers) {
  await updateUserDidDoc(user)
  // await wait(10000)
}
