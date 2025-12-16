import { DataTypes, Sequelize, UUIDV4 } from "sequelize";
import { Migration } from "../migrate.js";
import { FederatedHost } from "../models/federatedHost.js";
import { User } from "../models/user.js";
import { DataType } from "sequelize-typescript";

export const up: Migration = async (params) => {
  const queryInterface = params.context;
  await queryInterface.addColumn("users", "displayUrl", {
    type: DataTypes.TEXT,
    defaultValue: null,
    allowNull: true,
  });

  await queryInterface.addColumn("posts", "displayUrl", {
    type: DataTypes.TEXT,
    defaultValue: null,
    allowNull: true,
  });
};
export const down: Migration = async (params) => {
  const queryInterface = params.context;
  await queryInterface.removeColumn("users", "displayUrl");
  await queryInterface.removeColumn("posts", "displayUrl");
};
