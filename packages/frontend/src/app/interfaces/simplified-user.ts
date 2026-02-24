import { Emoji } from './emoji'

export interface SimplifiedUser {
  avatar: string
  url: string
  name: string
  nameMarkdown?: string
  id: string
  remoteId?: string
  description?: string
  emojis?: Emoji[]
  isBot?: boolean
  email?: string
  registerIp?: string
  bskyDid?: string
  pronouns?: string
}
