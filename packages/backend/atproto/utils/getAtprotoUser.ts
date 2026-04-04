import { sequelize, User, UserOptions } from "../../models/index.js";
import { Op} from "sequelize";
import { wait } from "../../utils/wait.js";
import { logger } from "../../utils/logger.js";
import { getDeletedUser } from "../../utils/cacheGetters/getDeletedUser.js";
import { completeEnvironment } from "../../utils/backendOptions.js";
import { getDidDoc } from "../../utils/atproto/getDidDoc.js";
import { getRemoteActor } from "../../utils/activitypub/getRemoteActor.js";
import { Queue } from "bullmq";
import { getServerFromDid } from "../../utils/atproto/getServerFromDid.js";
import { resolveHandle } from "../../utils/atproto/resolveHandleToDid.js";
import getUserAgent from "../../utils/getUserAgent.js";

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
      await getAtprotoUser(did);
      await wait(100);
    }
  }
}

async function getAtprotoUser(
  inputHandle: string,
  options?: {ignoreCache?: boolean}
): Promise<User | undefined> {
  // we check if we found the user
  let avatarString = ``;
  let headerString = ``;
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
  const did = handle.startsWith('did:') ? handle : (await resolveHandle(handle, options?.ignoreCache == true)) as string
  const doc = await getDidDoc(did, options?.ignoreCache == true)
  if (userFound) {
    avatarString = userFound.avatar;

    // we check if it's bridgy fed pds by getting did doc of course
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
  // TODO check if current user exist
  let bskyUserResponse = undefined;
  try {
    const pds = await getServerFromDid(did, options?.ignoreCache)
    const response = await (await fetch(pds + `/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=app.bsky.actor.profile&limit=1&reverse=false`, {
      headers: {
        "User-Agent": getUserAgent('ATProtoWorker')
      }
    })).json()
    if (response && response.records && response.records[0]) {
      const pdsData = response.records[0]
      bskyUserResponse = pdsData
    }
  } catch (error) {
    return (await User.findOne({
      where: {
        url: completeEnvironment.deletedUser,
      },
    })) as User;
  }

  if (bskyUserResponse) {
    const data = bskyUserResponse;
    if (data.value.avatar) {
      let avatarCID = data.value.avatar.ref['$link'];
      if (avatarCID) {
        avatarString = `?cid=${avatarCID}&did=${did}`;
      }
    }
    if (data.value.banner) {
      let bannerCID = data.value.banner.ref['$link'];
      if (bannerCID) {
        headerString = `?cid=${bannerCID}&did=${did}`
      }
    }
    const fediAttachments = []
    if(data.value.pronouns) {
      fediAttachments.push({"type":"PropertyValue","name":"Pronouns","value": data.value.pronouns})
    }
    if(data.value.website) {
      fediAttachments.push({"type":"PropertyValue","name":"Website","value": `<a href="${data.value.website}">${data.value.website}</a>`})
    }

    const handle = (doc && doc.alsoKnownAs) ? doc.alsoKnownAs.filter(elem => elem.startsWith('at://'))[0].split('at://')[1] : 'handle.invalid'
    const newDataTmp = {
      hideProfileNotLoggedIn: false,
      hideFollows: false,
      bskyDid: did,
      url:
        "@" +
        (handle === "handle.invalid"
          ? `handle.invalid${data.did}`
          : handle),
      name: data.value.displayName ? data.value.displayName : handle,
      avatar: avatarString,
      description: data.value.description || "",
      //followingCount: data.followsCount as number,
      //followerCount: data.followersCount as number,
      headerImage: headerString,
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

    // future options thing
    if(userFound && fediAttachments.length > 0) {
      const transaction = await sequelize.transaction()
      try {
        await UserOptions.destroy({
          where: {
            userId: userFound.id
          },
          transaction: transaction
        })
        await UserOptions.create({
          public: true,
          optionName: 'fediverse.public.attachment',
          optionValue: JSON.stringify(fediAttachments),
          userId: userFound.id
        },
        {
          transaction: transaction
        }
        )
        await transaction.commit()
      } catch (error) {
        logger.info({ message: `Problem updating atproto user otpions`, error: error })
        await transaction.rollback()
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
    for (const usr of foundUsers) {
      if (!usr.email && !usr.remoteId) {
        if (usr.isBskyPrimary)
          usr.url = `@handle.invalid_${usr.bskyDid}_${new Date().getTime()}`;
        else
          usr.alternateUrl = `@handle.invalid_${usr.bskyDid}_${new Date().getTime()}`;
        await usr.save();
      }
    }
    return foundUsers.find((elem) => elem.bskyDid === did);
  }
}
export { getAtprotoUser, forcePopulateUsers };
