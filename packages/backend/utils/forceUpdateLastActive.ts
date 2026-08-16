import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { Op } from 'sequelize'
import { completeEnvironment } from './backendOptions.js'
import AuthorizedRequest from '../interfaces/authorizedRequest.js'
import { User } from '../models/index.js'

const LAST_ACTIVE_UPDATE_THRESHOLD_MS = 60 * 60 * 1000

function forceUpdateLastActive(req: AuthorizedRequest, res: Response, next: NextFunction) {
  const userId = req.jwtData?.userId
  if (userId) {
    User.update(
      { lastActiveAt: new Date() },
      {
        where: {
          id: userId,
          lastActiveAt: {
            [Op.lt]: new Date(Date.now() - LAST_ACTIVE_UPDATE_THRESHOLD_MS)
          }
        }
      }
    )
    next()
  } else {
    res.sendStatus(401)
  }
}

export { forceUpdateLastActive }
