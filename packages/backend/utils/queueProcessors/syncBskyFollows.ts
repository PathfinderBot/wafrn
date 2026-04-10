
import { Job } from "bullmq"
import { getAdminUser } from "../getAdminAndDeletedUser.js";
import { Blocks, Follows, sequelize, User } from "../../models/index.js";
import { Op } from "sequelize";
import { forcePopulateUsers } from "../../atproto/utils/getAtprotoUser.js";
import { getAdminAtprotoSession } from "../atproto/getAdminAtprotoSession.js";
import { logger } from "../logger.js";
import { getAtProtoSession } from "../../atproto/utils/getAtProtoSession.js";
import { getServerFromDid } from "../atproto/getServerFromDid.js";
import getUserAgent from "../getUserAgent.js";


async function syncBskyFollowsJob(job: Job) {
    const userId = job.data.userId
    const user = await User.scope('full').findByPk(userId)
    if (user && user.bskyDid) {
        const agent = await getAdminAtprotoSession()
        let followersDids: string[] = []
        let followersResponse = await agent.getFollowers({ actor: user.bskyDid, limit: 100 })
        while (followersResponse.data.followers.length > 0) {
            followersDids = followersDids.concat(followersResponse.data.followers.map((elem) => elem.did))
            if (followersResponse.data.cursor) {
                followersResponse = await agent.getFollowers({ actor: user.bskyDid, cursor: followersResponse.data.cursor })
            } else {
                break
            }
        }
        await forcePopulateUsers(followersDids, await getAdminUser())
        const createFollowersTransaction = await sequelize.transaction()

        const followers = await User.findAll({
            transaction: createFollowersTransaction,
            where: {
                bskyDid: {
                [Op.in]: followersDids
                },
                id: {
                    [Op.notIn]: sequelize.literal(`(SELECT "followerId" FROM "follows" WHERE "followedId"='${user.id}')`)
                }
            }
        })
        try {
            await Follows.bulkCreate(
                followers.map(follower => {
                    return {
                        followerId: follower.id,
                        followedId: userId,
                        muteQuotes: false,
                        muteRewoots: false,
                        accepted: true
                    }
                }),
                {transaction: createFollowersTransaction}
            )
            await createFollowersTransaction.commit()
        } catch(error: any) {
            logger.debug({
                message: `Error while trying to sync bsky followers of ${user.url}`,
                error: error
            })
            await createFollowersTransaction.rollback()
        }
        

        let followingDids: string[] = []
        let followingResponse = await agent.getFollows({ actor: user.bskyDid })
        while (followingResponse.data.follows.length > 0) {
            followingDids = followingDids.concat(followingResponse.data.follows.map((elem) => elem.did))
            if (followingResponse.data.cursor) {
                followingResponse = await agent.getFollows({ actor: user.bskyDid, cursor: followingResponse.data.cursor })
            } else {
                break
            }
        }

        await forcePopulateUsers(followingDids, await getAdminUser())
        const wafrnOnlyFollowsToAddToBsky = await Follows.findAll({
            include: [
                {
                    model: User,
                    as: 'followed',
                    required: true,
                    where: {
                        bskyDid: {
                            [Op.ne]: null
                        }
                    }
                }
            ],
            where: {
                followerId: user.id,
            }
        })
        const didsToForceFollow = wafrnOnlyFollowsToAddToBsky.map(elem => elem.followed.bskyDid).filter(elem => !followingDids.includes(elem as string))
        if(user.email && didsToForceFollow.length > 0) {
            const userAgent = await getAtProtoSession(user)
            for await (const did of didsToForceFollow) {
                await userAgent.follow(did as string)
            }
        }
        const createFollowingTransaction = await sequelize.transaction()
        const newFollowsToCreate = await User.findAll({
            transaction: createFollowingTransaction,
            where: {
                bskyDid: {
                    [Op.in]: followingDids
                },
                id: {
                        [Op.notIn]: sequelize.literal(`(SELECT "followedId" FROM "follows" WHERE "followerId"='${user.id}')`)
                    }
            }
        })
        try {
            await Follows.bulkCreate(
                newFollowsToCreate.map(newFollow => {
                    return {
                        followedId: newFollow.id,
                        followerId: userId,
                        muteQuotes: false,
                        muteRewoots: false,
                        accepted: true
                    }
                }),
                {
                    transaction: createFollowingTransaction
                }
            )
            await createFollowingTransaction.commit()
        } catch(error) {
            logger.debug({
                message: `Error while trying to sync bsky following by ${user.url}`,
                error: error
            })
            await createFollowingTransaction.rollback()
        }
    // blocks
    const blockedDids: string[] = []
    const pds = await getServerFromDid(user.bskyDid, true)
    let remainingBlocks = 100;
    let url = pds + `/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(user.bskyDid)}&collection=app.bsky.graph.block&limit=100&reverse=false`
    while(remainingBlocks != 0) {
            const blocksResponse = await (await fetch(url, {
                headers: {
                    "User-Agent": getUserAgent('ATProtoWorker')
                }
            })).json()
            // do things
            if(blocksResponse.records.length) {
                blocksResponse.records.forEach((element: any) => {
                    blockedDids.push(element.value.subject)
                });
            }
            url = pds + `/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(user.bskyDid)}&collection=app.bsky.graph.block&limit=100&reverse=false&cursor=${blocksResponse.cursor}`
            remainingBlocks = blocksResponse.records.length
            if(!blocksResponse.cursor) {
                remainingBlocks = 0;
            }
    }
    await forcePopulateUsers(blockedDids, await getAdminUser())
    const createBlocksTransaction = await sequelize.transaction()
    const usersToBlock = await User.findAll({
            transaction: createBlocksTransaction,
            where: {
                bskyDid: {
                [Op.in]: blockedDids
                },
                id: {
                    [Op.notIn]: sequelize.literal(`(SELECT "blockedId" FROM "blocks" WHERE "blockerId"='${user.id}')`)
                }
            }
        })
    try {
        await Blocks.bulkCreate(
                usersToBlock.map(newBlock => {
                    return {
                        blockedId: newBlock.id,
                        blockerId: userId,
                    }
                }),
                {
                    transaction: createBlocksTransaction
                }
            )
            await createBlocksTransaction.commit()
    } catch (error) {
        logger.debug({
            message: `Error while trying to sync bsky blocks by ${user.url}`,
            error: error
        })
        await createBlocksTransaction.rollback()
    }


    }
}


export { syncBskyFollowsJob }