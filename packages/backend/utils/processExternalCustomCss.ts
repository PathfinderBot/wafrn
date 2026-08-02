import { Media } from '../models/index.js'
import { completeEnvironment } from './backendOptions.js'
import { logger } from './logger.js'

const regex = /url\((.*?)\)/gm

export default async function processExternalCustomCss(userId: string, unprocessed: string): Promise<string> {
  let m
  let processedCSS = unprocessed.replaceAll('[external-css-override]', '')
  while ((m = regex.exec(unprocessed)) !== null) {
    if (m.index === regex.lastIndex) {
      regex.lastIndex++
    }

    if (m[1]) {
      const linkMatch = m[1].replace(/['"]/gm, '')
      try {
        const extMedia = await Media.create({
          NSFW: false,
          userId: userId,
          description: '',
          ipUpload: 'MEDIA_FROM_CUSTOM_CSS_FROM_ANOTHER_INSTANCE',
          external: true
        })
        processedCSS = processedCSS.replaceAll(
          linkMatch,
          new URL('/api/v2/cache/media/' + extMedia.id, completeEnvironment.externalCacheurl).href
        )
      } catch {
        logger.error({ link: linkMatch }, 'cannot media this')
      }
    }
  }
  return processedCSS
}
