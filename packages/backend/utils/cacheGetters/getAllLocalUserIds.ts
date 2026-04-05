import { Op } from 'sequelize'
import { User, sequelize } from '../../models/index.js'
import { redisCache } from '../redis.js'

const localUsersSet = new Set<string>()


async function getAllLocalUserIds(): Promise<string[]> {
  let res: string[] = []
  const cacheResult = await redisCache.get('allLocalUserIds')
  if (cacheResult) {
    res = JSON.parse(cacheResult)
  } else {
    const localUsers = await User.scope('full').findAll({
      attributes: ['id'],
      where: {
        email: {
          [Op.ne]: null
        },
        banned: false,
        activated: true
      }
    })
    if (localUsers) {
      res = localUsers.map((elem: User) => elem.id)
      res.forEach(element => {
        localUsersSet.add(element)
      });
      await redisCache.set('allLocalUserIds', JSON.stringify(res), 'EX', 60)
    }
  }
  return res
}
async function getAllLocalUserIdsSet(): Promise<Set<string>> {
  const ids = await getAllLocalUserIds();
  ids.forEach(elem => localUsersSet.add(elem)) 
  return localUsersSet;
}

export { getAllLocalUserIds, getAllLocalUserIdsSet }
