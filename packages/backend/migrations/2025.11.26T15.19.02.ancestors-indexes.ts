import { DataTypes, Sequelize, UUIDV4 } from 'sequelize'
import { Migration } from '../migrate.js'
import { FederatedHost } from '../models/federatedHost.js'
import { User } from '../models/user.js'
import { DataType } from 'sequelize-typescript'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.sequelize.query(
    `CREATE INDEX IF NOT EXISTS postsancestors_postsId  ON "postsancestors" ("postsId");`
  )
  await queryInterface.sequelize.query(
    `CREATE INDEX IF NOT EXISTS postsancestors_ancestorId  ON "postsancestors" ("ancestorId");`
  )
}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.sequelize.query(`DROP INDEX postsancestors_postsId;`)
  await queryInterface.sequelize.query(`DROP INDEX postsancestors_ancestorId;`)
}
