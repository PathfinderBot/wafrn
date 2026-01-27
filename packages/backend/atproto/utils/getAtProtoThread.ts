// returns the post id
import {
  EmojiReaction,
  Media,
  Notification,
  Post,
  PostAncestor,
  PostMentionsUserRelation,
  PostReport,
  PostTag,
  QuestionPoll,
  Quotes,
  RemoteUserPostView,
  SilencedPost,
  User,
  UserBitesPostRelation,
  UserBookmarkedPosts,
  UserLikesPostRelations,
} from "../../models/index.js";
import { Model, Op } from "sequelize";
import {
  PostView,
  ThreadViewPost,
} from "@atproto/api/dist/client/types/app/bsky/feed/defs.js";
import { getAtprotoUser } from "./getAtprotoUser.js";
import { CreateOrUpdateOp } from "@skyware/firehose";
import { logger } from "../../utils/logger.js";
import { RichText } from "@atproto/api";
import showdown from "showdown";
import {
  bulkCreateNotifications,
  createNotification,
} from "../../utils/pushNotifications.js";
import { getAllLocalUserIds } from "../../utils/cacheGetters/getAllLocalUserIds.js";
import {
  InteractionControl,
  InteractionControlType,
  Privacy,
} from "../../models/post.js";
import { wait } from "../../utils/wait.js";
import { UpdatedAt } from "sequelize-typescript";
import { completeEnvironment } from "../../utils/backendOptions.js";
import { MediaAttributes } from "../../models/media.js";
import { getAdminAtprotoSession } from "../../utils/atproto/getAdminAtprotoSession.js";
import { getPostThreadRecursive } from "../../utils/activitypub/getPostThreadRecursive.js";
import { Queue, QueueEvents } from "bullmq";
import { getAdminUser } from "../../utils/getAdminAndDeletedUser.js";
import { getServerFromDid } from "../../utils/atproto/getServerFromDid.js";
import { getDidDoc } from "../../utils/atproto/getDidDoc.js";
import { DidDocument } from "@atcute/identity";
import { extractUriComponents } from "./obtainUriComponents.js";
import { getPetitionSigned } from "../../utils/activitypub/getPetitionSigned.js";
import { activityPubObject } from "../../interfaces/fediverse/activityPubObject.js";

const markdownConverter = new showdown.Converter({
  simplifiedAutoLink: true,
  literalMidWordUnderscores: true,
  strikethrough: true,
  simpleLineBreaks: true,
  openLinksInNewWindow: true,
  emoji: true,
});

const adminUser = getAdminUser();

async function processSinglePost(
  uri: string,
  forceUpdate = false
): Promise<string | undefined> {
  if (!completeEnvironment.enableBsky) {
    return undefined;
  }
  if (!forceUpdate) {
    const existingPost = await Post.findOne({
      where: {
        bskyUri: uri,
      },
    });
    if (existingPost && !forceUpdate) {
      return existingPost.id;
    }
  }
  let postCreator: User | undefined;
  try {
    const did = uri.replace('at://', '').split('/')[0]
    const doc = (await getDidDoc(did)) as DidDocument

    const handle = (doc.alsoKnownAs as string[]).filter(elem => elem.startsWith('at://'))[0].split('at://')[1]
    postCreator = await getAtprotoUser(
      handle
    );
  } catch (error) {
    logger.debug({
      message: `Problem obtaining user from post`,
      uri,
      forceUpdate,
      error: error,
    });
  }
  let verifiedFedi: string | undefined;
  const postPetitionPds = await getPostThreadPDSDirect(uri)
  const parentUri = postPetitionPds.value?.reply?.parent?.uri ? postPetitionPds.value.reply.parent.uri : undefined;
  const parentId = parentUri ? await processSinglePost(parentUri, false) : undefined
  if ("fediverseId" in postPetitionPds.value || "bridgyOriginalUrl" in postPetitionPds.value) {
    if ("bridgyOriginalUrl" in postPetitionPds.value) {
      const res = await fetch(
        "https://slingshot.microcosm.blue/xrpc/com.bad-example.identity.resolveMiniDoc" +
        `?identifier=${extractUriComponents(uri).did}`
      );
      if (res.ok) {
        const json = (await res.json()) as { pds: string };
        if (json.pds.toLowerCase().replace(/^https?:\/\//, "").startsWith("atproto.brid.gy")) {
          // if user is on bridgy pds, verify it
          verifiedFedi = postPetitionPds.value.bridgyOriginalUrl as string;
        }
      }
    } else {
      // prob wafrn post, but lets verify it
      try {
        const fediPostObject = await getPetitionSigned(await getAdminUser(), postPetitionPds.value.fediverseId)
        if(fediPostObject && fediPostObject.blueskyUri && postPetitionPds.uri == fediPostObject.blueskyUri && fediPostObject.blueskyCid && postPetitionPds.cid == fediPostObject.blueskyCid  ) {
          // the post is real and they point each other.
          verifiedFedi = postPetitionPds.value.fediverseId
        }
      } catch (error) {
        logger.debug({
          error,
          message: `Error in obtaining fedi post ${postPetitionPds.value.fediverseId}`,
        });
      }
    }
  }
  if (verifiedFedi) {
    try {
      const remotePost = await getPostThreadRecursive(
        await getAdminUser(),
        verifiedFedi,
        undefined,
        undefined,
        {
          forceNotBsky: true
        }
      );
      if (remotePost) {
        remotePost.bskyCid = postPetitionPds.cid;
        remotePost.bskyUri = postPetitionPds.uri;
        // if there's already a bsky post about
        // this that doesn't have any fedi urls, delete it
        // and prob update the things
        let existingPost = await Post.findOne({
          where: {
            bskyCid: postPetitionPds.cid,
            remotePostId: null,
          },
        });
        if (
          existingPost &&
          !(await getAllLocalUserIds()).includes(existingPost.userId)
        ) {
          // very expensive updates! but only happens when user
          // searches existing post that is alr on db
          await EmojiReaction.update(
            {
              postId: remotePost.id,
            },
            {
              where: {
                postId: existingPost.id,
              },
            }
          );
          await Notification.update(
            {
              postId: remotePost.id,
            },
            {
              where: {
                postId: existingPost.id,
              },
            }
          );
          await PostReport.update(
            {
              postId: remotePost.id,
            },
            {
              where: {
                postId: existingPost.id,
              },
            }
          );
          try {
            await PostAncestor.update(
              {
                postsId: remotePost.id,
              },
              {
                where: {
                  postsId: existingPost.id,
                },
              }
            );
          } catch { }
          await QuestionPoll.update(
            {
              postId: remotePost.id,
            },
            {
              where: {
                postId: existingPost.id,
              },
            }
          );
          await Quotes.update(
            {
              quoterPostId: remotePost.id,
            },
            {
              where: {
                quoterPostId: existingPost.id,
              },
            }
          );
          if (
            !(await Quotes.findOne({
              where: {
                quotedPostId: remotePost.id,
              },
            }))
          ) {
            await Quotes.update(
              {
                quotedPostId: remotePost.id,
              },
              {
                where: {
                  quotedPostId: existingPost.id,
                },
              }
            );
          }
          await RemoteUserPostView.update(
            {
              postId: remotePost.id,
            },
            {
              where: {
                postId: existingPost.id,
              },
            }
          );
          await SilencedPost.update(
            {
              postId: remotePost.id,
            },
            {
              where: {
                postId: existingPost.id,
              },
            }
          );
          await SilencedPost.update(
            {
              postId: remotePost.id,
            },
            {
              where: {
                postId: existingPost.id,
              },
            }
          );
          await UserBitesPostRelation.update(
            {
              postId: remotePost.id,
            },
            {
              where: {
                postId: existingPost.id,
              },
            }
          );
          await UserBookmarkedPosts.update(
            {
              postId: remotePost.id,
            },
            {
              where: {
                postId: existingPost.id,
              },
            }
          );
          await UserLikesPostRelations.update(
            {
              postId: remotePost.id,
            },
            {
              where: {
                postId: existingPost.id,
              },
            }
          );
          await Post.update(
            {
              parentId: remotePost.id,
            },
            {
              where: {
                parentId: existingPost.id,
              },
            }
          );

          await Post.destroy({
            where: {
              bskyCid: postPetitionPds.cid,
              remotePostId: null,
              userId: {
                [Op.notIn]: await getAllLocalUserIds(),
              },
            },
          });
        }
        await remotePost.save();
        return remotePost.id;
      }
    } catch (error) {
      logger.debug({
        message: `Error in obtaining fedi post ${verifiedFedi}`,
        error,
      });
    }
  }
  if (!postCreator || !postPetitionPds) {
    const usr = postCreator
      ? postCreator
      : await User.findOne({ where: { url: completeEnvironment.deletedUser } });
    
    const invalidPost = await Post.create({
      userId: usr?.id,
      content: `Failed to get atproto post`,
      parentId: parentId,
      isDeleted: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    return invalidPost.id;
  }
  if (postCreator) {
    const medias = getPostMedias(postPetitionPds);
    let tags: string[] = [];
    let mentions: string[] = [];
    let record = postPetitionPds.value as any;
    let postText = record.text;
    let federatedWoot = false;
    if (record.fullText || record.bridgyOriginalText) {
      federatedWoot = true;
      tags = record.fullTags?.split("\n").filter((x: string) => !!x) ?? []; // also detect full tags
      postText = record.fullText ?? record.bridgyOriginalText;
    }
    if (record.facets && record.facets.length > 0 && !federatedWoot) {
      // lets get mentions
      const mentionedDids = record.facets
        .flatMap((elem: any) => elem.features)
        .map((elem: any) => elem.did)
        .filter((elem: any) => elem);
      if (mentionedDids && mentionedDids.length > 0) {
        const mentionedUsers = await User.findAll({
          where: {
            bskyDid: {
              [Op.in]: mentionedDids,
            },
          },
        });
        mentions = mentionedUsers.map((elem) => elem.id);
      }

      const rt = new RichText({
        text: postText,
        facets: record.facets,
      });
      let text = "";

      for (const segment of rt.segments()) {
        if (segment.isLink()) {
          const href = segment.link?.uri;
          text += `<a href="${href}" target="_blank">${href}</a>`;
        } else if (segment.isMention()) {
          const href = `${completeEnvironment.frontendUrl}/blog/${segment.mention?.did}`;
          text += `<a href="${href}" target="_blank">${segment.text}</a>`;
        } else if (segment.isTag()) {
          const href = `${completeEnvironment.frontendUrl
            }/dashboard/search/${segment.text.substring(1)}`;
          text += `<a href="${href}" target="_blank">${segment.text}</a>`;
          tags.push(segment.text.substring(1));
        } else {
          text += segment.text;
        }
      }
      postText = text;
    }
    if (!federatedWoot) postText = postText.replaceAll("\n", "<br>");

    const labels = getPostLabels(postPetitionPds.value);
    let cw =
      labels.length > 0
        ? `Post is labeled as: ${labels.join(", ")}`
        : undefined;
    if (!cw && postCreator.NSFW) {
      cw =
        "This user has been marked as NSFW and the post has been labeled automatically as NSFW";
    }
    const newData = {
      userId: postCreator.id,
      bskyCid: postPetitionPds.cid,
      bskyUri: postPetitionPds.uri,
      content: postText,
      createdAt: new Date((postPetitionPds.value as any).createdAt),
      privacy: Privacy.Public,
      parentId: parentId,
      content_warning: cw,
      ...await getPostInteractionLevels(uri, parentId),
    };
    if (!parentId) {
      delete newData.parentId;
    }

    if ((await getAllLocalUserIds()).includes(newData.userId) && !forceUpdate) {
      // dirty as hell but this should stop the duplication
      await wait(1500);
    }
    let [postToProcess, created] = await Post.findOrCreate({
      where: { bskyUri: postPetitionPds.uri },
      defaults: newData,
    });
    // do not update existing posts. But what if local user creates a post through bsky? then we force updte i guess
    if (
      !(await getAllLocalUserIds()).includes(postToProcess.userId) ||
      created
    ) {
      if (!created) {
        postToProcess.set(newData);
        await postToProcess.save();
      }
      if (medias) {
        await Media.destroy({
          where: {
            postId: postToProcess.id,
          },
        });
        await Media.bulkCreate(
          medias.map((media: any) => {
            return { ...media, postId: postToProcess.id };
          })
        );
      }
      if (parentId) {
        const ancestors = await postToProcess.getAncestors({
          attributes: ["userId"],
          where: {
            hierarchyLevel: {
              [Op.gt]: postToProcess.hierarchyLevel - 5,
            },
          },
        });
        mentions = mentions.concat(ancestors.map((elem) => elem.userId));
      }
      mentions = [...new Set(mentions)];
      if (mentions.length > 0) {
        await Notification.destroy({
          where: {
            notificationType: "MENTION",
            postId: postToProcess.id,
          },
        });
        await PostMentionsUserRelation.destroy({
          where: {
            postId: postToProcess.id,
          },
        });
        await bulkCreateNotifications(
          mentions.map((mnt) => ({
            notificationType: "MENTION",
            postId: postToProcess.id,
            notifiedUserId: mnt,
            userId: postToProcess.userId,
            createdAt: new Date(postToProcess.createdAt),
          })),
          {
            ignoreDuplicates: true,
            postContent: postText,
            userUrl: postCreator.url,
          }
        );
        await PostMentionsUserRelation.bulkCreate(
          mentions.map((mnt) => {
            return {
              userId: mnt,
              postId: postToProcess.id,
            };
          }),
          { ignoreDuplicates: true }
        );
      }
      if (tags.length > 0) {
        await PostTag.destroy({
          where: {
            postId: postToProcess.id,
          },
        });
        await PostTag.bulkCreate(
          tags.map((tag) => {
            return {
              postId: postToProcess.id,
              tagName: tag,
            };
          })
        );
      }
      const quotedPostUri = getQuotedPostUri(postPetitionPds);
      if (quotedPostUri) {
        const quotedPostId = await processSinglePost(quotedPostUri, forceUpdate);
        if (quotedPostId) {
          const quotedPost = await Post.findByPk(quotedPostId);
          if (quotedPost) {
            await createNotification(
              {
                notificationType: "QUOTE",
                notifiedUserId: quotedPost.userId,
                userId: postToProcess.userId,
                postId: postToProcess.id,
              },
              {
                postContent: postToProcess.content,
                userUrl: postCreator?.url,
              }
            );
            await Quotes.findOrCreate({
              where: {
                quoterPostId: postToProcess.id,
                quotedPostId: quotedPostId,
              },
            });
          }
        }
      }
    }

    return postToProcess.id;
  }
}

function getPostMedias(post: any) {
  let res: MediaAttributes[] = [];
  const labels = getPostLabels(post);
  const embed = post.value.embed;
  if (embed) {
    if (embed.external) {
      res = res.concat([
        {
          mediaType: !embed.external.uri.startsWith("https://media.ternor.com/")
            ? "text/html"
            : "image/gif",
          description: embed.external.title,
          url: embed.external.uri,
          mediaOrder: 0,
          external: true,
        },
      ]);
    }
    if (embed.images || embed.media) {
      // case with quote and gif / link preview
      if (embed.media?.external) {
        res = res.concat([
          {
            mediaType: !embed.media.external.uri.startsWith(
              "https://media.ternor.com/"
            )
              ? "text/html"
              : "image/gif",
            description: embed.media.external.title,
            url: embed.media.external.uri,
            mediaOrder: 0,
            external: true,
          },
        ]);
      } else {
        const thingToProcess = embed.images ? embed.images : embed.media.images;
        if (thingToProcess) {
          const toConcat = thingToProcess.map((media: any, index: any) => {
            const cid = media.image.ref["$link"]
              ? media.image.ref["$link"]
              : media.image.ref.toString();
            const {did} = extractUriComponents(post.uri)
            return {
              mediaType: media.image.mimeType,
              description: media.alt,
              height: media.aspectRatio?.height,
              width: media.aspectRatio?.width,
              url: `?cid=${encodeURIComponent(cid)}&did=${encodeURIComponent(
                did
              )}`,
              mediaOrder: index,
              external: true,
            };
          });
          res = res.concat(toConcat);
        } else {
          logger.debug({
            message: `Bsky problem getting medias on post ${post.uri}`,
          });
        }
      }
    }
    if (embed.video) {
      const video = embed.video;
      const cid = video.ref["$link"]
        ? video.ref["$link"]
        : video.ref.toString();
      const did = extractUriComponents(post.uri).did;
      res = res.concat([
        {
          mediaType: embed.video.mimeType,
          description: "",
          height: embed.aspectRatio?.height,
          width: embed.aspectRatio?.width,
          url: `?cid=${encodeURIComponent(cid)}&did=${encodeURIComponent(did)}`,
          mediaOrder: 0,
          external: true,
        },
      ]);
    }
  }
  return res.map((m) => {
    return {
      ...m,
      NSFW: labels.length > 0,
    };
  });
}

// TODO improve this so we get better nsfw messages lol
function getPostLabels(post: PostView) {
  let labels = new Set<string>();
  if (post.labels) {
    for (const label of post.labels) {
      if (label.neg && labels.has(label.val)) {
        labels.delete(label.val);
      } else {
        labels.add(label.val);
      }
    }
  }
  return Array.from(labels);
}

async function getPostInteractionLevels(
  uri: string,
  parentId: string | undefined
): Promise<{
  replyControl: InteractionControlType;
  likeControl: InteractionControlType;
  reblogControl: InteractionControlType;
  quoteControl: InteractionControlType;
}> {
  let canQuote = InteractionControl.Anyone;
  let canReply: InteractionControlType = InteractionControl.Anyone;
  const {did, collection, rKey} = extractUriComponents(uri)
  const [threadGate, postGate] = await Promise.all([getPostThreadPDSDirect(`at://${did}/app.bsky.feed.threadgate/${rKey}`), getPostThreadPDSDirect(`at://${did}/app.bsky.feed.postgate/${rKey}`)])

  if (postGate?.value?.embeddingRules.length) {
    canQuote = InteractionControl.NoOne;
  }
  if (parentId) {
    canReply = InteractionControl.SameAsOp;
    canQuote = InteractionControl.SameAsOp;
  } else if (
    threadGate.value &&
    (threadGate.value as any).allow
  ) {
    const allowList = (threadGate.value as any).allow;
    if (allowList.length == 0) {
      canReply = InteractionControl.NoOne;
    } else {
      const mentiontypes: string[] = allowList
        .map((elem: any) => elem["$type"])
        .map((elem: string) => elem.split("app.bsky.feed.threadgate#")[1]);
      if (mentiontypes.includes("mentionRule")) {
        if (mentiontypes.includes("followingRule")) {
          canReply = mentiontypes.includes("followerRule")
            ? InteractionControl.FollowersFollowersAndMentioned
            : InteractionControl.FollowingAndMentioned;
        } else {
          canReply = mentiontypes.includes("followerRule")
            ? InteractionControl.FollowersAndMentioned
            : InteractionControl.MentionedUsersOnly;
        }
      } else {
        if (mentiontypes.includes("followingRule")) {
          canReply = mentiontypes.includes("followerRule")
            ? InteractionControl.FollowersAndFollowing
            : InteractionControl.Following;
        } else {
          canReply = mentiontypes.includes("followerRule")
            ? InteractionControl.Followers
            : InteractionControl.NoOne;
        }
      }
    }
  }

  if (
    canQuote === InteractionControl.Anyone &&
    canReply != InteractionControl.Anyone
  ) {
    canQuote = canReply;
  }

  return {
    quoteControl: canQuote,
    replyControl: canReply,
    likeControl: InteractionControl.Anyone,
    reblogControl: InteractionControl.Anyone,
  };
}

async function processReplies(uri: string) {
  // TODO we need to get constelations
}

function getQuotedPostUri(post: any): string | undefined {
  let res: string | undefined = undefined;
  const embed = (post.value as any).embed;
  if (embed && ["app.bsky.embed.record"].includes(embed["$type"])) {
    res = embed.record.uri;
  }
  // case of post with pictures and quote
  else if (
    embed &&
    ["app.bsky.embed.recordWithMedia"].includes(embed["$type"])
  ) {
    res = embed.record.record.uri;
  }
  return res;
}

async function getPostThreadPDSDirect(inputUri: string) {
  try {
    const {did, collection, rKey} = extractUriComponents(inputUri)
    const pdsUrl = await getServerFromDid(did)
    const petition = await (await fetch(`${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${collection}&rkey=${encodeURIComponent(rKey)}`)).json()
    return petition
  } catch (error) {
    logger.debug({
      message: `Error obtaining from pds: ${inputUri}`,
      error: error
    })
    return undefined
  }
  
}

export { getQuotedPostUri, processSinglePost, getPostThreadPDSDirect, getPostInteractionLevels };
