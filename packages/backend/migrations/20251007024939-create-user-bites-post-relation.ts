import { DataTypes } from 'sequelize'
import { Migration } from '../migrate.js'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.createTable('userBitesPostRelations', {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: {
          tableName: 'users'
        }
      }
    },
    postId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: {
          tableName: 'posts'
        }
      }
    },
    remoteId: {
      type: DataTypes.STRING(768),
      allowNull: true
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
  await queryInterface.dropTable('userBitesPostRelations')
}
