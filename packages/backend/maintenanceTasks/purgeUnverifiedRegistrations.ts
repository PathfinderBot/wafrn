import { Op } from 'sequelize'
import { Follows, User, UserOptions } from '../models/index.js'
import { logger } from '../utils/logger.js'

// queersky fork: registrations that never verify their email are invisible to
// the admin approval queue, but they still reserve their username (the
// duplicate-registration check matches on the users table). Left alone, an
// unverified squatter can hold a name forever. This task reaps those accounts
// after a grace period, freeing the name and the email for reuse.
//
// Deliberately does NOT touch banned accounts: bans on unverified accounts are
// kept as a spam record (registerIp etc.). Verified accounts are also left
// alone — they appear in the approval queue and it's the admin's call.

const GRACE_PERIOD_DAYS = 7

async function purgeUnverifiedRegistrations() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - GRACE_PERIOD_DAYS)
  const staleUsers = await User.findAll({
    attributes: ['id', 'url', 'email', 'createdAt'],
    where: {
      url: { [Op.notLike]: '%@%' }, // local users only
      activated: { [Op.ne]: true },
      emailVerified: { [Op.ne]: true },
      banned: false,
      createdAt: { [Op.lt]: cutoff }
    }
  })
  if (staleUsers.length === 0) {
    logger.debug(`purgeUnverifiedRegistrations: nothing to purge`)
    return
  }
  logger.info(`purgeUnverifiedRegistrations: reaping ${staleUsers.length} unverified registration(s) older than ${GRACE_PERIOD_DAYS} days`)
  for (const user of staleUsers) {
    try {
      logger.info({
        message: `purgeUnverifiedRegistrations: deleting unverified account`,
        url: user.url,
        createdAt: user.createdAt
      })
      // unverified accounts can only have a handful of relations (created at
      // registration): the auto-follow of an admin and their user options.
      await Follows.destroy({ where: { followerId: user.id } })
      await UserOptions.destroy({ where: { userId: user.id } })
      await user.destroy()
    } catch (error) {
      logger.error({
        message: `purgeUnverifiedRegistrations: failed to delete account, skipping`,
        url: user.url,
        error
      })
    }
  }
}

export { purgeUnverifiedRegistrations }
