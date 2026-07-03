import {
  Model,
  Table,
  Column,
  DataType,
  ForeignKey,
  BeforeSave,
  HasMany,
  HasOne,
  BelongsToMany,
  BelongsTo,
  BeforeCreate,
  AfterCreate
} from 'sequelize-typescript'
import { Notification } from './notification.js'
import { Ask } from './ask.js'
import { QuestionPoll } from './questionPoll.js'
import { EmojiReaction } from './emojiReaction.js'
import { Emoji } from './emoji.js'
import { PostEmojiRelations } from './postEmojiRelations.js'
import { Quotes } from './quotes.js'
import { PostReport } from './postReport.js'
import { SilencedPost } from './silencedPost.js'
import { PostTag } from './postTag.js'
import { User } from './user.js'
import { Media } from './media.js'
import { PostMentionsUserRelation } from './postMentionsUserRelation.js'
import { UserLikesPostRelations } from './userLikesPostRelations.js'
import { UserBookmarkedPosts } from './userBookmarkedPosts.js'
import { PostHostView } from './postHostView.js'
import { RemoteUserPostView } from './remoteUserPostView.js'
import { FederatedHost } from './federatedHost.js'
import {
  BelongsToGetAssociationMixin,
  BelongsToManyGetAssociationsMixin,
  BelongsToManySetAssociationsMixin,
  BelongsToSetAssociationMixin,
  HasManyGetAssociationsMixin,
  HasManyRemoveAssociationsMixin,
  HasManySetAssociationsMixin,
  HasOneGetAssociationMixin,
  QueryTypes,
  Op
} from 'sequelize'
import { completeEnvironment } from '../utils/backendOptions.js'
import { sequelize } from './sequelize.js'


export const Privacy = {
  Public: 0,
  FollowersOnly: 1,
  LocalOnly: 2,
  Unlisted: 3,
  DirectMessage: 10,
  LinkOnly: 20,
  Draft: 30
} as const

export const InteractionControl = {
  Anyone: 0,
  Followers: 1,
  Following: 2,
  FollowersAndFollowing: 3,
  FollowersAndMentioned: 4,
  FollowingAndMentioned: 5,
  FollowersFollowingAndMentioned: 6,
  MentionedUsersOnly: 7,
  NoOne: 8,
  SameAsOp: 100 // this one is bsky exclusive and its gona be FUN (a headache). This only applies to REPLIES. Nothing else.
}

export type PrivacyType = (typeof Privacy)[keyof typeof Privacy]

export type InteractionControlType = (typeof InteractionControl)[keyof typeof InteractionControl]

export interface PostAttributes {
  id?: string
  createdAt?: Date
  updatedAt?: Date
  content_warning?: string | null
  content?: string
  markdownContent?: string
  title?: string
  slug?: string
  remotePostId?: string | null
  bskyUri?: string | null
  bskyCid?: string | null
  privacy?: PrivacyType
  featured?: Date | null
  isReblog?: boolean
  isDeleted?: boolean
  userId?: string
  hierarchyLevel?: number
  parentId?: string
  replyControl?: InteractionControlType
  likeControl?: InteractionControlType
  reblogControl?: InteractionControlType
  quoteControl?: InteractionControlType
  displayUrl: string | null
  detached?: boolean,
  rootId?: string | null,
  isBskyExclusive?: boolean,
  isReply?: boolean,
  language: string | undefined,
}

@Table({
  tableName: 'posts',
  modelName: 'posts',
  timestamps: true
})
export class Post extends Model<PostAttributes, PostAttributes> implements PostAttributes {
  @Column({
    primaryKey: true,
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4
  })
  declare id: string

  @Column({
    allowNull: true,
    type: DataType.STRING
  })
  declare content_warning: string

  @Column({
    allowNull: true,
    type: DataType.STRING
  })
  declare content: string

  @Column({
    allowNull: true,
    type: DataType.STRING
  })
  declare markdownContent: string

  @Column({
    allowNull: true,
    type: DataType.STRING(256)
  })
  declare title: string

  @Column({
    allowNull: true,
    type: DataType.STRING(256)
  })
  declare slug: string

  @Column({
    allowNull: true,
    type: DataType.STRING(768)
  })
  declare remotePostId: string | null

  @Column({
    allowNull: true,
    type: DataType.STRING(768)
  })
  declare bskyUri: string | null

  @Column({
    allowNull: true,
    type: DataType.STRING(768)
  })
  declare bskyCid: string | null

  @Column({
    allowNull: true,
    type: DataType.INTEGER
  })
  declare privacy: PrivacyType

  @Column({
    allowNull: true,
    type: DataType.DATE,
    defaultValue: null
  })
  declare featured: Date | null

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
    defaultValue: false
  })
  declare isReblog: boolean

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
    defaultValue: false
  })
  declare isReply: boolean

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
    defaultValue: false
  })
  declare isBskyExclusive: boolean

  @Column({
    allowNull: true,
    type: DataType.BOOLEAN,
    defaultValue: false
  })
  declare isDeleted: boolean

  @ForeignKey(() => User)
  @Column({
    allowNull: true,
    type: DataType.UUID
  })
  declare userId: string

  @Column({
    allowNull: true,
    type: DataType.INTEGER
  })
  declare hierarchyLevel: number

  @Column({
    allowNull: true,
    type: DataType.STRING
  })
  declare displayUrl: string

  @ForeignKey(() => Post)
  @Column({
    allowNull: true,
    type: DataType.UUID
  })
  declare parentId: string

  @ForeignKey(() => Post)
  @Column({
    allowNull: true,
    type: DataType.UUID
  })
  declare rootId: string | null


  @Column({
    allowNull: true,
    type: DataType.INTEGER,
    defaultValue: 0
  })
  declare replyControl: InteractionControlType

  @Column({
    allowNull: true,
    type: DataType.INTEGER,
    defaultValue: 0
  })
  declare likeControl: InteractionControlType

  @Column({
    allowNull: true,
    type: DataType.INTEGER,
    defaultValue: 0
  })
  declare reblogControl: InteractionControlType

  @Column({
    allowNull: true,
    type: DataType.INTEGER,
    defaultValue: 0
  })
  declare quoteControl: InteractionControlType

  @Column({
    allowNull: true,
    defaultValue: false,
    type: DataType.BOOLEAN
  })
  declare detached: boolean;

  @Column({
    type: DataType.STRING(3),
    allowNull: true,
    defaultValue: undefined,
  })
  declare language: string | undefined;

  @BelongsTo(() => Post, "parentId")
  declare parent: Post; declare getParent: BelongsToGetAssociationMixin<Post>;
  declare setParent: BelongsToSetAssociationMixin<Post, string>;


  @BelongsTo(() => Post, "rootId")
  declare root: Post;
  declare getRoot: BelongsToGetAssociationMixin<Post>;
  declare setRoot: BelongsToSetAssociationMixin<Post, string>;

  @HasMany(() => Post, 'parentId')
  declare children: Post[]

  async getAncestors(): Promise<Post[]> {
    // New style: recursive CTE via parentId
    const ancestorIds = await sequelize.query(
      `
        WITH RECURSIVE ancestors AS (
    SELECT "parentId" AS id
    FROM posts
    WHERE id = '${this.id}' 
      AND "rootId" = '${this.rootId}'
      AND "id" != '${this.rootId}'

    UNION ALL

    SELECT p."parentId"
    FROM posts p
    INNER JOIN ancestors a
        ON p.id = a.id
    WHERE p."parentId" IS NOT NULL
)
SELECT id
FROM ancestors;
        `,
      {
        type: QueryTypes.SELECT
      }
    ) as Array<{ id: string }>

    if (ancestorIds.length === 0) return []

    const ids = ancestorIds.map(row => row.id)
    return await Post.findAll({
      where: {
        id: {
          [Op.in]: ids
        }
      },
      order: [['hierarchyLevel', 'DESC']]
    })

  }

  async getDescendentsCustom(): Promise<Post[]> {
    // New style: recursive CTE via parentId
    const descendantIds = await sequelize.query(
      `
        WITH RECURSIVE descendants AS (
          SELECT id FROM posts WHERE "parentId" = '${this.id}'
          UNION ALL
          SELECT p.id FROM posts p
          INNER JOIN descendants d ON p."parentId" = d.id
        )
        SELECT id FROM descendants
        `,
      {
        type: QueryTypes.SELECT
      }
    ) as Array<{ id: string }>

    if (descendantIds.length === 0) return []

    const ids = descendantIds.map(row => row.id)
    return await Post.findAll({
      where: {
        id: {
          [Op.in]: ids
        }
      },
      order: [['hierarchyLevel', 'ASC']]
    })

  }

  @HasMany(() => Notification, {
    sourceKey: 'id'
  })
  declare notifications: Notification[]

  @HasOne(() => Ask, {
    sourceKey: 'id'
  })
  declare ask: Ask
  declare getAsk: HasOneGetAssociationMixin<Ask>

  @HasOne(() => QuestionPoll, {
    sourceKey: 'id'
  })
  declare questionPoll: QuestionPoll

  @HasMany(() => EmojiReaction, {
    sourceKey: 'id'
  })
  declare emojiReacions: EmojiReaction[]

  @BelongsToMany(() => Emoji, () => PostEmojiRelations)
  declare emojis: Emoji[]
  declare getEmojis: BelongsToManyGetAssociationsMixin<Emoji>

  @HasMany(() => Quotes, {
    foreignKey: 'quoterPostId'
  })
  declare quoterQuotes: Quotes[]

  @HasMany(() => Quotes, {
    foreignKey: 'quotedPostId'
  })
  declare quotedQuotes: Quotes[]

  @BelongsToMany(() => Post, () => Quotes, 'quoterPostId', 'quotedPostId')
  declare quoted: Post[]
  declare setQuoted: BelongsToManySetAssociationsMixin<Post, string>

  @BelongsToMany(() => Post, () => Quotes, 'quotedPostId', 'quoterPostId')
  declare quoter: Post[]

  @HasMany(() => PostReport, {
    sourceKey: 'id'
  })
  declare postReports: PostReport[]

  @HasMany(() => SilencedPost, {
    sourceKey: 'id'
  })
  declare silencedPosts: SilencedPost[]

  @HasMany(() => PostTag, {
    sourceKey: 'id'
  })
  declare postTags: PostTag[]
  declare getPostTags: HasManyGetAssociationsMixin<PostTag>

  @BelongsTo(() => User)
  declare user: User
  declare getUser: BelongsToGetAssociationMixin<User>

  @HasMany(() => Media, {
    sourceKey: 'id'
  })
  declare medias: Media[]
  declare setMedias: HasManySetAssociationsMixin<Media, number>
  declare getMedias: HasManyGetAssociationsMixin<Media>
  declare removeMedias: HasManyRemoveAssociationsMixin<Media, number>

  @HasMany(() => PostMentionsUserRelation, {
    sourceKey: 'id'
  })
  declare pMURs: PostMentionsUserRelation[]

  @HasMany(() => UserLikesPostRelations, {
    sourceKey: 'id'
  })
  declare userLikesPostRelations: UserLikesPostRelations[]

  @BelongsToMany(() => User, () => PostMentionsUserRelation)
  declare mentionPost: User[]
  declare getMentionPost: BelongsToManyGetAssociationsMixin<User>

  @HasMany(() => UserBookmarkedPosts, {
    sourceKey: 'id'
  })
  declare userBookmarkedPosts: UserBookmarkedPosts[]

  @HasMany(() => PostHostView, {
    sourceKey: 'id'
  })
  declare postHostViewList: PostHostView[]

  @BelongsToMany(() => FederatedHost, () => PostHostView)
  declare hostView: FederatedHost[]

  @HasMany(() => RemoteUserPostView, {
    sourceKey: 'id'
  })
  declare remoteUserPostViewList: RemoteUserPostView[]

  @BelongsToMany(() => User, () => RemoteUserPostView)
  declare view: User[]

  static get hierarchy() {
    return {
      as: 'parent',
      childrenAs: 'children',
      ancestorsAs: 'ancestors',
      descendentsAs: 'descendents',
      primaryKey: 'id',
      foreignKey: 'parentId',
      levelFieldName: 'hierarchyLevel',
      rootIdFieldName: 'rootId',
      throughKey: 'postsId',
      throughForeignKey: 'ancestorId',
    }
  }

  get hierarchy() {
    return Post.hierarchy
  }

  get fullUrl() {
    return this.remotePostId || `${completeEnvironment.frontendUrl}/fediverse/post/${this.id}`
  }

  // only use if the user is already loaded into the object, otherwise use `await isRemoteBlueskyPostAsync()`
  get isRemoteBlueskyPost() {
    return this.bskyUri && this.user.isRemoteUser && !this.remotePostId
  }

  async isRemoteBlueskyPostAsync() {
    let user = await this.getUser()
    return this.bskyUri && user.isRemoteUser && (!this.remotePostId || !this.remotePostId?.startsWith('https://bsky.brid.gy/'))
  }

  get postShouldGoFedi() {
    return this.remotePostId || !this.user.isRemoteUser
  }

  async fullUrlIncludingBsky() {
    return (
      this.remotePostId ||
      ((await this.isRemoteBlueskyPostAsync())
        ? this.bskyUri
        : `${completeEnvironment.frontendUrl}/fediverse/post/${this.id}`)
    )
  }
}