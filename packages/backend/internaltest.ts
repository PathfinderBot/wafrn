import { Op } from "sequelize";
import { migrateUserFedi } from "./utils/activitypub/migrateUser.js";
import { User } from "./models/index.js";
import { getAtprotoUser } from "./atproto/utils/getAtprotoUser.js";


const atUser = await getAtprotoUser( 'did:plc:an2e3qjrwpfizkms3k2li23v', {ignoreCache: true})

console.log(atUser)