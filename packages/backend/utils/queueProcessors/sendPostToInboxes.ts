import { Job } from "bullmq";
import { logger } from "../logger.js";
import { postPetitionSigned } from "../activitypub/postPetitionSigned.js";
import { promiseRace } from "../../atproto/utils/promiseRace.js";

async function sendPostToInboxes(job: Job) {
  const inbox: string = job.data.inboxList;
  const localUser = job.data.petitionBy;
  const objectToSend = job.data.objectToSend;
  //at some point we should remove the array thing but at the same time yeah
  const tmp = await promiseRace(
    [postPetitionSigned(objectToSend, localUser, inbox)],
    5000
  );
  return true;
}

export { sendPostToInboxes };
