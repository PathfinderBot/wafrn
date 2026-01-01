import { DataTypes, Sequelize } from 'sequelize'
import { Migration } from '../migrate.js'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.addColumn('users', 'alternateUrl', {
    type: DataTypes.STRING,
    defaultValue: '',
    allowNull: true
  })
  await queryInterface.addColumn('users', 'isBskyPrimary', {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: true
  })
}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.removeColumn('users', 'alternateUrl')
  await queryInterface.removeColumn('users', 'isBskyPrimary')
}
