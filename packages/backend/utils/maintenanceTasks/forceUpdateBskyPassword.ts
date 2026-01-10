import { Op } from "sequelize";
import { User } from "../../models/user.js";
import { completeEnvironment } from "../backendOptions.js";
import { forceUpdateBskyPassword } from "../atproto/updateUserDidDoc.js";



const args = process.argv.slice(2);

console.log(args)

const username = args[0]

const user = await User.findOne({
    where: {
        url: {
            [Op.iLike]: username
        }
    }
})

if(user && user.enableBsky && completeEnvironment.enableBsky) {
    let agent = await forceUpdateBskyPassword(user, true)
    if(agent) {
        console.log('succ ess')
    } else {
        console.log('error')
    }
} else {
    console.log('Failed to find '+ username + ' or they dont have bsky enabled')
}