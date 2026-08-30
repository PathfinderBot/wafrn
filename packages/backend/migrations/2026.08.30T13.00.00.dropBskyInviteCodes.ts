import { DataTypes } from 'sequelize'
import { Migration } from '../migrate.js'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.dropTable('bskyInviteCodes')
}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.createTable('bskyInviteCodes', {
    id: {
      type: DataTypes.INTEGER,
      field: 'id',
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    code: {
      type: DataTypes.STRING(512),
      field: 'code'
    },
    masterCode: {
      type: DataTypes.BOOLEAN,
      field: 'masterCode',
      defaultValue: false
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'createdAt',
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updatedAt',
      allowNull: false
    }
  })
}
