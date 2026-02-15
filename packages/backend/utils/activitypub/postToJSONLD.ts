import { Op } from "sequelize";
import {
  Media,
  Post,
  PostTag,
  Quotes,
  sequelize,
  User,
} from "../../models/index.js";
import { completeEnvironment } from "../backendOptions.js";
import { fediverseTag } from "../../interfaces/fediverse/tags.js";
import { activityPubObject } from "../../interfaces/fediverse/activityPubObject.js";
import { emojiToAPTag } from "./emojiToAPTag.js";
import { getPostReplies } from "./getPostReplies.js";
import { getPostAndUserFromPostId } from "../cacheGetters/getPostAndUserFromPostId.js";
import { logger } from "../logger.js";
import { InteractionControl, InteractionControlType, Privacy } from "../../models/post.js";
import { redisCache } from "../redis.js";
import { htmlToMfm } from "./htmlToMfm.js";
import showdown from "showdown";
import { getAllLocalUserIds } from "../cacheGetters/getAllLocalUserIds.js";

const markdownConverter = new showdown.Converter({
  simplifiedAutoLink: true,
  literalMidWordUnderscores: true,
  strikethrough: true,
  simpleLineBreaks: true,
  openLinksInNewWindow: true,
  emoji: true,
  encodeEmails: false,
});

async function postToJSONLD(
  postId: string
): Promise<activityPubObject | undefined> {
  let resFromCacheString = await redisCache.get("postToJsonLD:" + postId);
  let askContent = "";
  if (resFromCacheString) {
    return JSON.parse(resFromCacheString) as activityPubObject;
  }
  const cacheData = await getPostAndUserFromPostId(postId, true);
  const post = cacheData.data;
  if (!post) {
    return undefined;
  }
  const localUser = post.user;
  let userAsker = undefined;
  const ask = post.ask;
  if (ask) {
    userAsker = await User.findByPk(ask.userAsker);
  }

  const stringMyFollowers = `${completeEnvironment.frontendUrl
    }/fediverse/blog/${localUser.url.toLowerCase()}/followers`;
  const stringMyFollowing = `${completeEnvironment.frontendUrl
    }/fediverse/blog/${localUser.url.toLowerCase()}/following`;
  const dbMentions = post.mentionPost;
  let mentionedUsers: string[] = [];

  if (dbMentions) {
    mentionedUsers = dbMentions
      .filter((elem: any) => elem.remoteInbox)
      .map((elem: any) => elem.remoteId);
  }
  let parentPostString = null;
  let quotedPostString = null;
  let quoteAuthorization = null;
  const conversationString = `${completeEnvironment.frontendUrl}/fediverse/conversation/${post.id}`;

  if (post.parentId) {
    let dbPost = (await getPostAndUserFromPostId(post.parentId)).data;

    const ancestorIdsQuery = await sequelize.query(
      `SELECT "ancestorId" FROM "postsancestors" where "postsId" = '${post.parentId}'`
    );
    let ancestors: Post[] = [];
    const ancestorIds: string[] = ancestorIdsQuery[0].map(
      (elem: any) => elem.ancestorId
    );
    if (ancestorIds.length > 0) {
      ancestors = await Post.findAll({
        include: [
          {
            model: User,
            as: "user",
            attributes: ["url"],
          },
        ],
        where: {
          id: {
            [Op.in]: ancestorIds,
          },
        },
        order: [["createdAt", "DESC"]],
      });
      if (post.bskyDid) {
        // we do same check for all parents

        const parentsUsers = ancestors.map((elem) => elem.user);
        if (
          ancestors.some(
            (elem) =>
              elem.user.isBlueskyUser && elem.bskyUri && !elem.remotePostId
          )
        ) {
          return undefined;
        }
      }
    }
    for await (const ancestor of ancestors) {
      if (
        dbPost &&
        dbPost.content === "" &&
        dbPost.hierarchyLevel !== 0 &&
        dbPost.postTags.length == 0 &&
        dbPost.medias.length == 0 &&
        dbPost.quoted.length == 0 && // fix this this is still dirty
        dbPost.content_warning.length == 0
      ) {
        // TODO optimize this.
        // yes this is still optimizable but we are no longer using a while that could infinite loop
        // and also there are some checks in this function. so its ok ish
        // but still
        dbPost = (await getPostAndUserFromPostId(ancestor.id)).data;
      } else {
        break;
      }
    }
    parentPostString = dbPost?.remotePostId
      ? dbPost.remotePostId
      : `${completeEnvironment.frontendUrl}/fediverse/post/${dbPost ? dbPost.id : post.parentId
      }`;
  }
  const postMedias = await post.medias;
  let processedContent = post.content;
  const wafrnMediaRegex =
    /\[wafrnmediaid="[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}"\]/gm;

  // we remove the wafrnmedia from the post for the outside world, as they get this on the attachments
  processedContent = processedContent.replaceAll(wafrnMediaRegex, "");
  let misskeyContent =
    markdownConverter.makeHtml(post.markdownContent) || processedContent;

  let misskeyAskContent = "";

  if (ask) {
    askContent = `<p>${getUserName(userAsker)} <a href="${completeEnvironment.frontendUrl + "/fediverse/post/" + post.id
      }">asked</a> </p> <blockquote>${ask.question}</blockquote> `;
    processedContent = `${askContent} ${processedContent}`;
    misskeyAskContent = `$[border.style=solid,width=1,radius=6 $[border.color=0000,width=12 ${getUserName(userAsker)} [asked](${completeEnvironment.frontendUrl + "/fediverse/post/" + post.id
      }):
${await htmlToMfm(ask.question)}]]\n\n`;
  }
  const mentions: string[] = post.mentionPost.map((elem: any) => elem.id);
  const misskeyMentions: string[] = [];
  const fediMentions: fediverseTag[] = [];
  const fediTags: fediverseTag[] = [];
  let tagsAndQuotes = "<br>";
  let misskeyTagsAndQuotes = "";
  const quotedPosts = post.quoted;

  const lineBreaksAtEndRegex = /\s*(<br\s*\/?>)+\s*$/g;

  if (quotedPosts && quotedPosts.length > 0) {
    const mainQuotedPost = quotedPosts[0];
    quoteAuthorization = (
      await Quotes.findOne({
        where: {
          quoterPostId: post.id,
        },
      })
    )?.authorizationUrl;
    quotedPostString = await getPostUrlForQuote(mainQuotedPost);
    for await (const quotedPost of quotedPosts) {
      const postUrl = await getPostUrlForQuote(quotedPost);
      tagsAndQuotes =
        tagsAndQuotes + `<br>RE: <a href="${postUrl}">${postUrl}</a><br>`;
      if (!postUrl.startsWith("https://bsky.app/")) {
        fediTags.push({
          type: "Link",
          mediaType:
            'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          name: `RE: RE: <a href="${postUrl}">${postUrl}</a><br>`,
          href: postUrl,
        });
      } else {
        fediTags.push({
          type: "BskyQuote",
          name: `RE: RE: <a href="${postUrl}">${postUrl}</a><br>`,
          href: postUrl,
        });
        misskeyTagsAndQuotes = misskeyTagsAndQuotes + `<br>RE: ${postUrl}`
      }
    }
  }
  tagsAndQuotes = tagsAndQuotes + "<small>";
  for await (const tag of post.postTags) {
    const externalTagName = tag.tagName
      .replaceAll('"', "'")
      .replaceAll(" ", "-");
    const link = `${completeEnvironment.frontendUrl
      }/dashboard/search/${encodeURIComponent(tag.tagName)}`;
    tagsAndQuotes = `${tagsAndQuotes} <a class="hashtag" data-tag="post" href="${link}" rel="tag ugc">#${externalTagName}</a>`;
    misskeyTagsAndQuotes = `${misskeyTagsAndQuotes} ${tag.tagName.trim().includes(" ")
      ? "# " + tag.tagName.trim()
      : "#" + tag.tagName.trim()
      }`;
    fediTags.push({
      type: "Hashtag",
      name: `#${externalTagName}`,
      href: link,
    });
    fediTags.push({
      type: "WafrnHashtag",
      href: link,
      name: tag.tagName.replaceAll('"', "'"),
    });
  }
  tagsAndQuotes = tagsAndQuotes + "</small>";
  if (tagsAndQuotes === "<br><small></small>") {
    tagsAndQuotes = "";
  }
  if (tagsAndQuotes.endsWith("<small></small>")) {
    tagsAndQuotes = tagsAndQuotes.split("<small></small>")[0];
  }

  for await (const userId of mentions) {
    const user =
      (await User.findOne({ where: { id: userId } })) ||
      ((await User.findOne({
        where: { url: completeEnvironment.deletedUser },
      })) as User);
    const url = user.fullHandle;
    const remoteId = user.fullFediverseUrl;
    if (remoteId) {
      fediMentions.push({
        type: "Mention",
        name: url,
        href: remoteId,
      });
    }
    if (
      !misskeyContent.includes(user.url) &&
      !misskeyAskContent.includes(user.url)
    )
      misskeyMentions.push(url);
  }
  misskeyContent = await htmlToMfm(
    misskeyContent.replace(lineBreaksAtEndRegex, "")
  );
  if (misskeyTagsAndQuotes.length > 0) {
    misskeyContent =
      misskeyContent +
      `\n<small>${await htmlToMfm(misskeyTagsAndQuotes)}</small>`;
  }
  const misskeyMentionContent =
    misskeyMentions.length > 0 ? `${misskeyMentions.join(" ")}\n\n` : "";

  let contentWarning = false;
  postMedias.forEach((media: any) => {
    if (media.NSFW) {
      contentWarning = true;
    }
  });

  const emojis = post.emojis;

  if (ask) {
    fediTags.push({
      type: "AskQuestion",
      name: ask.question,
      representation: askContent,
      actor: userAsker
        ? userAsker.remoteId
          ? userAsker.remoteId
          : completeEnvironment.frontendUrl + "/fediverse/blog/" + userAsker.url
        : "anonymous",
    });
  }
  const usersToSend = getToAndCC(
    post.privacy,
    mentionedUsers,
    stringMyFollowers
  );
  const actorUrl = `${completeEnvironment.frontendUrl
    }/fediverse/blog/${localUser.url.toLowerCase()}`;
  const misskeyMarkdown =
    misskeyMentionContent + misskeyAskContent + misskeyContent;
  let misskeyQuoteURL = quotedPostString;
  if (misskeyQuoteURL?.startsWith("https://bsky.app/")) {
    misskeyQuoteURL = null;
  }
  let canReply: string[] = [];
  let canAnnounce: string[] = [];
  let canLike: string[] = [];
  
  let canReplyValue: InteractionControlType = post.replyControl;
  let canAnnounceValue: InteractionControlType = post.reblogControl;
  let canLikeValue: InteractionControlType = post.likeControl;
  const publicString = "https://www.w3.org/ns/activitystreams#Public"
  // canreply:
  if([InteractionControl.Anyone, InteractionControl.SameAsOp].includes(canReplyValue)) {
    canReply.push(publicString)
  } else {
    // mentionedUsers
    if([InteractionControl.MentionedUsersOnly, InteractionControl.FollowersAndMentioned, InteractionControl.FollowingAndMentioned, InteractionControl.FollowersFollowingAndMentioned].includes(canReplyValue)) {
      canReply = canReply.concat(mentionedUsers)
    }
    if([InteractionControl.Followers, InteractionControl.FollowersAndFollowing, InteractionControl.FollowersAndMentioned, InteractionControl.FollowersFollowingAndMentioned].includes(canReplyValue)) {
      canReply = canReply.concat(stringMyFollowers)
    }
    if([InteractionControl.Following, InteractionControl.FollowingAndMentioned, InteractionControl.FollowersFollowingAndMentioned, InteractionControl.FollowersAndFollowing].includes(canReplyValue)) {
      canReply = canReply.concat(stringMyFollowing)
    }
  }

  if(canAnnounceValue === InteractionControl.Anyone) {
    canAnnounce.push(publicString)
  } else {
    // mentionedUsers
    if([InteractionControl.MentionedUsersOnly, InteractionControl.FollowersAndMentioned, InteractionControl.FollowingAndMentioned, InteractionControl.FollowersFollowingAndMentioned].includes(canAnnounceValue)) {
      canAnnounce = canAnnounce.concat(mentionedUsers)
    }
    if([InteractionControl.Followers, InteractionControl.FollowersAndFollowing, InteractionControl.FollowersAndMentioned, InteractionControl.FollowersFollowingAndMentioned].includes(canAnnounceValue)) {
      canAnnounce = canAnnounce.concat(stringMyFollowers)
    }
    if([InteractionControl.Following, InteractionControl.FollowingAndMentioned, InteractionControl.FollowersFollowingAndMentioned, InteractionControl.FollowersAndFollowing].includes(canAnnounceValue)) {
      canAnnounce = canAnnounce.concat(stringMyFollowing)
    }
  }

  if(canLikeValue === InteractionControl.Anyone) {
    canLike.push(publicString)
  } else {
    // mentionedUsers
    if([InteractionControl.MentionedUsersOnly, InteractionControl.FollowersAndMentioned, InteractionControl.FollowingAndMentioned, InteractionControl.FollowersFollowingAndMentioned].includes(canLikeValue)) {
      canLike = canLike.concat(mentionedUsers)
    }
    if([InteractionControl.Followers, InteractionControl.FollowersAndFollowing, InteractionControl.FollowersAndMentioned, InteractionControl.FollowersFollowingAndMentioned].includes(canLikeValue)) {
      canLike = canLike.concat(stringMyFollowers)
    }
    if([InteractionControl.Following, InteractionControl.FollowingAndMentioned, InteractionControl.FollowersFollowingAndMentioned, InteractionControl.FollowersAndFollowing].includes(canLikeValue)) {
      canLike = canLike.concat(stringMyFollowing)
    }
  }

  let postAsJSONLD: activityPubObject = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      `${completeEnvironment.frontendUrl}/contexts/litepub-0.1.jsonld`,
    ],
    id: `${completeEnvironment.frontendUrl}/fediverse/activity/post/${post.id}`,
    type: "Create",
    actor: actorUrl,
    published: new Date(post.createdAt).toISOString(),
    to: usersToSend.to,
    cc: usersToSend.cc,
    object: {
      id: `${completeEnvironment.frontendUrl}/fediverse/post/${post.id}`,
      blueskyUri: post.bskyUri,
      blueskyCid: post.bskyCid,
      actor: actorUrl,
      type: "Note",
      summary: post.content_warning ? post.content_warning : "",
      inReplyTo: parentPostString,
      published: new Date(post.createdAt).toISOString(),
      updated: new Date(post.updatedAt).toISOString(),
      _misskey_content: misskeyMarkdown,
      source: {
        content: misskeyMarkdown,
        mediaType: "text/x.misskeymarkdown",
      },
      url: post.bskyUri
        ? [
          `${completeEnvironment.frontendUrl}/fediverse/post/${post.id}`,
          {
            type: "Link",
            rel: "alternate",
            href: post.bskyUri,
          },
        ]
        : `${completeEnvironment.frontendUrl}/fediverse/post/${post.id}`,
      attributedTo: `${completeEnvironment.frontendUrl
        }/fediverse/blog/${localUser.url.toLowerCase()}`,
      to: usersToSend.to,
      cc: usersToSend.cc,
      sensitive: !!post.content_warning || contentWarning,
      atomUri: `${completeEnvironment.frontendUrl}/fediverse/post/${post.id}`,
      inReplyToAtomUri: parentPostString,
      quoteUrl: misskeyQuoteURL,
      _misskey_quote: misskeyQuoteURL,
      quoteUri: misskeyQuoteURL,
      // conversation: conversationString,
      content: (processedContent + tagsAndQuotes).replace(
        lineBreaksAtEndRegex,
        ""
      ),
      attachment: postMedias
        ?.sort((a: Media, b: Media) => a.mediaOrder - b.mediaOrder)
        .map((media: Media) => {
          const extension = media.url
            .split(".")
          [media.url.split(".").length - 1].toLowerCase();
          return {
            type: "Document",
            mediaType: media.mediaType,
            url:
              media.url.startsWith("?cid") || media.external
                ? completeEnvironment.externalCacheurl +
                encodeURIComponent(media.url)
                : completeEnvironment.mediaUrl + media.url,
            sensitive: media.NSFW ? true : false,
            name: media.description,
          };
        }),
      tag: fediMentions
        .concat(fediTags)
        .concat(emojis.map((emoji: any) => emojiToAPTag(emoji))),
      replies: {
        id: `${completeEnvironment.frontendUrl}/fediverse/post/${post.id}/replies`,
        type: "Collection",
        first: {
          type: "CollectionPage",
          partOf: `${completeEnvironment.frontendUrl}/fediverse/post/${post.id}/replies`,
          next: `${completeEnvironment.frontendUrl}/fediverse/post/${post.id}/replies?page=1`,
          items: [],
        },
      },
      interactionPolicy: {
        canQuote: {
          automaticApproval:   post.quoteControl === InteractionControl.Anyone ? [ "https://www.w3.org/ns/activitystreams#Public"] : [],
        },
        canLike: {
          automaticApproval: canLike
        },
        canReply: {
          automaticApproval: canReply
        },
        canAnnounce: {
          automaticApproval: canAnnounce
        }
      },
    },
  };
  const newObject: any = {};
  const objKeys = Object.keys(postAsJSONLD.object);
  objKeys.forEach((key) => {
    if (postAsJSONLD.object[key]) {
      newObject[key] = postAsJSONLD.object[key];
    }
  });
  postAsJSONLD.object = newObject;
  if (
    post.content === "" &&
    post.postTags.length === 0 &&
    post.medias.length === 0 &&
    post.quoted.length === 0 &&
    post.content_warning == 0
  ) {
    postAsJSONLD = {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: `${completeEnvironment.frontendUrl}/fediverse/post/${post.id}`,
      type: "Announce",
      actor: `${completeEnvironment.frontendUrl
        }/fediverse/blog/${localUser.url.toLowerCase()}`,
      published: new Date(post.createdAt).toISOString(),
      to:
        post.privacy / 1 === Privacy.DirectMessage
          ? mentionedUsers
          : post.privacy / 1 === Privacy.Public
            ? ["https://www.w3.org/ns/activitystreams#Public"]
            : [stringMyFollowers],
      cc: [
        `${completeEnvironment.frontendUrl
        }/fediverse/blog/${localUser.url.toLowerCase()}`,
        stringMyFollowers,
      ],
      object: parentPostString,
    };
  }
  await redisCache.set(
    "postToJsonLD:" + postId,
    JSON.stringify(postAsJSONLD),
    "EX",
    300
  );
  return postAsJSONLD;
}

function getToAndCC(
  privacy: number,
  mentionedUsers: string[],
  stringMyFollowers: string
): { to: string[]; cc: string[] } {
  let to: string[] = [];
  let cc: string[] = [];
  switch (privacy) {
    case 0: {
      to = [
        "https://www.w3.org/ns/activitystreams#Public",
        stringMyFollowers,
        ...mentionedUsers,
      ];
      cc = mentionedUsers;
      break;
    }
    case 1: {
      to = [stringMyFollowers, ...mentionedUsers];
      cc = [];
      break;
    }
    case 3: {
      to = [stringMyFollowers, ...mentionedUsers];
      cc = ["https://www.w3.org/ns/activitystreams#Public"];
      break;
    }
    default: {
      (to = mentionedUsers), (cc = []);
    }
  }
  return {
    to,
    cc,
  };
}

// stolen I mean inspired by https://stackoverflow.com/questions/2970525/converting-a-string-with-spaces-into-camel-case
function camelize(str: string): string {
  return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match, index) {
    if (+match === 0) return ""; // or if (/\s+/.test(match)) for white spaces
    return index === 0 ? match.toLowerCase() : match.toUpperCase();
  });
}

function getUserName(user?: User | undefined | null): string {
  let res = user
    ? "@" + user.url + "@" + completeEnvironment.instanceUrl
    : "anonymous";
  if (user?.url.startsWith("@")) {
    res = user.url;
  }
  return res;
}

async function getPostUrlForQuote(post: any): Promise<string> {
  const isPostFromFedi = !!post.remotePostId;
  let res = `${completeEnvironment.frontendUrl}/fediverse/post/${post.id}`;
  if (post.bskyUri && !(await getAllLocalUserIds()).includes(post.userId)) {
    const parts = post.bskyUri.split("/app.bsky.feed.post/");
    const userDid = parts[0].split("at://")[1];
    res = `https://bsky.app/profile/${userDid}/post/${parts[1]}`;
  }
  if (isPostFromFedi) {
    res = post.remotePostId;
  }
  return res;
}

export { postToJSONLD, getPostUrlForQuote };
