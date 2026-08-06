import { Op } from 'sequelize'
import { Emoji, UserEmojiRelation } from '../../models/index.js'
import { redisCache } from '../redis.js'

async function getUserEmojis(id: string) {
    const emojiIds = await UserEmojiRelation.findAll({
      where: {
        userId: id
      }
    })
    const emojis = await Emoji.findAll({
      where: {
        id: {
          [Op.in]: emojiIds.map((elem: any) => elem.emojiId)
        }
      }
    })
    return emojis.map((elem: any) => elem.dataValues)
}

export { getUserEmojis }
