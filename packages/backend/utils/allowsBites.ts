import { Follows } from '../models/follows.js'
import { getUserOptions } from './cacheGetters/getUserOptions.js'

// 1 = everyone (default), 2 = people who follow the bitten user, 3 = people the bitten user follows
// value can be a comma-separated combination of modes (e.g. remote actors advertising both
// their following and followers collections via mia:canBite), treated as an OR of each mode
async function userAllowsBiteFrom(bittenId: string, biterId: string | undefined): Promise<boolean> {
  const options = await getUserOptions(bittenId)
  const option = options.find((elem) => elem.optionName === 'wafrn.public.allowBitesFrom')
  const modes = (option?.optionValue || '1').split(',')

  if (modes.includes('1')) return true
  if (!biterId || biterId === bittenId) return false

  if (
    modes.includes('2') &&
    (await Follows.findOne({
      where: { followerId: biterId, followedId: bittenId, accepted: true }
    }))
  ) {
    return true
  }

  if (
    modes.includes('3') &&
    (await Follows.findOne({
      where: { followerId: bittenId, followedId: biterId, accepted: true }
    }))
  ) {
    return true
  }

  return false
}

export { userAllowsBiteFrom }
