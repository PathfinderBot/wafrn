import { Op } from 'sequelize'
import { Follows, UserOptions } from '../models/index.js'

export type NotificationType =
  | 'FOLLOW'
  | 'LIKE'
  | 'REWOOT'
  | 'MENTION'
  | 'QUOTE'
  | 'EMOJIREACT'
  | 'USERBITE'
  | 'POSTBITE'
  | 'ASK'

const NOTIFICATION_OPTION_NAMES = [
  'wafrn.notificationsFrom',
  'wafrn.notifyMentions',
  'wafrn.notifyReactions',
  'wafrn.notifyQuotes',
  'wafrn.notifyFollows',
  'wafrn.notifyRewoots',
  'wafrn.notifyBites',
  'wafrn.notifyAsks'
]

// notificationTypes: which notification types the user wants to be notified about at all.
// validUserIds: null means "no restriction"; otherwise only notifications whose origin user is in this list count.
async function getUserNotificationPreferences(
  userId: string
): Promise<{ notificationTypes: NotificationType[]; validUserIds: string[] | null }> {
  const options = await UserOptions.findAll({
    where: {
      userId: userId,
      optionName: {
        [Op.in]: NOTIFICATION_OPTION_NAMES
      }
    }
  })
  const getOption = (name: string) => options.find((elem) => elem.optionName == name)

  const notificationTypes: NotificationType[] = []
  const optionNotifyQuotes = getOption('wafrn.notifyQuotes')
  if (!optionNotifyQuotes || optionNotifyQuotes.optionValue != 'false') {
    notificationTypes.push('QUOTE')
  }
  const optionNotifyMentions = getOption('wafrn.notifyMentions')
  if (!optionNotifyMentions || optionNotifyMentions.optionValue != 'false') {
    notificationTypes.push('MENTION')
  }
  const optionNotifyReactions = getOption('wafrn.notifyReactions')
  if (!optionNotifyReactions || optionNotifyReactions.optionValue != 'false') {
    notificationTypes.push('EMOJIREACT')
    notificationTypes.push('LIKE')
  }
  const optionNotifyFollows = getOption('wafrn.notifyFollows')
  if (!optionNotifyFollows || optionNotifyFollows.optionValue != 'false') {
    notificationTypes.push('FOLLOW')
  }
  const optionNotifyRewoots = getOption('wafrn.notifyRewoots')
  if (!optionNotifyRewoots || optionNotifyRewoots.optionValue != 'false') {
    notificationTypes.push('REWOOT')
  }
  const optionNotifyBites = getOption('wafrn.notifyBites')
  if (!optionNotifyBites || optionNotifyBites.optionValue != 'false') {
    notificationTypes.push('POSTBITE')
    notificationTypes.push('USERBITE')
  }
  const optionNotifyAsks = getOption('wafrn.notifyAsks')
  if (!optionNotifyAsks || optionNotifyAsks.optionValue != 'false') {
    notificationTypes.push('ASK')
  }

  let validUserIds: string[] | null = null
  const optionNotificationsFrom = getOption('wafrn.notificationsFrom')
  if (optionNotificationsFrom && optionNotificationsFrom.optionValue != '1') {
    const followerIds = (
      await Follows.findAll({
        where: {
          accepted: true,
          followedId: userId
        }
      })
    ).map((elem) => elem.followerId)
    const followeeIds = (
      await Follows.findAll({
        where: {
          accepted: true,
          followerId: userId
        }
      })
    ).map((elem) => elem.followedId)

    switch (optionNotificationsFrom.optionValue) {
      case '2': // followers
        validUserIds = followerIds
        break
      case '3': // followees
        validUserIds = followeeIds
        break
      case '4': // mutuals
        validUserIds = followeeIds.filter((id) => followerIds.includes(id))
        break
      default:
        validUserIds = []
    }
  }

  return { notificationTypes, validUserIds }
}

async function getNotificationOptions(userId: string) {
  const { notificationTypes, validUserIds } = await getUserNotificationPreferences(userId)
  return {
    notificationType: {
      [Op.in]: notificationTypes
    },
    ...(validUserIds !== null
      ? {
          userId: {
            [Op.in]: validUserIds
          }
        }
      : {})
  }
}

export { getNotificationOptions, getUserNotificationPreferences }
