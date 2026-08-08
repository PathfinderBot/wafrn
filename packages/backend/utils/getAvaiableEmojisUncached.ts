import { Emoji } from '../models/index.js'

async function getAvaiableEmojisUncached(): Promise<any[]> {
  return await Emoji.findAll({
    where: {
      external: false
    }
  })
}

export { getAvaiableEmojisUncached }
