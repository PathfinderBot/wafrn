import { User } from "../../models/index.js"
import { getDidDoc } from "./getDidDoc.js"
import { defs, normalizeOp, PlcClient, signOperation, type IndexedEntryLog } from "@atcute/did-plc";
import { fromBase16, toBase64Url } from "@atcute/multibase";
import { Secp256k1PrivateKey, Secp256k1PrivateKeyExportable } from "@atcute/crypto";
import { createBskyAppPassword, updateBskyPassword } from "../../routes/users.js";
import generateRandomString from "../generateRandomString.js";
import { completeEnvironment } from "../backendOptions.js";
import { AtpAgent } from "@atproto/api";

export async function updateUserDidDoc(user: User) {
  try {
    console.log('updating ' + user.url)
    const didDoc = await getDidDoc(user.bskyDid ?? '')
    const handle = didDoc?.alsoKnownAs?.find(x => x.startsWith('at://'))?.replace(/^at:\/\//, '')
    if (handle) {
      user.alternateUrl = '@' + handle
      await user.save()

      if (user.bskyDid?.startsWith('did:plc')) {
        console.log('getting plc info')
        const lastOp = await getLastPlcOpFromPlc(user.bskyDid)

        if (lastOp.lastOperation.alsoKnownAs.includes(user.fullFediverseUrl ?? '')) {
          await forceUpdateBskyPassword(user)
          return;
        }

        console.log('editing plc op')
        const operation = {
          type: "plc_operation",
          prev: lastOp.base?.cid,
          alsoKnownAs: [
            ...lastOp.lastOperation.alsoKnownAs.filter(x => x !== user.fullUrl),
            user.fullFediverseUrl
          ],
          services: lastOp.lastOperation.services,
          rotationKeys: lastOp.lastOperation.rotationKeys,
          verificationMethods: lastOp.lastOperation.verificationMethods,
        }

        console.log('pushing operation')
        await pushPlcOperation(user.bskyDid, operation)
        await forceUpdateBskyPassword(user)
        
      }
    }
  } catch (e) {
    console.error('could not update user', user.url)
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
  const client = new PlcClient();
  await client.submitOperation(did as `did:plc:${string}`, signedOp)
};

async function forceUpdateBskyPassword(user: User){
          try {
          const serviceUrl = completeEnvironment.bskyPds
            ? completeEnvironment.bskyPds.startsWith("http")
              ? completeEnvironment.bskyPds
              : "https://" + completeEnvironment.bskyPds
            : "";
          const randomString = generateRandomString()
          await updateBskyPassword(user, randomString)
          const agent = new AtpAgent({
            service: serviceUrl,
          });
          await agent.login({
            identifier: user.bskyDid as string,
            password: randomString,
          });
          await createBskyAppPassword(user, agent);
          console.log(`Created bsky app password for user ${user.url}`)
          
        
        } catch (error) {
          console.log('Problem updating user bsky password: ' + user.url)
          console.log(error)
        }
}