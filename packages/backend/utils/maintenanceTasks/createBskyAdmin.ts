import { Op } from "sequelize";
import { User } from "../../models/user.js";
import { completeEnvironment } from "../backendOptions.js";
import { forceUpdateBskyPassword } from "../atproto/updateUserDidDoc.js";
import { getAdminUser } from "../getAdminAndDeletedUser.js";
import { BskyInviteCodes } from "../../models/index.js";
import { AtpAgent } from "@atproto/api";
import { createBskyAccount } from "../../routes/users.js";
import generateRandomString from "../generateRandomString.js";



const args = process.argv.slice(2);


const name = args[0]

const user = await getAdminUser()

if(user && !user.enableBsky && completeEnvironment.enableBsky) {
    console.log(`Trying to create user: @${name + '.' + completeEnvironment.bskyPds}`)
    const inviteCodeRecord = await BskyInviteCodes.findOne({
              where: {
                masterCode: true,
              },
            });
    const inviteCode = inviteCodeRecord?.code as string;
    const serviceUrl = completeEnvironment.bskyPds
        ? completeEnvironment.bskyPds.startsWith("http")
            ? completeEnvironment.bskyPds
            : "https://" + completeEnvironment.bskyPds
        : "";
    const agent = new AtpAgent({
                service: serviceUrl,
              });
    const password = generateRandomString()
    await createBskyAccount({
            agent,
            user,
            password,
            inviteCode,
            url: name
          });
    console.log('Done! Please do recheck now')

} else {
    console.log(`It seems that ${user.url} has enabled bsky already or your server has bsky disabled`)
}