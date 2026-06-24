import { User } from '../../models/index.js'
import { completeEnvironment } from '../backendOptions.js'

// I know its not redis cache but makes sense shut up
async function getDeletedUser(): Promise<User> {
  return (await User.findOne({
    where: {
      url: completeEnvironment.deletedUser
    }
  })) as User
}

export { getDeletedUser }
