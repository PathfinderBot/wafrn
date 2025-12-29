import { PlcClient } from '@atcute/did-plc'
import { DidDocument } from '@atcute/identity'

const client = new PlcClient()

export async function getDidDoc(did: string): Promise<DidDocument | undefined> {
  if (did.startsWith('at://')) did = did.replace(/^at:\/\//, '')
  if (did.startsWith('did:plc:')) {
    try {
      return await client.getDocument(did as `did:plc:${string}`)
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