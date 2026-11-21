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

/**
 * Escape user-controlled strings before embedding them in HTML emails.
 */
function escapeHtml(input: string): string {
  return input.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

async function notifyAdminsOfNewRegistration(registration: {
  url: string
  email: string
  description?: string
}) {
  const dashboardLink = `${completeEnvironment.frontendUrl}/admin/activate-users`
  const descriptionSection = registration.description
    ? `<li>Description/bio: ${escapeHtml(registration.description)}</li>`
    : ''
  await emailAdmins({
    subject: `New registration request at ${completeEnvironment.instanceUrl}: ${escapeHtml(registration.url)}`,
    body: `\
<p>A new user has registered at ${completeEnvironment.instanceUrl} and is awaiting approval:</p>
<ul>
<li>Username: ${escapeHtml(registration.url)}</li>
<li>Email: ${escapeHtml(registration.email)}</li>${descriptionSection}
</ul>
<p>You can review, activate or reject them in the <a href="${dashboardLink}">admin dashboard</a>.</p>
`
  })
}

export { emailAdmins, notifyAdminsOfNewRegistration }
