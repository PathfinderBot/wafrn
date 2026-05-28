import crypto from 'crypto'
import fs from 'fs'
import { Job } from 'bullmq'
import { getResolver } from 'plc-did-resolver'
import { Resolver } from 'did-resolver'
import getUserAgent from '../getUserAgent.js'
import axios from 'axios'
import { getMimeType } from 'stream-mime-type'
import { spawn } from 'child_process'
import sequelize from 'sequelize/lib/sequelize'
import { Media } from '../../models/media.js'
import { completeEnvironment } from '../backendOptions.js'

export type DownloadJobPayload = {
  mediaUrl: string
}
export type DownloadJobResult = {
  mime: string
  localFileName: string
}

const USE_EXIV_FOR_ALT_TEXT = false

function writeAlTextAsEXIV(filename: string, altText: string) {
  return new Promise((resolve, reject) => {
    const updateAltText = spawn('exiv2', [
      '-M',
      `set Exif.Photo.UserComment charset=Ascii ${altText
        .replaceAll('"', '')
        .replaceAll("'", '')
        .replaceAll('\\', '')
        .replaceAll('$', '')
        .replaceAll('@', '')}`,
      filename
    ])
    updateAltText.on('error', (err) => reject(err))
    updateAltText.on('close', () => {
      return resolve(filename)
    })
  })
}

export async function downloadMedia(job: Job<DownloadJobPayload>) {
  let mediaUrl = job.data.mediaUrl
  const mediaLinkHash = crypto.createHash('sha256').update(mediaUrl).digest('hex')
  const localFileName = `cache/${mediaLinkHash}`

  if (mediaUrl.startsWith('?cid=')) {
    const did = decodeURIComponent(mediaUrl.split('&did=')[1])
    const cid = decodeURIComponent(mediaUrl.split('&did=')[0].split('?cid=')[1])

    if (!did) {
      throw new Error('Missing did param in ATProto URL')
    }
    if (!cid) {
      throw new Error('Missing cid param in ATProto URL')
    }

    if (did.startsWith('did:plc')) {
      const plcResolver = getResolver()
      const didResolver = new Resolver(plcResolver)
      const didData = await didResolver.resolve(did)
      if (didData?.didDocument?.service) {
        const url =
          didData.didDocument.service[0].serviceEndpoint +
          '/xrpc/com.atproto.sync.getBlob?did=' +
          encodeURIComponent(did) +
          '&cid=' +
          encodeURIComponent(cid)
        mediaUrl = url
      }
    } else if (did.startsWith('did:web')) {
      // get did doc first
      const docRes = await fetch(`https://${did.split('did:web:')[1]}/.well-known/did.json`, {
        headers: {
          'User-Agent': getUserAgent('ATProtoWorker')
        }
      })
      const didDoc = await docRes.json()
      const atProtoServer = didDoc.service.find(
        (x: any) => x.id === '#atproto_pds' || x.type === 'AtprotoPersonalDataServer'
      )

      if (!atProtoServer) {
        throw new Error(`ATProto PDS not found on DID doc for ${did}`)
      }

      const url =
        atProtoServer.serviceEndpoint +
        '/xrpc/com.atproto.sync.getBlob?did=' +
        encodeURIComponent(did) +
        '&cid=' +
        encodeURIComponent(cid)
      mediaUrl = url
    }
  }

  let readStream: fs.ReadStream
  const localPrefix = `${completeEnvironment.mediaUrl}/`
  const localFile = `uploads/${mediaUrl.replace(localPrefix, '')}`
  if (mediaUrl.startsWith(localPrefix) && fs.existsSync(localFile)) {
    readStream = fs.createReadStream(localFile)
  } else {
    const response = await axios.get(mediaUrl, {
      responseType: 'stream' as const,
      headers: { 'User-Agent': getUserAgent('WafrnMediaCacher') },
      timeout: 25000
    })
    readStream = response.data
  }

  const { stream, mime } = await getMimeType(readStream)
  fs.writeFileSync(localFileName + '.mime', mime)

  const writeStream = fs.createWriteStream(localFileName)
  stream.pipe(writeStream)

  return new Promise<DownloadJobResult>((resolve, reject) => {
    writeStream.on('finish', async () => {
      if (USE_EXIV_FOR_ALT_TEXT) {
        const media = await Media.findOne({
          where: sequelize.where(
            sequelize.fn('md5', sequelize.col('url')),
            crypto.createHash('md5').update(mediaUrl).digest('hex')
          )
        })
        if (media?.description) {
          await writeAlTextAsEXIV(localFileName, media?.description)
        }
      }
      resolve({ mime, localFileName })
    })
    writeStream.on('error', (err) => reject(err))
  })
}
