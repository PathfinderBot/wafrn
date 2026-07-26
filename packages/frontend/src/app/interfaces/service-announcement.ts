export interface ServiceAnnouncement {
  level: 'error' | 'info' | 'warning'
  code: string // code can be used to quickly identify the type of message, for example to take action depending on that (it can be a different depending on client: web, app, ...etc)
  message: string
}
