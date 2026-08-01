import { DidDocument } from '@atcute/identity'
import { getServerFromDid } from './getServerFromDid.js'
import { redisCache } from '../redis.js'
import getUserAgent from '../getUserAgent.js'
import { assertUrlResolvesPublic } from '../ssrfProtection.js'

export async function getDidDoc(inputDid: string, ignoreCache?: boolean): Promise<DidDocument | undefined> {
  let did = inputDid
  if (ignoreCache) {
    await redisCache.del('didDoc:' + did)
  }
  if (did.startsWith('at://')) {
    did = did.replace(/^at:\/\//, '')
  }
  const cacheResult = await redisCache.get('didDoc:' + did)
  if (cacheResult) {
    return JSON.parse(cacheResult) as DidDocument
  }
  if (did.startsWith('did:plc:')) {
    try {
      const server = await getServerFromDid(did, ignoreCache)
      const repoDescribeUrl = `${server}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`
      await assertUrlResolvesPublic(repoDescribeUrl)
      const petitionRes = await (await fetch(repoDescribeUrl)).json()
      await redisCache.set('didDoc:' + did, JSON.stringify(petitionRes.didDoc), 'EX', 60)
      return petitionRes.didDoc as DidDocument
    } catch {
      return undefined
    }
  } else if (did.startsWith('did:web:')) {
    const didWebHost = did.replace(/^did:web:/, '')
    const didWebUrl = `https://${didWebHost}/.well-known/did.json`
    try {
      await assertUrlResolvesPublic(didWebUrl)
    } catch {
      return undefined
    }
    const didDocRes = await fetch(didWebUrl, {
      headers: {
        'User-Agent': getUserAgent('ATProtoWorker')
      }
    })
    if (!didDocRes.ok) return undefined
    try {
      const didDoc = (await didDocRes.json()) as DidDocument
      await redisCache.set('didDoc:' + did, JSON.stringify(didDoc), 'EX', 60)
      return didDoc
    } catch {
      return undefined
    }
  }

  return undefined
}
