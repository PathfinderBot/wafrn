import { Op } from 'sequelize'
import { Follows, UserOptions } from '../models/index.js'

async function getNotificationOptions(userId: string) {
  const options = await UserOptions.findAll({
    where: {
      userId: userId,
      optionName: {
        [Op.in]: [
          'wafrn.notificationsFrom',
          'wafrn.notifyMentions',
          'wafrn.notifyReactions',
          'wafrn.notifyQuotes',
          'wafrn.notifyFollows',
          'wafrn.notifyRewoots',
          'wafrn.notifyBites'
        ]
      }
    }
  })
  const optionNotificationsFrom = options.find((elem) => elem.optionName == 'wafrn.notificationsFrom')
  const optionNotifyQuotes = options.find((elem) => elem.optionName == 'wafrn.notifyQuotes')
  const optionNotifyMentions = options.find((elem) => elem.optionName == 'wafrn.notifyMentions')
  const optionNotifyReactions = options.find((elem) => elem.optionName == 'wafrn.notifyReactions')
  const optionNotifyFollows = options.find((elem) => elem.optionName == 'wafrn.notifyFollows')
  const optionNotifyRewoots = options.find((elem) => elem.optionName == 'wafrn.notifyRewoots')
  const optionNotifyBites = options.find((elem) => elem.optionName == 'wafrn.notifyBites')

  const notificationTypes = []
  if (!optionNotifyQuotes || optionNotifyQuotes.optionValue != 'false') {
    notificationTypes.push('QUOTE')
  }
  if (!optionNotifyMentions || optionNotifyMentions.optionValue != 'false') {
    notificationTypes.push('MENTION')
  }
  if (!optionNotifyReactions || optionNotifyReactions.optionValue != 'false') {
    notificationTypes.push('EMOJIREACT')
    notificationTypes.push('LIKE')
  }
  if (!optionNotifyFollows || optionNotifyFollows.optionValue != 'false') {
    notificationTypes.push('FOLLOW')
  }
  if (!optionNotifyRewoots || optionNotifyRewoots.optionValue != 'false') {
    notificationTypes.push('REWOOT')
  }
  if (!optionNotifyBites || optionNotifyBites.optionValue != 'false') {
    notificationTypes.push('POSTBITE')
    notificationTypes.push('USERBITE')
  }

  let res: any = {
    notificationType: {
      [Op.in]: notificationTypes
    }
  }

  if (optionNotificationsFrom && optionNotificationsFrom.optionValue != '1') {
    let validUsers: string[] = []
    switch (optionNotificationsFrom.optionValue) {
      case '2': // followers
        validUsers = (
          await Follows.findAll({
            where: {
              accepted: true,
              followedId: userId
            }
          })
        ).map((elem) => elem.followerId)
      case '3': // followees
        validUsers = (
          await Follows.findAll({
            where: {
              accepted: true,
              followerId: userId
            }
          })
        ).map((elem) => elem.followedId)
      case '4': // mutuals
        const followerIds = (
          await Follows.findAll({
            where: {
              accepted: true,
              followedId: userId
            }
          })
        ).map((elem) => elem.followerId)
        validUsers = (
          await Follows.findAll({
            where: {
              accepted: true,
              followerId: userId,
              followedId: {
                [Op.in]: followerIds
              }
            }
          })
        ).map((elem) => elem.followedId)
    }
    res = {
      ...res,
      userId: {
        [Op.in]: validUsers
      }
    }
  }
  return res
}

export { getNotificationOptions }
