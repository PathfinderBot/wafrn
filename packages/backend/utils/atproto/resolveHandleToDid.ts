
import { AtprotoHandleResolverNode } from '@atproto-labs/handle-resolver-node'
import e from 'express'

const resolver = new AtprotoHandleResolverNode()


async function resolveHandle(handle: string) {
    return resolver.resolve(handle)
}

export {resolveHandle}