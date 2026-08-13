import { DataTypes } from 'sequelize'
import { Migration } from '../migrate.js'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.addColumn('follows', 'hideReplies', {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  })
}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.removeColumn('follows', 'hideReplies')
}
