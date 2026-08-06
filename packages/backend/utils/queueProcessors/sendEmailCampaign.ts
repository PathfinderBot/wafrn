import { Job } from 'bullmq'
import { Op } from 'sequelize'
import escape from 'escape-html'
import { User } from '../../models/index.js'
import { completeEnvironment } from '../backendOptions.js'
import { logger } from '../logger.js'
import sendEmail from '../sendEmail.js'
import { getQueue } from '../queues.js'
import { wait } from '../wait.js'

export type SendEmailCampaignJobData = {
  subject: string
  body: string
  createdByUserId?: string
}

export type SendEmailCampaignUserJobData = {
  userId: string
  subject: string
  body: string
  createdByUserId?: string
}

function applyCampaignTemplate(template: string, user: User, unsubscribeUrl: string): string {
  return template
    .replaceAll('{{url}}', escape(user.url))
    .replaceAll('{{unsubscribeUrl}}', unsubscribeUrl)
    .replaceAll('{{frontendUrl}}', completeEnvironment.frontendUrl)
    .replaceAll('{{instanceUrl}}', completeEnvironment.instanceUrl)
}

export async function sendEmailCampaign(job: Job<SendEmailCampaignJobData>) {
  const users = await User.scope('full').findAll({
    attributes: ['id', 'url', 'email', 'activationCode'],
    where: {
      banned: { [Op.ne]: true },
      activated: true,
      disableEmailNotifications: { [Op.ne]: true },
      email: {
        [Op.ne]: null
      }
    },
    order: [['createdAt', 'ASC']]
  })

  const queue = getQueue<SendEmailCampaignUserJobData>('sendEmail')
  let queued = 0

  for (const user of users) {
    if (!user.email) {
      continue
    }

    await queue.add('sendEmail', {
      userId: user.id,
      subject: job.data.subject,
      body: job.data.body,
      createdByUserId: job.data.createdByUserId
    })

    queued++
    await job.updateProgress({
      queued,
      total: users.length
    })
  }

  logger.info({
    message: 'Email campaign queued',
    jobId: job.id,
    createdByUserId: job.data.createdByUserId,
    queued,
    total: users.length
  })

  return {
    queued,
    total: users.length
  }
}

export async function sendEmailCampaignUser(job: Job<SendEmailCampaignUserJobData>) {
  const user = await User.scope('full').findByPk(job.data.userId, {
    attributes: ['id', 'url', 'email', 'activationCode']
  })

  if (!user || !user.email) {
    logger.warn({
      message: 'Email campaign user job skipped because user is missing or has no email',
      jobId: job.id,
      userId: job.data.userId
    })
    return {
      skipped: true,
      userId: job.data.userId
    }
  }

  const unsubscribeUrl = `${completeEnvironment.frontendUrl}/api/disableEmailNotifications/${user.id}/${encodeURIComponent(user.activationCode)}`
  const subject = applyCampaignTemplate(job.data.subject, user, unsubscribeUrl)
  const body = `${applyCampaignTemplate(job.data.body, user, unsubscribeUrl)}
<br />
<p>If you no longer desire to get these emails, you can <a href="${unsubscribeUrl}">unsubscribe</a>.</p>`

  const result = await sendEmail({
    email: user.email,
    subject,
    body
  })

  if (!result) {
    logger.warn({
      message: 'Email campaign delivery failed for user',
      jobId: job.id,
      userId: user.id,
      email: user.email
    })
    throw new Error(`Failed to send campaign email to user ${user.id}`)
  }

  await wait(2500)

  logger.info({
    message: 'Email campaign delivered',
    jobId: job.id,
    userId: user.id,
    email: user.email
  })

  return {
    sent: true,
    userId: user.id
  }
}
