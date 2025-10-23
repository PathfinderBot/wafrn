import { Op } from 'sequelize'
import { User } from '../../models/index.js'
import { wait } from '../wait.js'
import { completeEnvironment } from '../backendOptions.js'
import sendEmail from '../sendEmail.js'

// lets delete old users that are not activated

await User.destroy({
  where: {
    activated: false,
    emailVerified: false,
    email: { [Op.ne]: null },
    createdAt: {
      [Op.lt]: new Date(new Date().setMonth(new Date().getMonth() - 2))
    }
  }
})

const usersNotVerified = await User.scope('full').findAll({
  where: {
    activated: false,
    emailVerified: false,
    banned: false,
    email: {
      [Op.ne]: null
    }
  }
})

console.log(`Not verified users: ${usersNotVerified.length}`)
let emailCount = 0
await wait(1500)
for await (const user of usersNotVerified.filter((elem) => !!elem)) {
  if (user.email === null) continue

  console.log(`Sending email to user ${user.url} with email ${user.email}`)

  const activationLink = `${completeEnvironment.instanceUrl}/activate/${encodeURIComponent(user.email)}/${user.activationCode}`
  const emailInfo = await sendEmail({
    email: user.email as string,
    subject: `${user.url} your email is still not verified!`,
    body: `\
<p>Hello ${user.url}, you registered on ${completeEnvironment.instanceUrl} but never verified your email!</p>
<p>If you would like to activate your account, you can <a href="${activationLink}">verify your email</a>.</p>
<br />
<p>If you can't see the link above, copy this link: ${activationLink}</p>
<p>If you encounter any problems or we haven't gotten back to you after 24 hours, reply to this email.</p>
`
  })

  const emailSent = emailInfo !== undefined
  if (emailSent) {
    emailCount += 1
  }
}
console.log(`Sent a total of ${emailCount} emails.`)
