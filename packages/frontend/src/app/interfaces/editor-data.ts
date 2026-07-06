import { Ask } from './ask'
import { ProcessedPost } from './processed-post'
import type { SimplifiedUser } from './simplified-user'

export interface EditorData {
  scrollDate: Date
  path: string
  ask?: Ask
  post?: ProcessedPost
  quote?: ProcessedPost
  edit?: boolean
  privacy?: number
  content?: string
  mentionUser?: SimplifiedUser
}
