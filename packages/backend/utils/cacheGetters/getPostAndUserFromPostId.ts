import { Op, QueryTypes } from "sequelize";
import {
  Ask,
  Emoji,
  EmojiReaction,
  Media,
  Post,
  PostTag,
  sequelize,
  User,
  UserLikesPostRelations,
} from "../../models/index.js";
import { redisCache } from "../redis.js";
import { Privacy } from "../../models/post.js";

async function getPostAndUserFromPostId(
  postId: string,
  ignoreCache?: boolean
): Promise<{ found: boolean; data?: any }> {
  const cacheResult = ignoreCache ? undefined : await redisCache.get("postAndUser:" + postId);
  let res: { found: boolean; data?: any } = cacheResult
    ? JSON.parse(cacheResult)
    : { found: false };
  if (!cacheResult) {
    const dbQuery = await Post.findOne({
      include: [
        {
          model: Ask,
        },
        {
          model: User,
          as: "user",
          required: true,
          where: {
            banned: false,
          },
        },
        {
          model: Post,
          include: [
            {
              model: User,
              as: "user",
            },
          ],
          as: "quoted",
          where: {
            isDeleted: false,
          },
          required: false,
        },
        {
          model: Post,
          as: "parent",
          required: false,
          where: {
            isDeleted: false,
          },
          include: [
            {
              model: Media,
              required: false,
            },
            {
              model: PostTag,
              required: false,
            },
          ],
        },
        {
          model: User,
          as: "mentionPost",
          required: false,
        },
        {
          model: Media,
          required: false,
        },
        {
          model: PostTag,
          required: false,
        },
        {
          model: Emoji,
          required: false,
        },
      ],
      where: {
        id: postId,
        isDeleted: false,
        privacy: {
          [Op.notIn]: [Privacy.LocalOnly],
        },
      },
    });
    if (dbQuery) {
      // check if its a bsky post because we dont enjoy bsky posts going to fedi!
      const parents = await sequelize.query(
        `
  WITH RECURSIVE ancestors AS (
    SELECT id, "parentId", "userId", content, "hierarchyLevel", "createdAt", "updatedAt"
    FROM posts
    WHERE id = :postId
    UNION ALL
    SELECT p.id, p."parentId", p."userId", p.content, p."hierarchyLevel", p."createdAt", p."updatedAt"
    FROM posts p
    INNER JOIN ancestors a ON p.id = a."parentId"
  )
  SELECT 
    a.id, a."parentId", a."userId", a.content, a."hierarchyLevel", a."createdAt", a."updatedAt",
    u.id as "user_id", u.url, u.email
  FROM ancestors a
  LEFT JOIN users u ON a."userId" = u.id
  ORDER BY a."hierarchyLevel" DESC
  `,
        {
          replacements: { postId: dbQuery.id },
          type: QueryTypes.SELECT,
          raw: true
        }
      ) as Array<any>

      const isBskyPost = parents.some((elem) => elem.isRemoteBlueskyPost);
      if (isBskyPost) {
        res = { found: false };
        return res;
      }

      let likes = UserLikesPostRelations.findAll({
        where: {
          postId: postId,
        },
      });
      let shares = Post.findAll({
        where: {
          parentId: postId,
          isReblog: true,
        },
      });
      let reacts = EmojiReaction.findAll({
        where: {
          postId: postId,
        },
      });
      Promise.all([likes, shares, reacts]);

      res = { found: true, data: { ...dbQuery.dataValues, isBskyExclusive: (await Post.findByPk(dbQuery.dataValues.id) as Post).isBskyExclusive } };
      if (res.data.ask) {
        const userAsker = await User.findByPk(res.data.ask.userAsker);
        res.data.ask.asker = userAsker;
      }
      res.data.shares = await shares;
      res.data.likes = await likes;
      res.data.reacts = await reacts;
    } else {
      res = { found: false };
    }
    if (res.found) {
      await redisCache.set(
        "postAndUser:" + postId,
        JSON.stringify(res),
        "EX",
        15
      );
    } else {
      // await redisCache.set('postAndUser:' + postId, JSON.stringify(res), 'EX', 60)
    }
  }
  return res;
}

export { getPostAndUserFromPostId };
