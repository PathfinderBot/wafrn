import { DataTypes, Sequelize, UUIDV4 } from "sequelize";
import { Migration } from "../migrate.js";
import { FederatedHost } from "../models/federatedHost.js";
import { User } from "../models/user.js";
import { DataType } from "sequelize-typescript";

export const up: Migration = async (params) => {
  const queryInterface = params.context;
  await queryInterface.addColumn("notifications", "detached", {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: true,
  });

  await queryInterface.addColumn("posts", "detached", {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: true,
  });

  await queryInterface.sequelize.query(
    `CREATE INDEX IF NOT EXISTS notification_detached  ON "notifications" ("detached");`
  );
    await queryInterface.sequelize.query(
    `CREATE INDEX IF NOT EXISTS post_detached  ON "posts" ("detached");`
  );
};
export const down: Migration = async (params) => {
  const queryInterface = params.context;
  await queryInterface.removeColumn("users", "detached");
  await queryInterface.removeColumn("posts", "detached");
};
