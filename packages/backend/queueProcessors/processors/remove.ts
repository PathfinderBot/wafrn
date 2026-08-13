import { activityPubObject } from '../../interfaces/fediverse/activityPubObject.js'
import { User } from '../../models/index.js'
import { getPostThreadRecursive } from '../../activitypub/getPostThreadRecursive.js'
import { signAndAccept } from '../../activitypub/signAndAccept.js'

async function RemoveActivity(body: activityPubObject, remoteUser: User, user: User) {
  const apObject: activityPubObject = body
  const postToNotFeature = await getPostThreadRecursive(user, apObject.object)
  if (postToNotFeature) {
    postToNotFeature.featured = null
    await postToNotFeature.save()
  }
  // await signAndAccept({ body: body }, remoteUser, user)
}

export { RemoveActivity }
