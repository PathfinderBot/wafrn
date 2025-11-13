import { DataTypes, Sequelize, UUIDV4 } from 'sequelize'
import { Migration } from '../migrate.js'
import { FederatedHost } from '../models/federatedHost.js'
import { User } from '../models/user.js'
import { DataType } from 'sequelize-typescript'

export const up: Migration = async (params) => {
  const queryInterface = params.context

    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS post_bsky_uri_tmp  ON "posts" ("bskyUri");`);

  await queryInterface.sequelize.query(`UPDATE "posts" SET "bskyUri" = NULL WHERE "id" IN (select "id" from "posts" ou
where "bskyUri" IS NOT NULL and (select count(*) from "posts" inr
where inr."bskyUri" IS NOT NULL AND ou."bskyUri" IS NOT NULL AND inr."bskyUri" = ou."bskyUri") > 1);`);

  await queryInterface.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS post_bsky_uri  ON "posts" ("bskyUri");`);

    await queryInterface.sequelize.query(`DROP INDEX post_bsky_uri_tmp;`)


}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.sequelize.query(`DROP INDEX post_bsky_uri;`)
}
