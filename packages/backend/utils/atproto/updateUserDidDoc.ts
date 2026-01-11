import { User } from '../../models/index.js'
import { getDidDoc } from './getDidDoc.js'
import { defs, normalizeOp, PlcClient, signOperation, type IndexedEntryLog } from '@atcute/did-plc'
import { fromBase16 } from '@atcute/multibase'
import { Secp256k1PrivateKey } from '@atcute/crypto'
import { logger } from '../logger.js'

async function updateUserDidDoc(user: User) {
  try {
    logger.debug('updating ' + user.url)
    const didDoc = await getDidDoc(user.bskyDid ?? '')
    const handle = didDoc?.alsoKnownAs?.find((x) => x.startsWith('at://'))?.replace(/^at:\/\//, '')
    if (!handle) {
      logger.debug(`No handle starting with at:// found in DID doc for user ${user.url}. Aborting update.`)
      return
    }

    user.alternateUrl = '@' + handle
    await user.save()

    if (user.bskyDid?.startsWith('did:plc')) {
      logger.debug('getting PLC logs')
      const lastOp = await getLastPlcOpFromPlc(user.bskyDid)

      if (!lastOp || lastOp.lastOperation.alsoKnownAs.includes(user.fullFediverseUrl ?? '')) {
        return
      }

      logger.debug('creating PLC operation')
      const operation = {
        type: 'plc_operation',
        prev: lastOp.base?.cid,
        alsoKnownAs: [...lastOp.lastOperation.alsoKnownAs.filter((x) => x !== user.fullUrl), user.fullFediverseUrl],
        services: lastOp.lastOperation.services,
        rotationKeys: lastOp.lastOperation.rotationKeys,
        verificationMethods: lastOp.lastOperation.verificationMethods
      }

      logger.debug('pushing PLC operation')
      await pushPlcOperation(user.bskyDid, operation)
    }
  } catch (e) {
    logger.error({
      message: `Failed updating DID doc for user: ${user.url}`,
      error: e
    })
  }
}

async function getPlcAuditLogs(did: string) {
  const response = await fetch(`https://plc.directory/${did}/log/audit`)
  if (!response.ok) {
    throw new Error(`got response ${response.status}`)
  }

  const json = await response.json()
  return defs.indexedEntryLog.parse(json)
}

async function getLastPlcOpFromPlc(did: string) {
  const logs = await getPlcAuditLogs(did)
  return getLastPlcOp(logs)
}

function getLastPlcOp(logs: IndexedEntryLog) {
  const lastOp = logs.at(-1)
  if (lastOp && lastOp.operation.type !== 'plc_tombstone') {
    return { lastOperation: normalizeOp(lastOp.operation), base: lastOp }
  }
  return null
}

async function pushPlcOperation(did: string, operation: any) {
  const keyHexBytes = fromBase16(process.env.PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX ?? '')
  const signingRotationKey = await Secp256k1PrivateKey.importRaw(keyHexBytes)

  const signedOp = await signOperation(operation, signingRotationKey)
  const client = new PlcClient()
  await client.submitOperation(did as `did:plc:${string}`, signedOp)
}

export { updateUserDidDoc }
