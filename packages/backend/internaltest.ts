import { Op } from "sequelize";
import { migrateUserFedi } from "./utils/activitypub/migrateUser.js";
import { User } from "./models/index.js";


const origin = await User.findOne({
    where: {
        url: {
            [Op.iLike]: 'pocketbroto'
        }
    }
})

const target = await User.findOne({
    where: {
        url: {
            [Op.iLike]: 'brotosolar'
        }
    }
})

const result = await migrateUserFedi(origin as User, target as User)

console.log(result)