import nodemailer from 'nodemailer'
import { completeEnvironment } from './backendOptions.js'
import SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import { logger } from './logger.js'
const transporter = nodemailer.createTransport(completeEnvironment.emailConfig)

export default async function sendEmail(options: {
  email: string
  subject: string
  body: string
}): Promise<SMTPTransport.SentMessageInfo | undefined> {
  let res = undefined
  try {
    res = await transporter.sendMail({
      from: completeEnvironment.emailConfig.auth.from,
      to: options.email,
      subject: options.subject,
      html: options.body
    })
  } catch (error) {
    logger.info({
      message: `Error sending email`,
      error: error
    })
  }
  return res
}
