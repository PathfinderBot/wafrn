import { Op } from 'sequelize'
import { getAllLocalUserIds } from '../cacheGetters/getAllLocalUserIds.js'
import { Post, User } from '../../models/index.js'
import { getDidDoc } from '../atproto/getDidDoc.js'
import { Secp256k1PrivateKey, Secp256k1PrivateKeyExportable } from "@atcute/crypto";
import { defs, normalizeOp, PlcClient, signOperation, type IndexedEntryLog } from "@atcute/did-plc";
import { fromBase16, toBase64Url } from "@atcute/multibase";
import { completeEnvironment } from '../backendOptions.js'

const localUserIds = await getAllLocalUserIds()
const client = new PlcClient();

const localUsers = await User.findAll({
  where: {
    id: {
      [Op.in]: localUserIds
    },
    enableBsky: true,
    bskyDid: {
      [Op.ne]: null
    }
  }
})

for await (const user of localUsers) {
  console.log('updating ' + user.url)
  const didDoc = await getDidDoc(user.bskyDid ?? '')
  const handle = didDoc?.alsoKnownAs?.find(x => x.startsWith('at://'))?.replace(/^at:\/\//, '')
  if (handle) {
    user.alternateUrl = '@' + handle
    await user.save()

    if (user.bskyDid?.startsWith('did:plc')) {
      console.log('getting plc info')
      const lastOp = await getLastPlcOpFromPlc(user.bskyDid)

      console.log('editing plc op')
      const operation = {
        type: "plc_operation",
        prev: lastOp.base?.cid,
        alsoKnownAs: [
          ...lastOp.lastOperation.alsoKnownAs,
          user.fullUrl
        ],
        services: lastOp.lastOperation.services,
        rotationKeys: lastOp.lastOperation.rotationKeys,
        verificationMethods: lastOp.lastOperation.verificationMethods,
      }

      console.log('pushing operation')
      await pushPlcOperation(user.bskyDid, operation)
    }
  }
}

async function getPlcAuditLogs(did: string) {
  const response = await fetch(`https://plc.directory/${did}/log/audit`);
  if (!response.ok) {
    throw new Error(`got response ${response.status}`);
  }

  const json = await response.json();
  return defs.indexedEntryLog.parse(json);
}

async function getLastPlcOpFromPlc(did: string) {
  const logs = await getPlcAuditLogs(did);
  return getLastPlcOp(logs);
}

function getLastPlcOp(logs: IndexedEntryLog) {
  const lastOp = logs.at(-1);
  //@ts-expect-error
  return { lastOperation: normalizeOp(lastOp.operation), base: lastOp };
}

async function pushPlcOperation(did: string, operation: any) {
  const keyHexBytes = fromBase16(process.env.PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX ?? '')
  const signingRotationKey = await Secp256k1PrivateKey.importRaw(keyHexBytes)

  const signedOp = await signOperation(operation, signingRotationKey)

  await client.submitOperation(did as `did:plc:${string}`, signedOp)
};