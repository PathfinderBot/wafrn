import axios from "axios";
import { FederatedHost, User } from "../../models/index.js";
import { splitHandle } from "../../models/user.js";
import { logger } from "../logger.js";
import { getPetitionSigned } from "./getPetitionSigned.js";
import { getRemoteActor } from "./getRemoteActor.js";

async function searchRemoteUser(
  searchTerm: string,
  user: any
): Promise<User | null> {
  const searchData = splitHandle(searchTerm);
  const users: Array<any> = [];
  if (searchData && searchData.type === "fediverse") {
    // fediverse users are like emails right? god I hope so
    const username = searchData.username;
    const domain = searchData.domain;
    const domainBlocked = await FederatedHost.findOne({
      where: {
        displayName: domain,
        blocked: true,
      },
    });
    if (domainBlocked) {
      return null;
    }
    try {
      let remoteResponse = await getPetitionSigned(
        user,
        `https://${domain}/.well-known/webfinger/?resource=acct:${username}@${domain}`
      );
      if (!remoteResponse) {
        remoteResponse = await axios.get(
          `https://${domain}/.well-known/webfinger/?resource=acct:${username}@${domain}`
        );
      }
      if (!remoteResponse) {
        remoteResponse = await getPetitionSigned(
          user,
          `https://${domain}/.well-known/webfinger?resource=acct:${username}@${domain}`
        );
      }
      const links = remoteResponse.links;
      for await (const responseLink of links) {
        if (responseLink.rel === "self") {
          users.push(await getRemoteActor(responseLink.href, user, true));
        }
      }
    } catch (error) {
      logger.trace(`webfinger petition failed: ${searchTerm}`);
    }
  }
  return users.find((elem) => !!elem);
}

export { searchRemoteUser };
