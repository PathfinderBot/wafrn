import { Expo } from 'expo-server-sdk'
import { Notification, PushNotificationToken, User } from '../models/index.js'
import { logger } from '../utils/logger.js'
import {
  getNotificationBody,
  getNotificationTitle,
  handleDeliveryError,
  type NotificationBody,
  type NotificationContext
} from '../services/pushNotifications.js'
import { Job } from 'bullmq'
import { Op } from 'sequelize'
import { getMutedPosts } from '../utils/cacheGetters/getMutedPosts.js'
import { sendWebPushNotifications } from '../services/webpush.js'
import getBlockedIds from '../utils/cacheGetters/getBlockedIds.js'
import getUserBlockedServers from '../utils/cacheGetters/getUserBlockedServers.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { getQueue } from '../utils/queues.js'
import { getUserNotificationPreferences } from '../services/notificationOptions.js'

const deliveryCheckQueue = getQueue('checkPushNotificationDelivery')
const websocketQueue = getQueue('updateNotificationsSocket')

const expoClient = new Expo()

type PushNotificationPayload = {
  notifications: NotificationBody[]
  context?: NotificationContext
}

export async function sendPushNotification(job: Job<PushNotificationPayload>) {
  const { notifications, context } = job.data
  let notificationsToSend: NotificationBody[] = []
  const originUsers = await User.findAll({
    attributes: ['id', 'federatedHostId', 'banned'],
    where: {
      id: { [Op.in]: [...new Set(notifications.map((n) => n.userId))] }
    }
  })
  const bannedOriginUserIds = new Set(originUsers.filter((u) => u.banned).map((u) => u.id))
  const originUserFederatedHostMap = new Map(originUsers.map((u) => [u.id, u.federatedHostId]))
  for await (const notification of notifications) {
    if (notification.notificationType === 'REPORT') {
      notificationsToSend.push(notification)
      continue
    }
    const mutedPosts = new Set(
      (await getMutedPosts(notification.notifiedUserId, false)).concat(
        await getMutedPosts(notification.notifiedUserId, true)
      )
    )
    if (!mutedPosts.has(notification.postId ? notification.postId : '')) {
      const blockedUsers = await getBlockedIds(notification.notifiedUserId) // do not push notification if muted user
      const blockedServers = await getUserBlockedServers(notification.notifiedUserId)
      const originUserFederatedHostId = originUserFederatedHostMap.get(notification.userId)
      if (
        notification.userId == notification.notifiedUserId ||
        blockedUsers.includes(notification.userId) ||
        bannedOriginUserIds.has(notification.userId) ||
        (originUserFederatedHostId && blockedServers.some((elem) => elem.blockedServerId === originUserFederatedHostId))
      ) {
        // this is from a blocked, banned or same user, or from a server the user blocked. do not notify
        continue
      }
      const { notificationTypes, validUserIds } = await getUserNotificationPreferences(notification.notifiedUserId)
      if (
        notificationTypes.includes(notification.notificationType) &&
        (validUserIds === null || validUserIds.includes(notification.userId))
      ) {
        notificationsToSend.push(notification)
      }
    }
  }

  const users = await User.findAll({
    attributes: ['id', 'url'],
    where: {
      id: {
        [Op.in]: notificationsToSend.map((n) => n.notifiedUserId)
      }
    }
  })

  const userUrlMap = Object.fromEntries(users.map((u) => [u.id, u.url]))
  for (const notif of notificationsToSend) {
    const url = userUrlMap[notif.notifiedUserId]
    if (url) {
      notif.notifiedUserUrl = url
    }
  }

  if (notificationsToSend.length > 0) {
    await sendWebPushNotifications(notificationsToSend, context)
    await sendExpoNotifications(notificationsToSend, context)
    await sendWsNotifications(notificationsToSend, context)
  }
}

export async function sendExpoNotifications(notifications: NotificationBody[], context?: NotificationContext) {
  const userIds = notifications.map((elem) => elem.notifiedUserId)
  const tokenRows = await PushNotificationToken.findAll({
    where: {
      userId: {
        [Op.in]: userIds
      }
    }
  })

  if (tokenRows.length === 0) {
    return
  }
  const payloads = notifications.map((notification) => {
    const tokens = tokenRows.filter((row) => row.userId === notification.notifiedUserId).map((row) => row.token)

    // send the same notification to all the devices of each notified user
    return {
      to: tokens,
      sound: 'default',
      title: getNotificationTitle(notification, context),
      body: getNotificationBody(notification, context),
      data: { notification, context }
    }
  })

  // this will chunk the payloads into chunks of 1000 (max) and compress notifications with similar content
  const okTickets = []
  const filteredPayloads: {
    to: any[]
    sound: string
    title: string
    body: string
    data: {
      notification: NotificationBody
      context: NotificationContext | undefined
    }
  }[] = []
  for await (const payload of payloads) {
    const mutedPosts = (await getMutedPosts(payload.data.notification.notifiedUserId, false)).concat(
      await getMutedPosts(payload.data.notification.notifiedUserId, true)
    )
    if (!mutedPosts.includes(payload.data.notification.postId as string)) {
      filteredPayloads.push(payload)
    }
  }
  const chunks = expoClient.chunkPushNotifications(filteredPayloads)
  for (const chunk of chunks) {
    const responses = await expoClient.sendPushNotificationsAsync(chunk)
    for (const response of responses) {
      if (response.status === 'ok') {
        okTickets.push(response.id)
      } else {
        await handleDeliveryError(response)
      }
    }
  }

  await scheduleNotificationCheck(okTickets)
}

// schedule a job to check the delivery of the notifications after 30 minutes of being sent
// this guarantees that the notification was delivered to the messaging services even in cases of high load
function scheduleNotificationCheck(ticketIds: string[]) {
  const delay = 1000 * 60 * 30 // 30 minutes
  return deliveryCheckQueue.add('checkPushNotificationDelivery', { ticketIds }, { delay })
}

async function sendWsNotifications(notifications: NotificationBody[], context?: NotificationContext) {
  await websocketQueue.addBulk(
    notifications.map((elem) => {
      // we just tell the user to update the notifications
      return {
        name: 'updateNotificationsSocket',
        data: {
          userId: elem.notifiedUserId,
          type: elem.notificationType,
          from: elem.userId,
          postId: elem.postId ? elem.postId : ''
        }
      }
    })
  )
}
