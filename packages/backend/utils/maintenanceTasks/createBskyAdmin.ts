import { completeEnvironment } from '../backendOptions.js'
import { getAdminUser } from '../getAdminAndDeletedUser.js'
import { BskyInviteCodes } from '../../models/index.js'
import { AtpAgent } from '@atproto/api'
import { createBskyAccount } from '../../routes/users.js'
import generateRandomString from '../generateRandomString.js'

const args = process.argv.slice(2)

const name = args[0]

console.log('\n\n')
console.log('This script will try to create a bluesky user for the admin account of this server.')
console.log(
  'The password will be read from the environment var bskyPdsAdminPassword or adminPassword if that is not found or a randomly generated string if that is not found'
)
console.log('\n\n')

const user = await getAdminUser()

if (!user) {
  console.log(`The admin user ${completeEnvironment.adminUser} does not exist on database`)
} else {
  if ((!user.enableBsky || !user.bskyDid) && completeEnvironment.enableBsky) {
    console.log(`Trying to create user: @${name + '.' + completeEnvironment.bskyPds}`)
    const inviteCodeRecord = await BskyInviteCodes.findOne({
      where: {
        masterCode: true
      }
    })
    const inviteCode = inviteCodeRecord?.code as string
    const serviceUrl = completeEnvironment.bskyPds
      ? completeEnvironment.bskyPds.startsWith('http')
        ? completeEnvironment.bskyPds
        : 'https://' + completeEnvironment.bskyPds
      : ''
    const agent = new AtpAgent({
      service: serviceUrl
    })
    const password =
      completeEnvironment.bskyPdsAdminPassword || completeEnvironment.adminPassword || generateRandomString()
    await createBskyAccount({
      agent,
      user,
      password,
      inviteCode,
      url: name
    })
    console.log('Done! Please do recheck now')
  } else {
    console.log(`It seems that ${user.url} has enabled bsky already or your server has bsky disabled`)
    console.log(`Server bsky enabled: ${completeEnvironment.enableBsky}`)
    console.log(`admin account did: ${user.bskyDid}`)
    console.log(`admin account bskyenabled: ${user.enableBsky}`)
    console.log(`Hope this can help you debug. Remember to check adminer!`)
  }
}
