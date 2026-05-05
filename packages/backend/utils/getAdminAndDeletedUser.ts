import { User } from '../models/user.js'
import { completeEnvironment } from './backendOptions.js'

const adminUser = User.findOne({
    where: {
      url: completeEnvironment.adminUser
    }
  })

const deletedUser = User.findOne({
    where: {
      url: completeEnvironment.deletedUser
    }
  })

async function getAdminUser(): Promise<User> {
  return (await adminUser) as User
}

async function getDeletedUser(): Promise<User> {
  return (await deletedUser ) as User
}

export { getAdminUser, getDeletedUser }
