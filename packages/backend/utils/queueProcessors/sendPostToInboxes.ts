import { Job } from "bullmq";
import { logger } from "../logger.js";
import { postPetitionSigned } from "../activitypub/postPetitionSigned.js";
import { promiseRace } from "../../atproto/utils/promiseRace.js";
import { recordDeliverySuccess, recordDeliveryFailure } from "../deliveryCircuitBreaker.js";

async function sendPostToInboxes(job: Job) {
  const inbox: string = job.data.inboxList;
  const localUser = job.data.petitionBy;
  const objectToSend = job.data.objectToSend;

  try {
    // at some point we should remove the array thing but at the same time yeah
    const tmp = await promiseRace(
      [postPetitionSigned(objectToSend, localUser, inbox)],
      30000
    );

    if (tmp[0] === undefined || tmp[0] === null) {
      throw new Error(`Failed to deliver post to inbox ${inbox} within timeout`);
    } else {
      // Successfully delivered - reset failure counter for this host
      await recordDeliverySuccess(inbox);

      logger.debug({
        message: 'Post delivered to inbox successfully',
        inbox,
        childIndex: job.data.childIndex,
        totalChildren: job.data.totalChildren
      });

      return true;
    }

  } catch (error) {
    // Delivery failed - track the failure
    const enteredBackoff = await recordDeliveryFailure(inbox);

    logger.warn({
      message: 'Post delivery failed',
      inbox,
      error: error instanceof Error ? error.message : String(error),
      enteredBackoff,
      childIndex: job.data.childIndex,
      totalChildren: job.data.totalChildren
    });

    // If we entered backoff, still consider this a "handled" error
    // The job won't retry, but future deliveries to this host will be skipped
    if (enteredBackoff) {
      logger.info({
        message: 'Host entered circuit breaker backoff after repeated failures',
        inbox
      });
      // Don't throw - let the job complete so we don't retry against a dead server
      return true;
    }

    // Re-throw to trigger job retry (with exponential backoff)
    throw error;
  }
}

export { sendPostToInboxes };
