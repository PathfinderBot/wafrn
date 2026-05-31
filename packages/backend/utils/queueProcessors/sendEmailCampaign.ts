import { Job } from 'bullmq'
import { Op } from 'sequelize'
import escape from 'escape-html'
import { User } from '../../models/index.js'
import { completeEnvironment } from '../backendOptions.js'
import { logger } from '../logger.js'
import sendEmail from '../sendEmail.js'
import { wait } from '../wait.js'

export type SendEmailCampaignJobData = {
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
      disableEmailNotifications: false,
      email: {
        [Op.ne]: null
      }
    },
    order: [['createdAt', 'ASC']]
  })

  let sent = 0
  let failed = 0

  for (const user of users) {
    if (!user.email) {
      continue
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

    if (result) {
      sent++
    } else {
      failed++
    }

    await job.updateProgress({
      sent,
      failed,
      total: users.length
    })
    // wait 2.5 seconds fper email
    await wait(2500)
  }

  logger.info({
    message: 'Email campaign finished',
    jobId: job.id,
    createdByUserId: job.data.createdByUserId,
    sent,
    failed,
    total: users.length
  })

  return {
    sent,
    failed,
    total: users.length
  }
}
