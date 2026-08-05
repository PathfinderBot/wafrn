import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { Job } from 'bullmq'
import getUserAgent from '../getUserAgent.js'
import { getServerFromDid } from '../atproto/getServerFromDid.js'
import axios from 'axios'
import { getMimeType } from 'stream-mime-type'
import { spawn } from 'child_process'
import sequelize from 'sequelize/lib/sequelize'
import { Media } from '../../models/media.js'
import { completeEnvironment } from '../backendOptions.js'
import { assertPublicHttpUrl, ssrfSafeHttpAgent, ssrfSafeHttpsAgent } from '../ssrfProtection.js'

export type DownloadJobPayload = {
  mediaUrl: string
}
export type DownloadJobResult = {
  mime: string
  localFileName: string
}

const USE_EXIV_FOR_ALT_TEXT = false
const MEDIA_FETCH_TIMEOUT_MS = 25000
function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout()
      reject(new Error(`Timed out after ${ms}ms`))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

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

    let pdsUrl = ''
    try {
      pdsUrl = await getServerFromDid(did)
    } catch {}
    if (!pdsUrl) {
      try {
        pdsUrl = await getServerFromDid(did, true)
      } catch {}
    }
    if (!pdsUrl) {
      throw new Error(`Could not resolve PDS for did ${did}`)
    }
    mediaUrl =
      pdsUrl + '/xrpc/com.atproto.sync.getBlob?did=' + encodeURIComponent(did) + '&cid=' + encodeURIComponent(cid)
  }

  let readStream: fs.ReadStream
  const localPrefix = `${completeEnvironment.mediaUrl}/`

  if (mediaUrl.startsWith(localPrefix)) {
    const uploadsRoot = path.resolve('uploads')
    const localUploadFile = path.resolve(uploadsRoot, mediaUrl.slice(localPrefix.length))
    if (localUploadFile !== uploadsRoot && !localUploadFile.startsWith(uploadsRoot + path.sep)) {
      throw new Error(`Aborting cache process. Path traversal blocked: ${mediaUrl}`)
    }
    if (fs.existsSync(localUploadFile)) {
      readStream = fs.createReadStream(localUploadFile)
    } else {
      throw new Error(`Aborting cache process. Local file for wafrn media does not exist: ${localUploadFile}`)
    }
  } else {
    assertPublicHttpUrl(mediaUrl)
    const response = await axios.get(mediaUrl, {
      responseType: 'stream' as const,
      headers: { 'User-Agent': getUserAgent('WafrnMediaCacher') },
      timeout: MEDIA_FETCH_TIMEOUT_MS,
      maxRedirects: 3,
      httpAgent: ssrfSafeHttpAgent,
      httpsAgent: ssrfSafeHttpsAgent
    })
    readStream = response.data
  }

  const { stream, mime } = await withTimeout(getMimeType(readStream), MEDIA_FETCH_TIMEOUT_MS, () => {
    readStream.destroy(new Error('Aborted: mime sniffing timed out'))
  })
  fs.writeFileSync(localFileName + '.mime', mime)

  const writeStream = fs.createWriteStream(localFileName)
  try {
    await pipeline(stream, writeStream)
  } catch (error) {
    fs.rm(localFileName, { force: true }, () => {})
    fs.rm(localFileName + '.mime', { force: true }, () => {})
    throw error
  }

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

  return { mime, localFileName } as DownloadJobResult
}
