import { AtprotoHandleResolverNode } from '@atproto-labs/handle-resolver-node'
import { CachedHandleResolver, HandleResolver, HandleCache } from '@atproto-labs/handle-resolver'

const sourceResolver = new AtprotoHandleResolverNode()
const resolver = new CachedHandleResolver(sourceResolver)

async function resolveHandle(handle: string, ignoreCache: boolean) {
  const res = ignoreCache ? await sourceResolver.resolve(handle) : await resolver.resolve(handle)
  return res
}

export { resolveHandle }
