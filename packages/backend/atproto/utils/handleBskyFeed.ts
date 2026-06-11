/**
 * Given that the current aproach is prone to failure with the atproto worker....
 * what if we got these things on demand?
 * This is an EXPERIMENT
 */

import { Op } from "sequelize";
import { Post, User } from "../../models/index.js";
import { completeEnvironment } from "../../utils/backendOptions.js";
import { logger } from "../../utils/logger.js";
import { getAtProtoSession } from "./getAtProtoSession.js";
import { processSinglePost } from "./getAtProtoThread.js";

async function handleBskyFeed(user: User, cursor: Date) {

    try {
        const session = await getAtProtoSession(user)
        const bskyFeed = await session.getTimeline({
            limit: completeEnvironment.postsPerPage,
            cursor: cursor.toISOString(),
        })
        const postsFound = (await Post.findAll({
            where: {
                bskyUri: {
                    [Op.in]: bskyFeed.data.feed.map(elem => elem.post.uri)
                }
            }
        })).map(elem => elem.bskyUri)
        const filteredFeed = bskyFeed.data.feed.filter(elem => !postsFound.includes(elem.post.uri))
        await Promise.allSettled(filteredFeed.map(elem => processSinglePost(elem.post.uri)))
        for await (const elem of filteredFeed) {
            if (elem.reason && elem.reason.$type === 'app.bsky.feed.defs#reasonRepost' && elem.reason) {
                const parentPost = await processSinglePost(elem.post.uri)
                const rewooterDid = (elem.reason as any).by?.did
                if (parentPost && rewooterDid) {
                    const rewooter = await User.findOne({
                        where: {
                            bskyDid: rewooterDid
                        }
                    })
                    if (rewooter) {
                        const creation = await Post.findOrCreate({
                            where: {
                                userId: rewooter.id,
                                isReblog: true,
                                parentId: parentPost,
                                bskyCid: (elem.reason as any).cid,
                                bskyUri: (elem.reason as any).uri
                            },
                            defaults: {
                                userId: rewooter.id,
                                isReblog: true,
                                parentId: parentPost,
                                bskyCid: (elem.reason as any).cid,
                                bskyUri: (elem.reason as any).uri,
                                createdAt: (elem.reason as any).indexedAt,
                                updatedAt: new Date(),
                                content: '',
                                content_warning: '',
                                privacy: 0,
                                rootId: (await Post.findByPk(parentPost))?.rootId,

                            }
                        })
                    }
                }
            }

        }
    } catch (error) {
        logger.info({
            message: `Error processing bsky feed`,
            user: user.url,
            error: error
        })
    }



}


export { handleBskyFeed }