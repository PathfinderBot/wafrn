
import { AtprotoHandleResolverNode } from '@atproto-labs/handle-resolver-node'

const resolver = new AtprotoHandleResolverNode()


async function resolveHandle(handle: string, ignoreCache: boolean) {
    return resolver.resolve(handle)
}

export {resolveHandle}