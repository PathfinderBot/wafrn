import { createHash, createSign } from "node:crypto";
import { completeEnvironment } from "../backendOptions.js";
import { logger } from "../logger.js";
import { User } from "../../models/index.js";
import { removeUser } from "./removeUser.js";
import { Op } from "sequelize";
import { Agent, fetch } from "undici";
async function getPetitionSigned(
  userInput: User,
  target: string
): Promise<any> {
  let petitionResponse: any;
  let res = undefined;
  const user = (await User.scope("full").findByPk(userInput.id)) as User;
  try {
    const url = new URL(target);
    const privKey = user.privateKey;
    const acceptedFormats = "application/activity+json,application/json";
    const signingOptions = {
      key: privKey,
      keyId: `${
        completeEnvironment.frontendUrl
      }/fediverse/blog/${user.url.toLocaleLowerCase()}#main-key`,
      algorithm: "rsa-sha256",
      authorizationHeaderName: "signature",
      headers: ["(request-target)", "host", "date", "accept"],
    };
    const sendDate = new Date();
    const stringToSign = `(request-target): get ${url.pathname}\nhost: ${
      url.host
    }\ndate: ${sendDate.toUTCString()}\naccept: ${acceptedFormats}`;

    const digest = createHash("sha256").update(stringToSign).digest("base64");
    const signer = createSign("sha256");
    signer.update(stringToSign);
    signer.end();
    const signature = signer.sign(user.privateKey as string).toString("base64");
    const header = `keyId="${
      completeEnvironment.frontendUrl
    }/fediverse/blog/${user.url.toLocaleLowerCase()}#main-key",algorithm="rsa-sha256",headers="(request-target) host date accept",signature="${signature}"`;
    const headers = {
      "Content-Type": "application/activity+json",
      "User-Agent": completeEnvironment.instanceUrl,
      Accept: acceptedFormats,
      Algorithm: "rsa-sha256",
      Host: url.host,
      Date: sendDate.toUTCString(),
      Digest: `SHA-256=${digest}`,
      Signature: header,
    };
    petitionResponse = await fetch(url.href, {
      headers: headers,
    });
    if (petitionResponse.ok) {
      res = await petitionResponse.json();
    } else {
      logger.trace({
        message: "Error petition: " + petitionResponse.status,
        url: target,
      });
    }
  } catch (error: any) {
    logger.debug({
      message: `Problem doing petition to ${target}`,
      error,
    });
    if (petitionResponse.status === 410) {
      const webfingerUrl = target.split(
        ".well-known/webfinger/?resource=acct:"
      )[1];
      const webFingerCase = webfingerUrl
        ? webfingerUrl
        : "@@NOT_VALID_URL@@NOTVALID";
      const userToRemove = await User.findOne({
        where: {
          [Op.or]: [
            {
              remoteInbox: target,
            },
            {
              remoteId: target,
            },
            {
              url: "@" + webFingerCase,
            },
            {
              url: webFingerCase,
            },
          ],
        },
      });
      if (userToRemove) {
        await removeUser(userToRemove.id);
      }
    } else {
      logger.trace({
        message: "Error with signed get petition",
        url: target,
        error: error,
      });
    }
  }
  return res;
}

export { getPetitionSigned };
