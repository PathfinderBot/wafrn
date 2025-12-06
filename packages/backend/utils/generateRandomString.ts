import crypto from 'crypto'

export default function generateRandomString() {
  return crypto.createHash('sha1').update(Math.random().toString()).digest('hex')
}

export function generateRandomStringInviteCode() {
  return `${crypto.randomBytes(1).toString('hex')}-${crypto.randomBytes(1).toString('hex')}-${crypto.randomBytes(1).toString('hex')}-${crypto.randomBytes(1).toString('hex')}`
}