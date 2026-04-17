import { DataTypes, Sequelize, UUIDV4 } from "sequelize";
import { Migration } from "../migrate.js";
import { FederatedHost } from "../models/federatedHost.js";
import { User } from "../models/user.js";
import { DataType } from "sequelize-typescript";

export const up: Migration = async (params) => {
  const queryInterface = params.context;
  await queryInterface.addColumn('posts', 'rootId', {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
        model: 'users',
        key: 'id'
    }
  })

  await queryInterface.addColumn('posts', 'isReply', {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  })

  await queryInterface.addColumn('posts', 'isBskyExclusive', {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  })
  

};
export const down: Migration = async (params) => {
    const queryInterface = params.context;
    await queryInterface.removeColumn('posts', 'rootId')
    await queryInterface.removeColumn('posts', 'isReply')
    await queryInterface.removeColumn('posts', 'isBskyExclusive')

};
