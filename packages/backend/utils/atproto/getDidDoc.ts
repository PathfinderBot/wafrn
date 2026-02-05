import { DidDocument } from '@atcute/identity'
import { getServerFromDid } from './getServerFromDid.js'
import { redisCache } from '../redis.js'
import { completeEnvironment } from '../backendOptions.js'
import getUserAgent from '../getUserAgent.js'


export async function getDidDoc(inputDid: string): Promise<DidDocument | undefined> {
  let did = inputDid
  if (did.startsWith('at://')) {
    did = did.replace(/^at:\/\//, '')
  }
  let cacheResult = await redisCache.get('didDoc:' + did)
  if (cacheResult) {
    return JSON.parse(cacheResult) as DidDocument
  }
  if (did.startsWith('did:plc:')) {
    try {
      const server = await getServerFromDid(did)
      let petitionRes = await (await (fetch(`${server}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`))).json()
      await redisCache.set('didDoc:' + did, JSON.stringify(petitionRes.didDoc), 'EX', 60)
      return petitionRes.didDoc as DidDocument
    } catch {
      return undefined
    }
  } else if (did.startsWith('did:web:')) {
    const didWebHost = did.replace(/^did:web:/, '')
    const didDocRes = await fetch(`https://${didWebHost}/.well-known/did.json`,
      {
        headers: {
          "User-Agent": getUserAgent('ATProtoWorker')
        }
      }
    )
    if (!didDocRes.ok) return undefined
    try {
      const didDoc = await didDocRes.json() as DidDocument
      await redisCache.set('didDoc:' + did, JSON.stringify(didDoc), 'EX', 60)
      return didDoc
    } catch {
      return undefined
    }
  }

  return undefined
}