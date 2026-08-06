import { DataTypes, Sequelize, UUIDV4 } from 'sequelize'
import { Migration } from '../migrate.js'
import { FederatedHost } from '../models/federatedHost.js'
import { User } from '../models/user.js'
import { DataType } from 'sequelize-typescript'

export const up: Migration = async (params) => {
  const queryInterface = params.context

  await queryInterface.sequelize.query(`CREATE INDEX idx_posts_userid_privacy ON posts("userId", "privacy");`)
  await queryInterface.sequelize.query(`CREATE INDEX idx_users_url_activated ON users(LOWER(url), activated);`)

}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.sequelize.query(`DROP INDEX idx_posts_userid_privacy;`)
  await queryInterface.sequelize.query(`DROP INDEX idx_users_url_activated;`)

}
