import { Label } from "@atproto/api";
import { promiseRace } from "../../atproto/utils/promiseRace.js";
import { Post } from "../../models/index.js";
import { getAllLocalUserIds, getAllLocalUserIdsSet } from "../cacheGetters/getAllLocalUserIds.js";
import { getAdminUser } from "../getAdminAndDeletedUser.js";
import { logger } from "../logger.js";
import { getAdminAtprotoSession } from "./getAdminAtprotoSession.js";

async function checkBskyLabelersNSFW(posts: Post[]): Promise<void> {
  if (posts.length == 0) {
    return;
  }
  try {
    const localUsers = await getAllLocalUserIdsSet();
    const dids: string[] = posts
      .filter((elem) => elem.bskyUri && !localUsers.has(elem.userId))
      .map((elem) => elem.bskyUri as string);
    const agent = await getAdminAtprotoSession();
    const getLabelsPetition = agent.com.atproto.label.queryLabels({
      uriPatterns: dids,
      // hardcoded: bsky moderation service
      sources: ["did:plc:ar7c4by46qjdydhdevvrndac"],
    });
    let petitionResult = (await promiseRace([getLabelsPetition], 5000))[0];
    if (petitionResult?.data?.labels && petitionResult.data.labels.length > 0) {
      let labels: Map<string, string[]> = new Map();
      for await (const label of petitionResult.data.labels) {
        if (!labels.get(label.uri)) {
          labels.set(label.uri, []);
        }
        if (label.neg && labels.has(label.val)) {
          labels.set(
            label.uri,
            (labels.get(label.uri) as string[]).filter(
              (elem) => elem != label.val
            )
          );
        } else {
          labels.set(
            label.uri,
            (labels.get(label.uri) as string[]).concat([label.val])
          );
        }
      }
      for await (const uri of labels.keys()) {
        let postToLabel = posts.find((elem) => elem.bskyUri === uri);
        if (postToLabel && labels.get(uri)?.length) {
          const postLabels = (labels.get(uri) as string[]).join(",");
          postToLabel.content_warning = `Post labeled as ${postLabels}`;
          await postToLabel.save();
        }
      }
    }
  } catch (error) {
    logger.info({ message: `Error on getting bsky labeler`, error });
  }
}

export { checkBskyLabelersNSFW };
