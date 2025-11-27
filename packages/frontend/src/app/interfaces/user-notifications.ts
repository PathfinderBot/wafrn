import { Emoji } from "./emoji";
import { ProcessedPost } from "./processed-post";

export interface UserNotifications {
  url: string;
  avatar: string;
  userUrl: string;
  userName: string;
  date: Date;
  type:
    | "MENTION"
    | "LIKE"
    | "EMOJIREACT"
    | "REWOOT"
    | "QUOTE"
    | "FOLLOW"
    | "USERBITE"
    | "POSTBITE";
  emojiReact?: Emoji;
  emojiName?: string;
  fragment?: ProcessedPost;
  userId: string;
}
