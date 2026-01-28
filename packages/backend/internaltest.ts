import { getPostInteractionLevels, getPostThreadPDSDirect, processReplies, processSinglePost } from "./atproto/utils/getAtProtoThread.js";
import { getDidDoc } from "./utils/atproto/getDidDoc.js";
import { getServerFromDid } from "./utils/atproto/getServerFromDid.js";

import { AtprotoHandleResolver } from '@atproto-labs/handle-resolver'
import { resolveTxt } from 'node:dns/promises'
import { resolveHandle } from "./utils/atproto/resolveHandleToDid.js";
import { getAtprotoUser } from "./atproto/utils/getAtprotoUser.js";

const tmp = await processSinglePost('at://did:plc:n23nyc3drnhtffhdl7yop5mj/app.bsky.feed.post/3mdixbt6qes2b')

