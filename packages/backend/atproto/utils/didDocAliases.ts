const KNOWN_PREFIXES = ['at://', 'https://', 'http://'] as const
const WAFRN_BRIDGE_HANDLE = /^([^.]+)\.at\.(.+)$/

function stripKnownPrefix(entry: string): string | undefined {
  const prefix = KNOWN_PREFIXES.find((p) => entry.startsWith(p))
  return prefix ? entry.slice(prefix.length) : undefined
}

function classifyAlias(entry: string): { type: 'handle' | 'url'; value: string } | undefined {
  const rest = stripKnownPrefix(entry)
  if (!rest) {
    return undefined
  }
  if (rest.includes('/')) {
    return { type: 'url', value: entry.startsWith('http') ? entry : `https://${rest}` }
  }
  const bridgeHandle = rest.match(WAFRN_BRIDGE_HANDLE)
  if (bridgeHandle) {
    const [, username, host] = bridgeHandle
    return { type: 'url', value: `https://${host}/fediverse/blog/${username}` }
  }
  return { type: 'handle', value: rest }
}


function getRealAtHandle(alsoKnownAs?: string[]): string | undefined {
  for (const entry of alsoKnownAs ?? []) {
    const alias = classifyAlias(entry)
    if (alias?.type === 'handle') {
      return alias.value
    }
  }
  return undefined
}

// All fediverse-blog aliases as https:// URLs, including entries published under the
// wrong shape.
function getHttpsAliases(alsoKnownAs?: string[]): string[] {
  const result: string[] = []
  for (const entry of alsoKnownAs ?? []) {
    const alias = classifyAlias(entry)
    if (alias?.type === 'url') {
      result.push(alias.value)
    }
  }
  return result
}

export { getRealAtHandle, getHttpsAliases }
