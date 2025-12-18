import { Emoji } from "./emoji";
import { FederatedHost } from "./federatedHost";
import { PublicOption } from "./publicOption";

export interface BlogDetails {
  id: string;
  url: string;
  name: string;
  nameMarkdown: string;
  createdAt: string;
  description: string;
  descriptionMarkdown: string;
  remoteId: string;
  isBot: boolean;
  isAdmin: boolean;
  avatar: string;
  bskyDid?: string;
  federatedHostId: string;
  headerImage: string;
  followingCount: number;
  followerCount: number;
  manuallyAcceptsFollows: boolean;
  emojis: Emoji[];
  federatedHost?: FederatedHost;
  muted: boolean;
  migratedTo?: string;
  blocked: boolean;
  serverBlocked: boolean;
  followed: number;
  followers: number;
  publicOptions: PublicOption[];
  postCount: number;
  isBlueskyUser: boolean;
  disableEmailNotifications: boolean; // do not worry the backend checks if the user asking is you or not
  hideFollows: boolean;
  hideProfileNotLoggedIn: boolean;
  displayUrl?: string;
}
