import { DataTypes } from 'sequelize';
import { Migration } from '../migrate.js';
import generateRandomString from '../utils/generateRandomString.js';

export const up: Migration = async params => {
  const queryInterface = params.context
  await queryInterface.createTable('inviteCodes', {
    code: {
      type: DataTypes.CHAR,
      allowNull: false,
      primaryKey: true,
      defaultValue: () => generateRandomString()
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    createdByUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: {
          tableName: 'users'
        }
      }
    },
    expirationDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    usedByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: {
          tableName: 'users'
        }
      }
    }
  })
}

export const down: Migration = async params => {
  const queryInterface = params.context
  await queryInterface.dropTable('inviteCodes')
}