import { Resolver } from 'did-resolver'
import { getResolver } from 'plc-did-resolver'
import { redisCache } from '../../utils/redis.js'
import { completeEnvironment } from '../../utils/backendOptions.js'
import getUserAgent from '../../utils/getUserAgent.js'
import { assertUrlResolvesPublic } from '../../utils/ssrfProtection.js'

async function getServerFromDid(did: string, ignoreCache?: boolean): Promise<string> {
  const cacheRes = ignoreCache ? null : await redisCache.get('didServer:' + did)
  if (cacheRes) {
    return cacheRes
  }
  let res = ''
  try {
    if (did.startsWith('did:web')) {
      const didWebUrl = `https://${did.split('did:web:')[1]}/.well-known/did.json`
      await assertUrlResolvesPublic(didWebUrl)
      const docRes = await fetch(didWebUrl, {
        headers: {
          'User-Agent': getUserAgent('ATProtoWorker')
        }
      })
      const didDoc = await docRes.json()
      const atProtoServer = didDoc.service.find(
        (x: any) => x.id === '#atproto_pds' || x.type === 'AtprotoPersonalDataServer'
      )
      res = atProtoServer.serviceEndpoint
    } else {
      const plcResolver = getResolver()
      const didResolver = new Resolver(plcResolver)
      const didData = await didResolver.resolve(did)
      const atProtoServer = didData?.didDocument?.service?.find(
        (x: any) => x.id === '#atproto_pds' || x.type === 'AtprotoPersonalDataServer'
      )
      if (atProtoServer) {
        res = atProtoServer.serviceEndpoint as string
      }
    }
    if (res) {
      await assertUrlResolvesPublic(res)
    }
  } catch {
    return ''
  }
  if (res) {
    redisCache.set('didServer:' + did, res, 'EX', 300)
  }
  return res
}

export { getServerFromDid }
