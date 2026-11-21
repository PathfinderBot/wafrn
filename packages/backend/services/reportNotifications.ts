import { Op } from 'sequelize'
import { User } from '../models/index.js'
import { bulkCreateNotifications } from './pushNotifications.js'
import { emailAdmins } from './adminNotifications.js'
import { completeEnvironment } from '../utils/backendOptions.js'

function escapeHtml(input: string): string {
  return input.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

async function notifyAdminsOfReports(reports: { reporterId?: string; postId?: string }[], description?: string) {
  if (reports.length === 0) return
  const admins = await User.findAll({
    attributes: ['id'],
    where: {
      role: 10,
      email: { [Op.ne]: null }
    }
  })
  if (admins.length === 0) return
  await bulkCreateNotifications(
    reports.flatMap((report) =>
      admins.map((admin) => ({
        notificationType: 'REPORT' as const,
        userId: report.reporterId ?? '00000000-0000-0000-0000-000000000000',
        notifiedUserId: admin.id,
        postId: report.postId,
        detached: false
      }))
    ),
    { postContent: description }
  )
  const links = reports
    .filter((report) => report.postId)
    .map(
      (report) =>
        `<li><a href="${completeEnvironment.frontendUrl}/fediverse/post/${report.postId}">${report.postId}</a></li>`
    )
    .join('\n')
  const descriptionSection = description ? `<p>Report description: ${escapeHtml(description)}</p>` : ''
  await emailAdmins({
    subject: `New post report at ${completeEnvironment.instanceUrl}`,
    body: `\
<p>A post has been reported at ${completeEnvironment.instanceUrl}:</p>
<ul>
${links}
</ul>
${descriptionSection}
<p>You can review it in the <a href="${completeEnvironment.frontendUrl}/admin/user-reports">admin dashboard</a>.</p>
`
  })
}

export { notifyAdminsOfReports }
