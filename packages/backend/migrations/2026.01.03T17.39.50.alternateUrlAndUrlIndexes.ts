import { DataTypes, Sequelize, UUIDV4 } from "sequelize";
import { Migration } from "../migrate.js";
import { FederatedHost } from "../models/federatedHost.js";
import { User } from "../models/user.js";
import { DataType } from "sequelize-typescript";

export const up: Migration = async (params) => {
  const queryInterface = params.context;
  await queryInterface.sequelize.query(
    `CREATE INDEX IF NOT EXISTS users_alternateUrl_and_url  ON "users" USING gin ("alternateUrl" gin_trgm_ops, "url" gin_trgm_ops);`
  );

};
export const down: Migration = async (params) => {
  const queryInterface = params.context;
  await queryInterface.sequelize.query(`DROP INDEX users_alternateUrl_and_url;`);
};
