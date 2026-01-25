import { getPostThreadPDSDirect, processSinglePost } from "./atproto/utils/getAtProtoThread.js";
import { getDidDoc } from "./utils/atproto/getDidDoc.js";
import { getServerFromDid } from "./utils/atproto/getServerFromDid.js";

import { AtprotoHandleResolver } from '@atproto-labs/handle-resolver'
import { resolveTxt } from 'node:dns/promises'
import { resolveHandle } from "./utils/atproto/resolveHandleToDid.js";
import { getAtprotoUser } from "./atproto/utils/getAtprotoUser.js";

const tmp = await processSinglePost('at://did:plc:eklt2idxirq33vttisihi4le/app.bsky.feed.post/3md7egs5bus2l', true)

