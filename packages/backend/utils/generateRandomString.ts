import crypto from 'crypto'

export default function generateRandomString() {
  return crypto.createHash('sha1').update(Math.random().toString()).digest('hex')
}

export function generateRandomStringInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const code = Array.from({ length: 4 }, () => {
    return Array.from({ length: 4 }, () => {
      return chars[Math.floor(Math.random() * chars.length)];
    }).join('');
  }).join('-');
  return code
}