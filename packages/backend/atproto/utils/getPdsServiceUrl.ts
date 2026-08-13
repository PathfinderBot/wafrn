import { completeEnvironment } from '../../utils/backendOptions.js'


  // lets skip caddy if possible
function getPdsServiceUrl(): string {
  if (completeEnvironment.bskyPdsInternalUrl) {
    return completeEnvironment.bskyPdsInternalUrl
  }
  return completeEnvironment.bskyPds.startsWith('http')
    ? completeEnvironment.bskyPds
    : 'https://' + completeEnvironment.bskyPds
}

export { getPdsServiceUrl }
