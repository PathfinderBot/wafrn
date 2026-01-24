import { DidDocument } from '@atcute/identity'
import { getServerFromDid } from './getServerFromDid.js'


export async function getDidDoc(did: string): Promise<DidDocument | undefined> {
  if (did.startsWith('at://')) did = did.replace(/^at:\/\//, '')
  if (did.startsWith('did:plc:')) {
    try {
      const server = await getServerFromDid(did)
      let petitionRes = await (await (fetch(`${server}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`))).json()
      return petitionRes.didDoc as DidDocument
    } catch {
      return undefined
    }
  } else if (did.startsWith('did:web:')) {
    const didWebHost = did.replace(/^did:web:/, '')
    const didDocRes = await fetch(`https://${didWebHost}/.well-known/did.json`)
    if (!didDocRes.ok) return undefined
    try {
      const didDoc = await didDocRes.json() as DidDocument
      return didDoc
    } catch {
      return undefined
    }
  }

  return undefined
}