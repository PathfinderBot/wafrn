import { getAtProtoSession } from "./getAtProtoSession.js";
import { sequelize, User } from "../../models/index.js";
import { ProfileViewBasic } from "@atproto/api/dist/client/types/app/bsky/actor/defs.js";
import { Model, Op } from "sequelize";
import { wait } from "../../utils/wait.js";
import { logger } from "../../utils/logger.js";
import { getDeletedUser } from "../../utils/cacheGetters/getDeletedUser.js";
import { completeEnvironment } from "../../utils/backendOptions.js";
import { getDidDoc } from "../../utils/atproto/getDidDoc.js";
import { getRemoteActor } from "../../utils/activitypub/getRemoteActor.js";
import { Queue } from "bullmq";
import { getAdminAtprotoSession } from "../../utils/atproto/getAdminAtprotoSession.js";

const mergeUsersQueue = new Queue("mergeUsers", {
  connection: completeEnvironment.bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 6,
    backoff: {
      type: "exponential",
      delay: 25000,
    },
    removeOnFail: false,
  },
});

async function forcePopulateUsers(dids: string[], localUser: User) {
  const userFounds = await User.findAll({
    where: {
      bskyDid: {
        [Op.in]: dids,
      },
    },
  });
  const foundUsersDids = userFounds.map((elem) => elem.bskyDid);
  const notFoundUsers = dids.filter((elem) => !foundUsersDids.includes(elem));
  if (notFoundUsers.length > 0) {
    for await (const did of notFoundUsers) {
      await getAtprotoUser(did, localUser);
      await wait(100);
    }
  }
}

async function getAtprotoUser(
  inputHandle: string,
  localUser: User
): Promise<User | undefined> {
  // we check if we found the user
  let avatarString = ``;
  if (!inputHandle) {
    return (await getDeletedUser()) as User;
  }
  let handle = inputHandle;
  let userFound =
    handle == "handle.invalid"
      ? undefined
      : await User.scope("full").findOne({
        where: {
          [Op.or]: [
            {
              bskyDid: handle,
            },
            sequelize.where(
              sequelize.fn("lower", sequelize.col("url")),
              handle.toLowerCase()
            ),
            sequelize.where(
              sequelize.fn("lower", sequelize.col("alternateUrl")),
              handle.toLowerCase()
            ),
          ],
        },
      });
  // sometimes we can get the dids and if its a local user we just return it and thats it
  if (userFound && userFound.email) {
    return (await User.findByPk(userFound.id)) as User;
  }
  if (userFound) {
    avatarString = userFound.avatar;

    // we check if it's bridgy fed pds by getting did doc of course
    const doc = await getDidDoc(userFound.bskyDid ?? '')
    const bskyPds = doc?.service?.find(x => x.id === '#atproto_pds' || x.type === 'AtprotoPersonalDataServer')
    if (bskyPds && bskyPds.serviceEndpoint.toString().replace(/\/$/, '').endsWith('brid.gy')) {
      // bridgy user. find the alsoknownas user
      const allHttpsAlsoKnownAs = doc?.alsoKnownAs?.filter(x => x.startsWith('http')) ?? []
      let user: User | undefined = undefined
      for (const fediUser of allHttpsAlsoKnownAs) {
        const tempUser = await getRemoteActor(fediUser, userFound, true)
        if (tempUser) {
          user = tempUser
          break;
        }
      }
      if (user) {
        // found remote fedi user, now merge
        await mergeUsersQueue.add("mergeUsers", {
          primaryUserId: user.id,
          userToMergeId: userFound.id
        });

        // and return the user
        return user
      }
    }
  }
  const agent = await getAdminAtprotoSession()
  // TODO check if current user exist
  let bskyUserResponse = undefined;
  if (!bskyUserResponse) {
    try {
      bskyUserResponse = await agent.getProfile({ actor: handle });
    } catch (error) {
      return (await User.findOne({
        where: {
          url: completeEnvironment.deletedUser,
        },
      })) as User;
    }
  }
  if (bskyUserResponse.success) {
    const data = bskyUserResponse.data;
    if (data.avatar) {
      let avatarCID = data.avatar.split("/")[7];
      if (avatarCID) {
        avatarString = `?cid=${avatarCID.split("@jpeg")[0]}&did=${data.did}`;
      }
    }
    const newDataTmp = {
      hideProfileNotLoggedIn: false,
      hideFollows: false,
      bskyDid: data.did,
      url:
        "@" +
        (data.handle === "handle.invalid"
          ? `handle.invalid${data.did}`
          : data.handle),
      name: data.displayName ? data.displayName : data.handle,
      avatar: avatarString,
      description: data.description ? (data.description as string) : "",
      followingCount: data.followsCount as number,
      followerCount: data.followersCount as number,
      headerImage: data.banner as string,
      // bsky does not has this function lol
      manuallyAcceptsFollows: false,
      updatedAt: new Date(),
      activated: true,
    };
    userFound = userFound
      ? userFound
      : await internalGetDBUser(newDataTmp.bskyDid, newDataTmp.url);
    // if user is local OR user has fedi id and marked remoteid false we dont update from bsky
    if (userFound?.email || (userFound?.remoteId && !userFound.isBskyPrimary)) {
      return (await User.findByPk(userFound.id)) as User;
    }
    if (userFound && !userFound.email) {
      // we check just in case that user with url does not exist:
      const oldUser = await User.findOne({
        where: {
          url: newDataTmp.url,
          bskyDid: {
            [Op.ne]: newDataTmp.bskyDid,
          },
        },
      });
      if (oldUser) {
        logger.debug({
          message: `Duplicate bsky url event`,
          new: newDataTmp,
          old: oldUser.dataValues,
        });
        oldUser.url = `@handle.invalid${oldUser.bskyDid}${oldUser.url}`;
        await oldUser.save();
      }
      const newData: any = (!userFound.isBskyPrimary && userFound.url !== newDataTmp.url) ? {
        ...newDataTmp,
        url: userFound.url,
        alternateUrl:
          "@" +
          (data.handle === "handle.invalid"
            ? `handle.invalid${data.did}`
            : data.handle)
      } : {
        ...newDataTmp,
        isBskyPrimary: true
      }

      if (userFound.alternateUrl === userFound.url) {
        newData.alternateUrl = undefined
      }

      userFound.set(newData);
      await userFound.save();
    } else {
      try {
        userFound = await User.create(newDataTmp);
      } catch (error) {
        userFound = await internalGetDBUser(newDataTmp.bskyDid, newDataTmp.url);
      }
    }
    return userFound;
  }
}

async function internalGetDBUser(did: string, url: string) {
  const foundUsers = await User.scope("full").findAll({
    where: {
      [Op.or]: [
        {
          bskyDid: did,
        },
        sequelize.where(
          sequelize.fn("lower", sequelize.col("url")),
          url.toLowerCase()
        ),
        sequelize.where(
          sequelize.fn("lower", sequelize.col("alternateUrl")),
          url.toLowerCase()
        ),
      ],
    },
  });
  if ([0, 1].includes(foundUsers.length)) {
    return foundUsers[0];
  } else {
    // OH WOW SOMETHING OFF
    foundUsers.forEach(async (usr) => {
      if (!usr.email && !usr.remoteId) {
        if (usr.isBskyPrimary)
          usr.url = `@handle.invalid_${usr.bskyDid}_${new Date().getTime()}`;
        else
          usr.alternateUrl = `@handle.invalid_${usr.bskyDid}_${new Date().getTime()}`;
        await usr.save();
      }
    });
    return foundUsers.find((elem) => elem.bskyDid === did);
  }
}
export { getAtprotoUser, forcePopulateUsers };
