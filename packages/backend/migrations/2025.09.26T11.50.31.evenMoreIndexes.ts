import { DataTypes, Sequelize, UUIDV4 } from 'sequelize'
import { Migration } from '../migrate.js'
import { FederatedHost } from '../models/federatedHost.js'
import { User } from '../models/user.js'
import { DataType } from 'sequelize-typescript'

export const up: Migration = async (params) => {
  const queryInterface = params.context

  await queryInterface.sequelize.query(`CREATE INDEX questionPolls_postId ON public."questionPolls" ("postId");`)
  await queryInterface.sequelize.query(`CREATE INDEX asks_postId ON public."asks" ("postId");`)
  await queryInterface.sequelize.query(`CREATE INDEX emojis_name ON public."emojis" ("name");`)
  await queryInterface.sequelize.query(`CREATE INDEX emojis_external ON public."emojis" ("external");`)
  await queryInterface.sequelize.query(`CREATE INDEX quotes_quoter ON public."quotes" ("quoterPostId");`)
  await queryInterface.sequelize.query(`CREATE INDEX quotes_quoted ON public."quotes" ("quotedPostId");`)
}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.sequelize.query(`DROP INDEX questionPolls_postId`)
  await queryInterface.sequelize.query(`DROP INDEX asks_postId`)
  await queryInterface.sequelize.query(`DROP INDEX emojis_name`)
  await queryInterface.sequelize.query(`DROP INDEX emojis_external`)
  await queryInterface.sequelize.query(`DROP INDEX quotes_quoter`)
  await queryInterface.sequelize.query(`DROP INDEX quotes_quoted`)
}
