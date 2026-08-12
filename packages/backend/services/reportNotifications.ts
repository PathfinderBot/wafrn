import { Op } from 'sequelize'
import { User } from '../models/index.js'
import { bulkCreateNotifications } from './pushNotifications.js'

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
}

export { notifyAdminsOfReports }
