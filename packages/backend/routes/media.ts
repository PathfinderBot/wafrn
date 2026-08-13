/* eslint-disable max-len */
import { Application, Response } from 'express'
import { QueueEvents } from 'bullmq'
import { Media } from '../models/index.js'
import uploadHandler from '../utils/uploads.js'
import { authenticateToken } from '../utils/authenticateToken.js'
import { mediaUploadLimiter } from '../utils/rateLimiters.js'

import getIp from '../utils/getIP.js'
import { logger } from '../utils/logger.js'
import AuthorizedRequest from '../interfaces/authorizedRequest.js'
import { getQueue } from '../utils/queues.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { OptimizeMediaJobPayload, OptimizeMediaJobResult } from '../queueProcessors/optimizeMediaJob.js'

const updateMediaDataQueue = getQueue('processRemoteMediaData')
const optimizeMediaQueue = getQueue<OptimizeMediaJobPayload>('optimizeMediaQueue')
const optimizeMediaQueueEvents = new QueueEvents('optimizeMediaQueue', {
  connection: completeEnvironment.bullmqConnection
})

export default function mediaRoutes(app: Application) {
  app.post(
    '/api/uploadMedia',
    mediaUploadLimiter,
    authenticateToken,
    uploadHandler().array('image'),
    async (req: AuthorizedRequest, res: Response) => {
      let result = []
      const picturesPromise = [] as Array<Promise<any>>

      if (req.files != null) {
        const files = req.files as Express.Multer.File[]
        for (const file of files) {
          let fileUrl = `/${file.path}`
          const originalNameArray = fileUrl.split('.')
          const extension = originalNameArray[originalNameArray.length - 1].toLowerCase()
          const formatsToNotConvert = ['webp', 'aac', 'mp3', 'wav', 'ogg', 'oga', 'm4a', 'pdf']
          if (!formatsToNotConvert.includes(extension)) {
            try {
              const job = await optimizeMediaQueue.add('optimizeMedia', { inputPath: file.path })
              const jobResult = (await job.waitUntilFinished(optimizeMediaQueueEvents)) as OptimizeMediaJobResult
              fileUrl = `/${jobResult.outputPath}`
            } catch (error) {
              logger.debug({
                message: `Error optimizing media`,
                error: error
              })
              res.status(500)
              return res.send({
                error: true,
                message: `Error optimizing mediaº`
              })
            }
          }
          if (completeEnvironment.removeFolderNameFromFileUploads) {
            fileUrl = fileUrl.slice('/uploads/'.length - 1)
          }

          const isNSFW = req.body.nsfw === 'true'

          picturesPromise.push(
            Media.create({
              url: fileUrl,
              // if its marked as adult content it must be NSFW
              NSFW: isNSFW,
              userId: req.jwtData?.userId,
              description: req.body.description,
              ipUpload: getIp(req)
            })
          )
        }

        result = await Promise.all(picturesPromise)
        const medias = await Promise.all(picturesPromise)
        await updateMediaDataQueue.addBulk(
          medias.map((media: any) => {
            return {
              name: `getMediaData${media.id}`,
              data: { mediaId: media.id }
            }
          })
        )
      }

      res.send(result)
    }
  )

  app.get('/api/updateMedia', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    let success = false
    try {
      const posterId = req.jwtData?.userId
      if (req.query?.id && +req.query.id) {
        const mediaToUpdate = await Media.findOne({
          where: {
            id: +req.query.id,
            userId: posterId
          }
        })
        if (mediaToUpdate) {
          mediaToUpdate.NSFW = req.query.NSFW === 'true'
          mediaToUpdate.description = req.query.description as string
          await mediaToUpdate.save()
          success = true
        }
      }
    } catch (error) {
      logger.error(error)
    }

    res.send({
      success
    })
  })
}
