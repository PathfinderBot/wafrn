import { logger } from './logger.js'

import sharp from 'sharp'

/* eslint-disable max-len */
import fs from 'fs'
import FfmpegCommand from 'fluent-ffmpeg'
import getUserAgent from './getUserAgent.js'

const MAX_IMAGE_PIXELS = 1000000000

const MAX_VIDEO_DURATION_SECONDS = 20 * 60 // 20 minutes
const MAX_TRANSCODE_TIME_MS = 10 * 60 * 1000 // 10 minutes wall-clock

export async function createThumbnail(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl, {
    headers: { 'User-Agent': getUserAgent('LinkPreview') },
    signal: AbortSignal.timeout(10000)
  })
  if (!response.ok) {
    throw new Error(`Unable to fetch thumbnail: ${response.status} ${response.statusText}`)
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > 10 * 1024 * 1024) {
    throw new Error(`Thumbnail is too large: ${contentLength} bytes`)
  }

  const originalImage = Buffer.from(await response.arrayBuffer())
  if (originalImage.length > 10 * 1024 * 1024) {
    throw new Error(`Thumbnail is too large: ${originalImage.length} bytes`)
  }

  let previewImage = await sharp(originalImage, { failOn: 'none', limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize({
      width: 1000,
      height: 1000,
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 85 })
    .toBuffer()

  for (const quality of [75, 65, 55, 45]) {
    if (previewImage.length <= 1000000) break
    previewImage = await sharp(originalImage, { failOn: 'none', limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate()
      .resize({
        width: 800,
        height: 800,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality })
      .toBuffer()
  }

  if (previewImage.length > 1000000) {
    previewImage = await sharp(originalImage, { failOn: 'none', limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate()
      .resize({
        width: 480,
        height: 480,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 45 })
      .toBuffer()
  }

  if (previewImage.length > 1000000) {
    throw new Error(`Thumbnail remains too large after compression: ${previewImage.length} bytes`)
  }

  return previewImage
}

export default async function optimizeMedia(
  inputPath: string,
  options?: {
    outPath?: string
    maxSize?: number
    keep?: boolean
    forceImageExtension?: string
    disableAnimation?: boolean
  }
): Promise<string> {
  const fileAndExtension = options?.outPath ? [options.outPath, ''] : inputPath.split('.')
  const originalExtension = options?.forceImageExtension || fileAndExtension[1].toLowerCase()
  fileAndExtension[1] = options?.forceImageExtension ? options.forceImageExtension : 'webp'
  let outputPath = fileAndExtension.join('.')
  const doNotDelete = options?.keep ? options.keep : false
  switch (originalExtension) {
    case 'pdf':
    // TODO make a conversion for audio files
    case 'ogg':
    case 'aac':
    case 'mp3':
    case 'wav':
    case 'oga':
    case 'm4a':
      break
    case 'mp4':
      fileAndExtension[0] = fileAndExtension[0] + '_processed'
    // eslint-disable-next-line no-fallthrough
    case 'webm':
    case 'mov':
    case 'mkv':
    case 'av1':
      fileAndExtension[1] = 'mp4'
      outputPath = fileAndExtension.join('.')
      // eslint-disable-next-line no-unused-vars
      const videoPromise = await new Promise((resolve: any, reject: any) => {
        FfmpegCommand(inputPath).ffprobe(function (err: any, data: any) {
          if (data) {
            {
              const duration = Number(data.format?.duration ?? 0)
              if (duration > MAX_VIDEO_DURATION_SECONDS) {
                reject(
                  new Error(`Video duration ${duration}s exceeds maximum allowed of ${MAX_VIDEO_DURATION_SECONDS}s`)
                )
                return
              }
              const stream = data.streams.find((stream: any) => stream.coded_height)
              let horizontalResolution = stream ? stream.coded_width : 1280
              let verticalResolution = stream ? stream.coded_height : 1280
              horizontalResolution = Math.min(horizontalResolution, 1280)
              verticalResolution = Math.min(verticalResolution, 1280)
              const resolutionString =
                horizontalResolution > verticalResolution ? `${horizontalResolution}x?` : `?x${verticalResolution}`
              const videoCodec = stream?.codec_name == 'h264' ? 'copy' : 'libx264'
              const command = FfmpegCommand(inputPath)
              if (videoCodec != 'copy') {
                command.size(resolutionString)
                command.videoBitrate('3500')
              }

              // Hard wall-clock bound on the transcode itself: kill the ffmpeg
              // process if it runs too long instead of letting it run unbounded.
              let finished = false
              const timeout = setTimeout(() => {
                if (!finished) {
                  finished = true
                  command.kill('SIGKILL')
                  reject(new Error(`Transcode exceeded ${MAX_TRANSCODE_TIME_MS}ms and was killed`))
                }
              }, MAX_TRANSCODE_TIME_MS)

              command
                .audioCodec('aac')
                .videoCodec(videoCodec)
                .renice(20)
                .save(outputPath)
                .on('end', () => {
                  if (finished) return
                  finished = true
                  clearTimeout(timeout)
                  try {
                    fs.unlinkSync(inputPath)
                    logger.trace('media converted')
                    resolve()
                  } catch (exc) {
                    logger.warn(exc)
                    reject(exc)
                  }
                })
                .on('error', (transcodeErr: any) => {
                  if (finished) return
                  finished = true
                  clearTimeout(timeout)
                  reject(transcodeErr)
                })
            }
          } else {
            reject(err || new Error('Unable to read video metadata'))
            logger.warn({
              message: `Error on optimizemedia`,
              error: err
            })
          }
        })
      })

      break
    default:
      const metadata = await sharp(inputPath, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata()
      if (!options?.outPath) {
        fileAndExtension[0] = fileAndExtension[0] + '_processed'
        outputPath = fileAndExtension.join('.')
      }
      if (metadata.delay && !(options?.forceImageExtension && ['gif', 'png'].includes(options.forceImageExtension))) {
        fileAndExtension[1] = 'webp'
        outputPath = fileAndExtension.join('.')
      }

      let conversion = sharp(inputPath, {
        animated: !options?.disableAnimation,
        failOn: 'none',
        limitInputPixels: MAX_IMAGE_PIXELS
      }).rotate()
      if (options?.maxSize) {
        const imageMetadata = await conversion.metadata()
        if (
          imageMetadata.height &&
          imageMetadata.width &&
          (imageMetadata.height > options.maxSize || imageMetadata.width > options.maxSize)
        ) {
          let height = imageMetadata.delay ? imageMetadata.height / imageMetadata.delay.length : imageMetadata.height
          let width = imageMetadata.width
          const maxSize = options.maxSize
          if (height > width) {
            height = Math.round((maxSize * width) / height)
            width = maxSize
          } else {
            width = Math.round((maxSize * height) / width)
            height = maxSize
          }

          conversion.resize(height, width)
        }
      }
      if (fileAndExtension[1] == 'webp') {
        let stat = await fs.promises.stat(inputPath)
        let lossless = false
        // if the input is PNG we probably want the output to be lossless too
        // also allow GIFs under 2MB to be kept as lossless
        // (smaller GIFs are likely to be something like pixel art
        // where we want to keep fine detail)
        const lower = inputPath.toLowerCase()
        if (lower.endsWith('png') || (lower.endsWith('gif') && stat.size <= 1024 ** 2 * 2)) {
          lossless = true
        }
        conversion.webp({
          lossless: lossless
        })
      }
      await conversion.toFile(outputPath)
      if (!doNotDelete) {
        fs.unlinkSync(inputPath)
      }
  }
  return outputPath
}
