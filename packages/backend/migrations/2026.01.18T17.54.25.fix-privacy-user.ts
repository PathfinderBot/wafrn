import { DataTypes, Sequelize } from 'sequelize'
import { Migration } from '../migrate.js'
import { EmojiCollection } from '../models/emojiCollection.js'
import { Emoji } from '../models/emoji.js'
import { wait } from '../utils/wait.js'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  const userIdtoFix = await queryInterface.sequelize.query(
    `SELECT "id" FROM "users" WHERE "url" ILIKE '@silt@cofe.rocks'`
  )
  if (userIdtoFix[0]) {
    let userId = (userIdtoFix[0][0] as { id: string } | undefined)?.id
    if (userId) {
      let tmp = await queryInterface.sequelize.query(
        `UPDATE "posts" SET "privacy"=1 WHERE "userId"='${userId}' AND "privacy"=3`
      )
      console.log(tmp)
    }
  }
}
export const down: Migration = async (params) => {
  // nah
}
