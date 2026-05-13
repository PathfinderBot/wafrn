import { getQueue } from '../utils/queues.js'
import { Media } from '../models/index.js'
import { Op } from 'sequelize'
import { completeEnvironment } from '../utils/backendOptions.js'

const updateMediaDataQueue = getQueue('processRemoteMediaData')

async function loadMediaData() {
  const mediasToUpdate = await Media.findAll({
    where: {
      mediaType: {
        [Op.eq]: null
      }
    },
    limit: 10000
  })

  await updateMediaDataQueue.addBulk(
    mediasToUpdate.map((media: any) => {
      return {
        name: `getMediaData${media.id}`,
        data: { mediaId: media.id }
      }
    })
  )
}

loadMediaData().then(() => {
  console.log('done')
})
