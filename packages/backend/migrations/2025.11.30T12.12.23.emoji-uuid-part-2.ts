import { DataTypes, Sequelize, UUIDV4 } from "sequelize";
import { Migration } from "../migrate.js";
import { FederatedHost } from "../models/federatedHost.js";
import { User } from "../models/user.js";
import { DataType } from "sequelize-typescript";
import { query } from "express";

export const up: Migration = async (params) => {
  const queryInterface = params.context;
  await queryInterface.sequelize.query(
    `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "emojis" ALTER COLUMN "uuid" SET DATA TYPE UUID USING (uuid_generate_v4()), 
ALTER COLUMN "uuid" SET DEFAULT uuid_generate_v4();`
  );
};
export const down: Migration = async (params) => {
  const queryInterface = params.context;
};
