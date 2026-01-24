import { getAtProtoThread } from "./atproto/utils/getAtProtoThread.js";
import { getDidDoc } from "./utils/atproto/getDidDoc.js";
import { getServerFromDid } from "./utils/atproto/getServerFromDid.js";

import { AtprotoHandleResolver } from '@atproto-labs/handle-resolver'
import { resolveTxt } from 'node:dns/promises'
import { resolveHandle } from "./utils/atproto/resolveHandleToDid.js";
import { getAtprotoUser } from "./atproto/utils/getAtprotoUser.js";

//const tmp = await getAtProtoThread('at://did:plc:an2e3qjrwpfizkms3k2li23v/app.bsky.feed.post/3mcuw5l42x224', true)
const tmp2 = await getAtprotoUser('foone.bsky.social')

console.log(tmp2)
