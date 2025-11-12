import { DataTypes, Sequelize, UUIDV4 } from 'sequelize'
import { Migration } from '../migrate.js'
import { FederatedHost } from '../models/federatedHost.js'
import { User } from '../models/user.js'
import { DataType } from 'sequelize-typescript'

export const up: Migration = async (params) => {
  const queryInterface = params.context

  /* await queryInterface.sequelize.query(`UPDATE "posts" SET "bskyUri" = NULL WHERE "id" IN (select "id" from "posts" ou
where (select count(*) from "posts" inr
where inr."bskyUri" = ou."bskyUri") > 1);`);
*/
  await queryInterface.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS post_bsky_uri  ON "posts" ("bskyUri");`);

}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.sequelize.query(`DROP INDEX post_bsky_uri;`)
}
