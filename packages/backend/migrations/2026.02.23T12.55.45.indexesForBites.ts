import { DataTypes, Sequelize, UUIDV4 } from "sequelize";
import { Migration } from "../migrate.js";
import { FederatedHost } from "../models/federatedHost.js";
import { User } from "../models/user.js";
import { DataType } from "sequelize-typescript";

export const up: Migration = async (params) => {
  const queryInterface = params.context;
  await queryInterface.sequelize.query(
    `CREATE INDEX IF NOT EXISTS bites_biter  ON "bites" ("biterId")`
  );
  await queryInterface.sequelize.query(
    `CREATE INDEX IF NOT EXISTS bites_bited  ON "bites" ("bittenId")`
  );
  await queryInterface.sequelize.query(
    `CREATE INDEX IF NOT EXISTS userBitesPostRelations_biter  ON "userBitesPostRelations" ("userId")`
  );
  await queryInterface.sequelize.query(
    `CREATE INDEX IF NOT EXISTS userBitesPostRelations_post  ON "userBitesPostRelations" ("postId")`
  );

};
export const down: Migration = async (params) => {
  const queryInterface = params.context;
  await queryInterface.sequelize.query(`DROP INDEX bites_biter;`);
  await queryInterface.sequelize.query(`DROP INDEX bites_bited;`);
  await queryInterface.sequelize.query(`DROP INDEX userBitesPostRelations_biter`);
  await queryInterface.sequelize.query(`DROP INDEX userBitesPostRelations_post`);

};
