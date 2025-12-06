import { DataTypes, Sequelize, UUIDV4 } from "sequelize";
import { Migration } from "../migrate.js";
import { FederatedHost } from "../models/federatedHost.js";
import { User } from "../models/user.js";
import { DataType } from "sequelize-typescript";

export const up: Migration = async (params) => {
  const queryInterface = params.context;
  await queryInterface.addColumn("emojis", "uuid", {
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  });
  await queryInterface.sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS emoji_uuid  ON "emojis" ("uuid");`
  );
};
export const down: Migration = async (params) => {
  const queryInterface = params.context;
  queryInterface.removeColumn("emojis", "uuid");
};
