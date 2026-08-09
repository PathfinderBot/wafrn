import { DataTypes } from 'sequelize'
import { Migration } from '../migrate.js'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.createTable('bites', {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    remoteId: {
      type: DataTypes.STRING(768),
      allowNull: true
    },
    biterId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: {
          tableName: 'users'
        }
      }
    },
    bittenId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: {
          tableName: 'users'
        }
      }
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  })
}

export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.dropTable('bites')
}
