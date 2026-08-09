import { UserOptions } from '../../models/index.js'
import { redisCache } from '../redis.js'

async function getUserOptions(userId: string): Promise<Array<{ optionName: string; optionValue: string }>> {
  const dbReply = await UserOptions.findAll({
    where: {
      userId: userId
    }
  })
  return dbReply.map((elem: any) => elem.dataValues)
}

export { getUserOptions }
