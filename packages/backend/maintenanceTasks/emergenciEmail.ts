import { Op } from 'sequelize'
import { Notification, User } from '../models/index.js'
import { wait } from '../utils/wait.js'
import sendEmail from '../utils/sendEmail.js'
import getBlockedIds from '../utils/cacheGetters/getBlockedIds.js'
import { getMutedPosts } from '../utils/cacheGetters/getMutedPosts.js'
import { getNotificationOptions } from '../services/notificationOptions.js'
import { completeEnvironment } from '../utils/backendOptions.js'

async function sendMail() {
  const users = await User.scope('full').findAll({
    where: {
      banned: { [Op.ne]: true },
      activated: true,
      email: {
        [Op.ne]: null
      }
    },
    order: [['createdAt', 'ASC']]
  })

  for await (const user of users) {
    if (!user.email) {
      continue
    }

    const sorryForMailing = user.disableEmailNotifications
      ? '<p>We are also sorry for emailing you even you have disabled mail notifications. This is a security incident (even tho most probably nothing has actualy happened) and as such we consider it important enough to inform you about it</p>'
      : ''

    const subject = `Wafrn: Potential security issue, now mitigated`
    const body = `\
<h1>A potential security issue with Wafrn was discovered on the night of August 18th 2025.</h1>
<p>We do not believe that this was utilized by bad actors, but for transparency, we are emailing all Wafrn users.</p>
<p>The short version is this:</p>
<p>We discovered that an API endpoint had insufficient access control, which may have lead to sensitive user information, such as emails and hashed passwords, leaking. The issue has been mitigated in a Wafrn update, and is no longer present on the main instance nor other instances. We don't have sufficient evidence to determine if this was used by bad actors, but we believe it to be unlikely.</p>
<p>A Wafrn thread regarding the issue with additional detail is here: <a href="https://app.wafrn.net/fediverse/post/59afc694-8136-4059-a68f-a1e602d41085">https://app.wafrn.net/fediverse/post/59afc694-8136-4059-a68f-a1e602d41085</a>
<p>Feel free to reply to the thread or this email with any questions you may have.</p>
${sorryForMailing}
`
    console.log(`mailing ${user.url}`)
    try {
      await sendEmail({ email: user.email, subject: subject, body: body })
    } catch (error) {
      console.error(error)
    }
    await wait(1500)
  }
}

sendMail()
