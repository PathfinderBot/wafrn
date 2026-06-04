import { DataTypes } from "sequelize";
import { Migration } from "../migrate.js";

export const up: Migration = async (params) => {
    const queryInterface = params.context;
    await queryInterface.createTable('blockedIps', {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        ip: { type: DataTypes.STRING(46), allowNull: false }
    });


};
export const down: Migration = async (params) => {
    const queryInterface = params.context;
    queryInterface.dropTable('blockedIps');



};
