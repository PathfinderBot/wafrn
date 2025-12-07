import { col, fn, literal, Op } from "sequelize";
import {
  Bites,
  EmojiReaction,
  Follows,
  Notification,
  Post,
  PostAncestor,
  User,
} from "../../models/index.js";
import { wait } from "../wait.js";
import sendEmail from "../sendEmail.js";
import getBlockedIds from "../cacheGetters/getBlockedIds.js";
import { getMutedPosts } from "../cacheGetters/getMutedPosts.js";
import { getNotificationOptions } from "../../routes/notifications.js";
import { completeEnvironment } from "../backendOptions.js";

async function sendMail() {
  const startOfYear = new Date(new Date().getFullYear(), 0, 1);

  const users = await User.scope("full").findAll({
    where: {
      banned: { [Op.ne]: true },
      activated: true,
      disableEmailNotifications: false,
      updatedAt: {
        [Op.gte]: startOfYear
      },
      email: {
        [Op.ne]: null,
      },
    },
    order: [["createdAt", "ASC"]],
  });

  const allUsers = await User.findAll({
    where: {
      email: {
        [Op.ne]: null,
      },
      banned: { [Op.ne]: true },
      activated: true,
      updatedAt: {
        [Op.gte]: startOfYear,
      },
    },
    order: [["createdAt", "DESC"]],
  });

  const allUserIds = allUsers.map((user) => user.id);

  const allUserCounts = (await Post.findAll({
    attributes: [
      "userId",
      [fn("COUNT", col("id")), "postCount"],
      [literal('SUM(CASE WHEN "isReblog" THEN 1 ELSE 0 END)'), "reblogCount"],
    ],
    where: {
      createdAt: {
        [Op.gte]: startOfYear,
      },
      userId: {
        [Op.in]: allUserIds,
      },
    },
    group: ["userId"],
    raw: true,
  })) as any as { userId: string; postCount: string; reblogCount: string }[];

  for await (const user of users) {
    if (!user.email) {
      continue;
    }

    const blockedUsers = await getBlockedIds(user.id, false);
    const startCountDate = user?.lastTimeNotificationsCheck;
    const mutedPostIds = (await getMutedPosts(user.id)).concat(
      await getMutedPosts(user.id, true)
    );

    const currentUserCounts = (await Post.findOne({
      attributes: [
        "userId",
        [fn("COUNT", col("id")), "postCount"],
        [literal('SUM(CASE WHEN "isReblog" THEN 1 ELSE 0 END)'), "reblogCount"],
      ],
      where: {
        createdAt: {
          [Op.gte]: startOfYear,
        },
        userId: user.id,
      },
      group: ["userId"],
      raw: true,
    })) as any as { userId: string; postCount: string; reblogCount: string };

    const allUserPosts = await Post.findAll({
      where: {
        createdAt: {
          [Op.gte]: startOfYear,
        },
        userId: user.id,
      },
      order: [["createdAt", "DESC"]],
    });

    const postQuotesRewootsAncestors = await PostAncestor.findAll({
      where: {
        ancestorId: {
          [Op.in]: allUserPosts.map((x) => x.id),
        },
      },
      include: ["post", "ancestor"]
    });

    const posts = currentUserCounts ? parseInt(currentUserCounts.postCount) : 0;
    const rewoots = currentUserCounts
      ? parseInt(currentUserCounts.reblogCount)
      : 0;

    const postQuotesRewoots = postQuotesRewootsAncestors.map(x => x.post)

    const postQuotesRewoots2 = Object.groupBy(
      postQuotesRewoots,
      ({ id }) =>
        postQuotesRewootsAncestors.find((x) => x.postsId === id)?.ancestorId ??
        ""
    );

    const postQuotesRewoots3 = Object.keys(postQuotesRewoots2).map((x) => ({
      parentId: x,
      rewoots: postQuotesRewoots2[x]?.filter((x) => x.isReblog).length ?? 0,
      quotes: postQuotesRewoots2[x]?.filter((x) => !x.isReblog).length ?? 0,
    }));

    const mostRewootedPosts = postQuotesRewoots3.sort(
      (a, b) => b.rewoots - a.rewoots
    );
    const mostQuotedPosts = postQuotesRewoots3.sort(
      (a, b) => b.quotes - a.quotes
    );

    console.log(mostQuotedPosts);

    const mostReactedPostsReaction = await EmojiReaction.findAll({
      where: {
        postId: {
          [Op.in]: allUserPosts.map((x) => x.id),
        },
      },
      include: ["post"]
    });

    const mostReactedPosts = (
      await Post.findAll({
        where: {
          id: {
            [Op.in]: mostReactedPostsReaction.map((x) => x.postId),
          },
        },
      })
    )
      .map((x) => ({
        postId: x.id,
        reactions: mostReactedPostsReaction.filter((y) => y.postId === x.id),
      }))
      .sort((a, b) => b.reactions.length - a.reactions.length);

    const mostRepliedPosts = (
      (await Post.findAll({
        attributes: ["parentId", [fn("COUNT", col("parentId")), "replyCount"]],
        where: {
          parentId: {
            [Op.in]: allUserPosts.map((x) => x.id),
          },
          userId: {
            [Op.ne]: user.id,
          },
          hierarchyLevel: {
            [Op.gt]: 0,
          },
        },
        group: ["parentId"],
        raw: true,
      })) as any as { parentId: string; replyCount: string }[]
    )
      .map((x) => ({
        ...x,
        replyCount: parseInt(x.replyCount),
      }))
      .sort((a, b) => b.replyCount - a.replyCount);

    const yearFollows = await Follows.findAndCountAll({
      where: {
        followerId: user.id,
        createdAt: {
          [Op.gte]: startOfYear,
        },
      },
    });

    const yearFollowers = await Follows.findAndCountAll({
      where: {
        followedId: user.id,
        createdAt: {
          [Op.gte]: startOfYear,
        },
      },
    });

    const yearBitens = (await Bites.findAll({
      attributes: ["biterId", "biter", [fn("COUNT", col("biterId")), "biteCount"]],
      where: {
        bittenId: user.id
      },
      group: ["biterId"],
      include: ["biter"],
      order: [
        ["biteCount", "DESC"]
      ]
    })).map(x => ({
      ...x,
      biteCount: Number.parseInt((x as any).biteCount)
    }))

    const yearBites = (await Bites.findAll({
      attributes: ["bittenId", "bitten", [fn("COUNT", col("bittenId")), "bittenCount"]],
      where: {
        biterId: user.id
      },
      group: ["bittenId"],
      include: ["bitten"],
      order: [
        ["bittenCount", "DESC"]
      ]
    })).map(x => ({
      ...x,
      bittenCount: Number.parseInt((x as any).bittenCount)
    }))

    const notificationsCount = await Notification.count({
      where: {
        notifiedUserId: user.id,
        [Op.or]: [await getNotificationOptions(user.id)],
        postId: {
          [Op.or]: [
            {
              [Op.notIn]: mutedPostIds?.length
                ? mutedPostIds
                : ["00000000-0000-0000-0000-000000000000"],
            },
            {
              [Op.eq]: null,
            },
          ],
        },
        userId: {
          [Op.notIn]: blockedUsers.concat([user.id]),
        },
        createdAt: {
          [Op.gt]: startCountDate,
        },
      },
    });
    // Modify before sending the email!
    const subject = `Hello ${user.url}, get WAFfed`;
    const body = `\
    <h1>Hello ${user.url}, We miss you at <a href="${completeEnvironment.frontendUrl
      }">wafrn</a>!</h1>
    <p>As you can see, other people also misses you, as you have ${notificationsCount} unread notifications!</p>
    ${notificationsCount == 0
        ? "<p>Hmm, no notifications. I guess you should get more oomfs</p>"
        : ""
      }
    <br />
    <p>Ok ok let's do this, here's your waffed for the year ${new Date().getFullYear()}</p>
    <p>Of course a wrapped isn't complete with your initial stats, and because of that:</p>
    <p>You wooted ${posts} woots on this year, that's ${calcPercentile(
        posts,
        allUserCounts.map((x) => x.postCount)
      )}% more than others!</p>
    <p>Also you rewooted ${rewoots} woots on this year, that's ${calcPercentile(
        rewoots,
        allUserCounts.map((x) => x.reblogCount)
      )}% more than others!</p>
    <p>You got followed by ${yearFollowers.count
      } people on this year, and you followed ${yearFollows.count
      } people on this year!</p>
    <p>You biten ${yearBites.map(x => x.bittenCount).reduce((p, c) => p + c, 0)}
      people on this year, especially <a href=${new URL(
        `/user/${yearBites[0].bitten.url}`,
        completeEnvironment.frontendUrl
      )}>${yearBites[0].bitten.url}</a> with ${yearBites[0].bittenCount} bites, 
      <a href=${new URL(
        `/user/${yearBites[1].bitten.url}`,
        completeEnvironment.frontendUrl
      )}>${yearBites[1].bitten.url}</a> with ${yearBites[1].bittenCount} bites, and
      <a href=${new URL(
        `/user/${yearBites[2].bitten.url}`,
        completeEnvironment.frontendUrl
      )}>${yearBites[2].bitten.url}</a> with ${yearBites[2].bittenCount} bites.
    </p>
    <p>You got bitten by ${yearBitens.map(x => x.biteCount).reduce((p, c) => p + c, 0)}
      people on this year, especially <a href=${new URL(
        `/user/${yearBitens[0].biter.url}`,
        completeEnvironment.frontendUrl
      )}>${yearBitens[0].biter.url}</a> with ${yearBitens[0].biteCount} bites, 
      <a href=${new URL(
        `/user/${yearBitens[1].biter.url}`,
        completeEnvironment.frontendUrl
      )}>${yearBitens[1].biter.url}</a> with ${yearBitens[1].biteCount} bites, and
      <a href=${new URL(
        `/user/${yearBitens[2].biter.url}`,
        completeEnvironment.frontendUrl
      )}>${yearBitens[2].biter.url}</a> with ${yearBitens[2].biteCount} bites.
    </p>
    <br />
    <p>Now let's go to the juicy parts</p>
    ${mostRewootedPosts[0]
        ? `<p>The most rewooted woot you have is ${new URL(
          `/fediverse/post/${mostRewootedPosts[0].parentId}`,
          completeEnvironment.frontendUrl
        )} which has ${mostRewootedPosts[0].rewoots} rewoots</p>`
        : ""
      }
    ${mostQuotedPosts[0]
        ? `<p>The most quoted woot you have is ${new URL(
          `/fediverse/post/${mostQuotedPosts[0].parentId}`,
          completeEnvironment.frontendUrl
        )} which has ${mostQuotedPosts[0].quotes} quotes</p>`
        : ""
      }
    ${mostRepliedPosts[0]
        ? `<p>The most replied woot you have is ${new URL(
          `/fediverse/post/${mostRepliedPosts[0].parentId}`,
          completeEnvironment.frontendUrl
        )} which has ${mostRepliedPosts[0].replyCount} replies</p>`
        : ""
      }
    ${mostReactedPosts[0]
        ? `<p>The most reacted woot you have is ${new URL(
          `/fediverse/post/${mostReactedPosts[0].postId}`,
          completeEnvironment.frontendUrl
        )} which has ${mostReactedPosts[0].reactions.length} reactions</p>`
        : ""
      }
    <br />
    And finaly, the part of the email where I say "give me money". Well, first, give money to your <a href="${completeEnvironment.donationUrl
        ? completeEnvironment.donationUrl
        : new URL(`/about`, completeEnvironment.frontendUrl)
      }">wafrn instance</a>, then to the team, and then me
    <ul>
    	<li><a href="https://ko-fi.com/cyrneko/tiers" target="_blank">Alexia</a> has helped improve the quality of the code and made the way for other improvements. She has done a lot to help wafrn grow</li>
      <li><a href="https://app.wafrn.net/blog/fireisgood">FireIsGood</a> has done A LOT. Like A HUGE FUCKING LOT. You should give her moneys <a href="https://ko-fi.com/fireisgood">here</a> </li>
    	<li><a href="https://social.sztupy.hu/blog/sztupy" target="_blank">SztupY</a> has helped to create a wafrn hosting guide and streamlined the process a lot. You should give <a href="https://ko-fi.com/SztupY" target="_blank">SztupY</a> some money. Also yes his profile is not on the main wafrn!</li>
    	<li><a href="https://ko-fi.com/juandjara" target="_blank">Javascript</a> made <a href="https://wafrn.net/" target="_blank">the mobile app</a>, its realy cool</li>
      <li><a href="https://wf.jbc.lol/blog/jbcrn">Jb</a> made a lot of things, including this very email, you should give <a href="https://patreon.com/jbcarreon123">jb</a> some money, he will appriciate it, also yes his profile is also not on the main wafrn!</li>
    	<li>And finaly... we have to link the wafrn <a href="https://patreon.com/wafrn" target="_blank">patreon</a> and <a href="https://ko-fi.com/wafrn" target="_blank">kofi</a>. This money goes to gabbo for fried chicken and to the wafrn servers. Give me money! please :3</li>
    </ul>
    <br />
    <p>If you no longer desire to get these emails, you can <a href="${completeEnvironment.frontendUrl
      }/api/disableEmailNotifications/${user.id}/${user.activationCode
      }">unsubscribe</a>.</p>
    `;
    console.log(`mailing ${user.url}`);
    await sendEmail({ email: user.email, subject, body });
    await wait(1000);
  }
}

function calcPercentile(
  userVal: string | number,
  allVals: string[] | number[]
): string {
  if (allVals.length === 0) return "0";

  userVal = parseInt(userVal.toString());
  allVals = allVals.map((x) => parseInt(x.toString()));

  const belowUser = allVals.filter((x) => x < userVal).length;
  return ((belowUser / allVals.length) * 100).toFixed(2);
}

sendMail();
