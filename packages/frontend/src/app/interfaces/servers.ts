export interface server {
  id: string
  displayName: string
  publicInbox: string
  publicKey: string
  detail: string
  blocked: boolean
  ignoreAutomatedBlocklist: boolean
  friendServer: boolean
  bubbleTimeline: boolean
}
