import {
  Model,
  Table,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  BelongsToMany,
  BelongsTo,
} from "sequelize-typescript";
import { MfaDetails } from "./mfaDetails.js";
import { Notification } from "./notification.js";
import { Ask } from "./ask.js";
import { QuestionPollAnswer } from "./questionPollAnswer.js";
import { EmojiReaction } from "./emojiReaction.js";
import { UserOptions } from "./userOptions.js";
import { PushNotificationToken } from "./pushNotificationToken.js";
import { Emoji } from "./emoji.js";
import { UserEmojiRelation } from "./userEmojiRelation.js";
import { Follows } from "./follows.js";
import { Blocks } from "./blocks.js";
import { Mutes } from "./mutes.js";
import { ServerBlock } from "./serverBlock.js";
import { PostReport } from "./postReport.js";
import { SilencedPost } from "./silencedPost.js";
import { FederatedHost } from "./federatedHost.js";
import { Post } from "./post.js";
import { Media } from "./media.js";
import { PostMentionsUserRelation } from "./postMentionsUserRelation.js";
import { UserBitesPostRelation } from "./userBitesPostRelation.js";
import { UserLikesPostRelations } from "./userLikesPostRelations.js";
import { UserBookmarkedPosts } from "./userBookmarkedPosts.js";
import { RemoteUserPostView } from "./remoteUserPostView.js";
import {
  BelongsToGetAssociationMixin,
  BelongsToManyAddAssociationMixin,
  BelongsToManyGetAssociationsMixin,
  BelongsToManyRemoveAssociationMixin,
  BelongsToManyRemoveAssociationsMixin,
  BelongsToManySetAssociationsMixin,
  HasManyGetAssociationsMixin,
  HasManyRemoveAssociationMixin,
} from "sequelize";
import { Col } from "sequelize/lib/utils";
import { UserFollowHashtags } from "./userFollowHashtag.js";
import { completeEnvironment } from "../utils/backendOptions.js";
import { Bites } from "./bites.js";

export interface UserAttributes {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
  email?: string | null;
  description?: string;
  descriptionMarkdown?: string;
  name?: string;
  url: string;
  NSFW?: boolean;
  avatar?: string;
  password?: string;
  birthDate?: Date;
  activated?: boolean | null;
  requestedPasswordReset?: Date | null;
  activationCode?: string;
  registerIp?: string;
  lastLoginIp?: string;
  lastTimeNotificationsCheck?: Date;
  privateKey?: string | null;
  publicKey?: string | null;
  federatedHostId?: string | null;
  remoteInbox?: string | null;
  remoteId?: string | null;
  remoteMentionUrl?: string | null;
  isBot?: boolean;
  banned?: boolean | null;
  role?: number;
  manuallyAcceptsFollows?: boolean;
  headerImage?: string;
  followersCollectionUrl?: string | null;
  followingCollectionUrl?: string | null;
  followerCount?: number;
  followingCount?: number;
  disableEmailNotifications?: boolean;
  enableBsky?: boolean;
  bskyAuthData?: string | null;
  bskyAppPassword?: string | null;
  bskyDid?: string | null;
  lastActiveAt?: Date;
  hideFollows?: Boolean;
  hideProfileNotLoggedIn?: Boolean;
  emailVerified: Boolean | null;
  selfDeleted: Boolean | null;
  userMigratedTo: String | null;
  bskyInviteCode: String | null;
  displayUrl: String | null;
  isBskyPrimary: Boolean | null;
  alternateUrl: String | null;
}

@Table({
  tableName: "users",
  modelName: "users",
  timestamps: true,
  scopes: {
    full: {
      //attributes: {}
    },
  },
  defaultScope: {
    attributes: {
      exclude: [
        "password",
        "email",
        "privateKey",
        "lastLoginIp",
        "registerIp",
        "bskyAuthData",
        "bskyAppPassword",
        "birthDate",
        "bskyInviteCode",
      ],
    },
  },
})
export class User
  extends Model<UserAttributes, UserAttributes>
  implements UserAttributes {
  @Column({
    primaryKey: true,
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({
    allowNull: true,
    type: DataType.STRING(768),
  })
  declare email: string | null;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare description: string;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare descriptionMarkdown: string;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare name: string;

  @Column({
    type: DataType.STRING(768),
  })
  declare url: string;

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare NSFW: boolean;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare avatar: string;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare password: string;

  @Column({
    allowNull: true,
    type: DataType.DATE,
  })
  declare birthDate: Date;

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
  })
  declare activated: boolean | null;

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
  })
  declare emailVerified: boolean | null;

  @Column({
    allowNull: true,
    type: DataType.DATE,
  })
  declare requestedPasswordReset: Date | null;

  @Column({
    allowNull: true,
    type: DataType.STRING(255),
  })
  declare activationCode: string;

  @Column({
    allowNull: true,
    type: DataType.STRING(255),
  })
  declare registerIp: string;

  @Column({
    allowNull: true,
    type: DataType.STRING(255),
  })
  declare lastLoginIp: string;

  @Column({
    type: DataType.DATE,
    defaultValue: new Date(0),
  })
  declare lastTimeNotificationsCheck: Date;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare privateKey: string | null;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare publicKey: string | null;

  @ForeignKey(() => FederatedHost)
  @Column({
    allowNull: true,
    type: DataType.UUID,
  })
  declare federatedHostId: string | null;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare remoteInbox: string | null;

  @Column({
    allowNull: true,
    type: DataType.STRING(768),
  })
  declare remoteId: string | null;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare remoteMentionUrl: string | null;

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare isBot: boolean;

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare banned: boolean | null;

  @Column({
    allowNull: true,
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare role: number;

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare manuallyAcceptsFollows: boolean;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare headerImage: string;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare followersCollectionUrl: string | null;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare followingCollectionUrl: string | null;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare bskyInviteCode: string;

  @Column({
    allowNull: true,
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare followerCount: number;

  @Column({
    allowNull: true,
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare followingCount: number;

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare disableEmailNotifications: boolean;

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare enableBsky: boolean;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare bskyAuthData: string | null;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare bskyAppPassword: string | null;

  @Column({
    allowNull: true,
    type: DataType.STRING(768),
  })
  declare bskyDid: string | null;

  @Column({
    allowNull: true,
    type: DataType.DATE,
    defaultValue: new Date(0),
  })
  declare lastActiveAt: Date;

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare hideFollows: Boolean;

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare hideProfileNotLoggedIn: Boolean;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare displayUrl: string;

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
  })
  declare isBskyPrimary: boolean | null;

  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  declare alternateUrl: string | null;

  @HasMany(() => MfaDetails, {
    sourceKey: "id",
  })
  declare mfaDetails: MfaDetails[];

  @HasMany(() => Notification, {
    foreignKey: "notifiedUserId",
  })
  declare incomingNotifications: Notification[];

  @HasMany(() => Notification, {
    foreignKey: "userId",
  })
  declare outgoingNotifications: Notification[];

  @HasMany(() => Ask, {
    foreignKey: "userAsker",
  })
  declare userAsker: Ask[];

  @HasMany(() => Ask, {
    foreignKey: "userAsked",
  })
  declare userAsked: Ask[];

  @HasMany(() => Bites, {
    foreignKey: "biterId",
  })
  declare hasBitten: Bites[];

  @HasMany(() => Bites, {
    foreignKey: "bittenId",
  })
  declare bittenBy: Bites[];

  @HasMany(() => QuestionPollAnswer, {
    sourceKey: "id",
  })
  declare questionPollAnswers: QuestionPollAnswer[];

  @HasMany(() => EmojiReaction, {
    sourceKey: "id",
  })
  declare emojiReacions: EmojiReaction[];

  @HasMany(() => UserOptions, {
    sourceKey: "id",
  })
  declare userOptions: UserOptions[];

  @HasMany(() => PushNotificationToken, {
    sourceKey: "id",
  })
  declare pushNotificationTokens: PushNotificationToken[];

  @BelongsToMany(() => Emoji, () => UserEmojiRelation)
  declare emojis: Emoji[];
  declare setEmojis: BelongsToManySetAssociationsMixin<Emoji, string>;
  declare removeEmojis: BelongsToManyRemoveAssociationsMixin<Emoji, string>;

  @HasMany(() => Follows, {
    foreignKey: "followerId",
  })
  declare followerFollows: Follows[];

  @HasMany(() => Follows, {
    foreignKey: "followedId",
  })
  declare followedFollows: Follows[];

  @BelongsToMany(() => User, () => Follows, "followedId", "followerId")
  declare follower: User[];
  declare getFollower: BelongsToManyGetAssociationsMixin<User>;
  declare removeFollower: BelongsToManyRemoveAssociationMixin<User, string>;

  @BelongsToMany(() => User, () => Follows, "followerId", "followedId")
  declare followed: User[];
  declare getFollowed: BelongsToManyGetAssociationsMixin<User>;
  declare removeFollowed: BelongsToManyRemoveAssociationMixin<User, string>;

  @HasMany(() => Blocks, {
    foreignKey: "blockerId",
  })
  declare blockerBlocks: Blocks[];

  @HasMany(() => Blocks, {
    foreignKey: "blockedId",
  })
  declare blockedBlocks: Blocks[];

  @BelongsToMany(() => User, () => Blocks, "blockedId", "blockerId")
  declare blocker: User[];
  declare addBlocker: BelongsToManyAddAssociationMixin<User, string>;
  declare removeBlocker: BelongsToManyRemoveAssociationMixin<User, string>;

  @BelongsToMany(() => User, () => Blocks, "blockerId", "blockedId")
  declare blocked: User[];

  @HasMany(() => Mutes, {
    foreignKey: "muterId",
  })
  declare muterMutes: Mutes[];

  @HasMany(() => Mutes, {
    foreignKey: "mutedId",
  })
  declare mutedMutes: Mutes[];

  @BelongsToMany(() => User, () => Mutes, "mutedId", "muterId")
  declare muter: User[];
  declare addMuter: BelongsToManyAddAssociationMixin<User, string>;
  declare removeMuter: BelongsToManyRemoveAssociationMixin<User, string>;

  @BelongsToMany(() => User, () => Mutes, "muterId", "mutedId")
  declare muted: User[];

  @HasMany(() => ServerBlock, {
    sourceKey: "id",
  })
  declare serverBlocks: ServerBlock[];

  @HasMany(() => PostReport, {
    sourceKey: "id",
  })
  declare postReports: PostReport[];

  @HasMany(() => SilencedPost, {
    sourceKey: "id",
  })
  declare silencedPosts: SilencedPost[];

  @BelongsTo(() => FederatedHost, {
    foreignKey: {
      name: "federatedHostId",
      allowNull: true,
    },
  })
  declare federatedHost: FederatedHost;
  declare getFederatedHost: BelongsToGetAssociationMixin<FederatedHost>;

  @HasMany(() => Post, {
    sourceKey: "id",
  })
  declare posts: Post[];
  declare getPosts: HasManyGetAssociationsMixin<Post>;

  @HasMany(() => Media, {
    sourceKey: "id",
  })
  declare medias: Media[];

  @HasMany(() => PostMentionsUserRelation, {
    sourceKey: "id",
  })
  declare pMURs: PostMentionsUserRelation[];

  @BelongsToMany(() => Post, () => PostMentionsUserRelation)
  declare mentionPost: Post[];

  @HasMany(() => UserBitesPostRelation, {
    sourceKey: "id",
  })
  declare userBitesPostRelation: UserBitesPostRelation[];
  declare getUserBitesPostRelation: HasManyGetAssociationsMixin<UserBitesPostRelation>;

  @HasMany(() => UserLikesPostRelations, {
    sourceKey: "id",
  })
  declare userLikesPostRelations: UserLikesPostRelations[];
  declare getUserLikesPostRelations: HasManyGetAssociationsMixin<UserLikesPostRelations>;

  @HasMany(() => UserBookmarkedPosts, {
    sourceKey: "id",
  })
  declare userBookmarkedPosts: UserBookmarkedPosts[];
  declare getUserBookmarkedPosts: HasManyGetAssociationsMixin<UserBookmarkedPosts>;

  @HasMany(() => RemoteUserPostView, {
    sourceKey: "id",
  })
  declare remoteUserPostViewList: RemoteUserPostView[];

  @HasMany(() => UserFollowHashtags, {
    sourceKey: "id",
  })
  declare userFollowedHashtagList: UserFollowHashtags[];

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare selfDeleted: boolean;

  @Column({
    allowNull: true,
    type: DataType.STRING(768),
  })
  declare userMigratedTo: string;

  get isRemoteUser() {
    return !!this.url.startsWith("@");
  }

  get isLocalUser() {
    return !this.isRemoteUser;
  }

  get isBlueskyUser() {
    return !!(this.url.split("@").length == 2 && this.bskyDid);
  }

  get isFediverseUser() {
    return !!(this.url.split("@").length == 3 && this.remoteId);
  }

  // the username part of the handle, without the domain for both bsky and fedi
  get shortHandle() {
    if (this.isBlueskyUser) return this.url.split("@")[1].split(".")[0];

    if (this.isFediverseUser) return this.url.split("@")[1];

    return this.url;
  }

  // the username part of the handle. For bluesky also includes the domain, but for fedi it doesn't
  get longHandle() {
    if (this.isBlueskyUser || this.isFediverseUser)
      return this.url.split("@")[1];

    return this.url;
  }

  // the full handle regardless if it's a local user or not. Fedi format for local users and fedi users; Bsky format for bsky users
  get fullHandle() {
    return this.isRemoteUser
      ? this.url
      : `@${this.url}@${completeEnvironment.instanceUrl}`;
  }

  get fullUrl() {
    return (
      this.remoteId || `${completeEnvironment.frontendUrl}/blog/${this.url}`
    );
  }

  get fullFediverseUrl() {
    return this.isRemoteUser
      ? this.remoteId
      : `${completeEnvironment.frontendUrl}/fediverse/blog/${this.url}`;
  }

  get avatarFullUrl() {
    return this.isRemoteUser
      ? this.avatar
      : `${completeEnvironment.mediaUrl}${this.avatar}`;
  }

  get headerImageFullUrl() {
    return this.isRemoteUser
      ? this.headerImage
      : `${completeEnvironment.mediaUrl}${this.headerImage}`;
  }
}

export function getLocalUsernameFromLocalRemoteId(remoteId: string) {
  return remoteId
    .split(`${completeEnvironment.instanceUrl}/fediverse/blog/`)[1]
    .split("@")[0];
}

export function isLocalRemoteId(remoteId: string) {
  return remoteId.startsWith(completeEnvironment.frontendUrl);
}

export interface HandleData {
  username: string;
  handle: string;
  domain: string;
  type: "fediverse" | "bluesky" | "local";
}

export function splitHandle(handleString: string): HandleData {
  handleString = handleString.trim();
  if (handleString.startsWith("@") && handleString.length > 3) {
    const userData = handleString.split("@");
    if (userData.length === 3 && userData[0] == "") {
      const username = userData[1];
      const domain = userData[2];
      return {
        handle: handleString,
        username: username,
        domain: domain,
        type: "fediverse",
      };
    } else if (userData.length === 2 && userData[0] == "") {
      const handle = userData[1];
      const elements = handle.split(".");
      const username = elements.shift() as string;
      const domain = elements.join(".");
      return {
        handle: handle,
        username: username,
        domain: domain,
        type: "bluesky",
      };
    }
  }
  return {
    username: handleString,
    handle: handleString,
    domain: completeEnvironment.instanceUrl,
    type: "local",
  };
}

export function addHandlePrefix(handle: string) {
  return handle.startsWith("@") ? handle : `@${handle}`;
}
