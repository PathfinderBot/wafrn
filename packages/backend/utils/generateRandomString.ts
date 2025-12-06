import crypto from 'crypto'

export default function generateRandomString() {
  return crypto.createHash('sha2').update(Math.random().toString()).digest('hex')
}

export function generateRandomStringInviteCode() {
  return `${crypto.randomBytes(2).toString('hex')}-${crypto.randomBytes(2).toString('hex')}-${crypto.randomBytes(2).toString('hex')}-${crypto.randomBytes(2).toString('hex')}`
}