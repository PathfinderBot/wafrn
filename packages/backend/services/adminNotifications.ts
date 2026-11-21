import { Op } from 'sequelize'
import { User } from '../models/index.js'
import sendEmail from '../utils/sendEmail.js'
import { completeEnvironment } from '../utils/backendOptions.js'

/**
 * Email all admins (role 10) that have an email address in the database.
 * Returns the list of addresses the email was sent to, so callers can skip
 * or adjust behavior when there are no admins to notify.
 */
async function emailAdmins(options: { subject: string; body: string }): Promise<string[]> {
  const admins = await User.findAll({
    attributes: ['email'],
    where: {
      role: 10,
      email: { [Op.ne]: null }
    }
  })
  const emails = admins.map((admin) => admin.email as string).filter((elem) => !!elem)
  await Promise.allSettled(emails.map((email) => sendEmail({ email, ...options })))
  return emails
}

async function notifyAdminsOfNewRegistration(registration: { url: string; email: string }) {
  const dashboardLink = `${completeEnvironment.frontendUrl}/admin/activate-users`
  await emailAdmins({
    subject: `New registration request at ${completeEnvironment.instanceUrl}: ${registration.url}`,
    body: `\
<p>A new user has registered at ${completeEnvironment.instanceUrl} and is awaiting approval:</p>
<ul>
<li>Username: ${registration.url}</li>
<li>Email: ${registration.email}</li>
</ul>
<p>You can review, activate or reject them in the <a href="${dashboardLink}">admin dashboard</a>.</p>
`
  })
}

export { emailAdmins, notifyAdminsOfNewRegistration }
