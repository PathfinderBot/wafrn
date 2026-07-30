export default function getIp(petition: any, forceNoForward = false): string {
  // Use Express's trust-proxy-aware req.ip instead of trusting the raw
  // X-Forwarded-For header directly. The raw header is always spoofable by
  // the client; req.ip only honours X-Forwarded-For for the number of proxy
  // hops configured via `app.set('trust proxy', <hops>)` (see
  // completeEnvironment.trustProxy), so this is only correct once that value
  // matches the real deployment topology (1 behind a single reverse proxy,
  // 2 behind two, etc).
  const res: string = petition.ip || petition.connection?.remoteAddress
  if (res && res.includes(',') && forceNoForward) {
    // WHAT THE FUCK HOW DID YOU DO THIS
    throw new Error('Invalid ip, ip has a comma: ' + res)
  }
  return res
}
