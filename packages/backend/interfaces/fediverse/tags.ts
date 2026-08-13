export interface fediverseTag {
  href?: string
  name?: string
  type: string
  rel?: string
  id?: string
  actor?: string
  updated?: Date
  representation?: string
  icon?: {
    mediaType: string
    url: string
    type: string
  }
  mediaType?: string
}
