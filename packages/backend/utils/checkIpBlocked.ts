import { Request, Response, NextFunction } from 'express'
import { completeEnvironment } from './backendOptions.js'
import getIp from './getIP.js'
import { redisCache } from './redis.js'

export default async function checkIpBlocked(req: Request, res: Response, next: NextFunction) {
  const petitionIp = getIp(req)
  if (await redisCache.sismember('blockedIps', petitionIp)) {
    res.status(401),
      res.send({
        message: 'Your ip is banned',
        have_a_good_day: true
      })
  } else {
    next()
  }
}
