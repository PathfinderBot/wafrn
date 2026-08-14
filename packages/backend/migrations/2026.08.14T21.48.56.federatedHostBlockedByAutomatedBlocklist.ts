import { DataTypes, QueryTypes } from 'sequelize'
import { Migration } from '../migrate.js'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.addColumn('federatedHosts', 'blockedByAutomatedBlocklist', {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  })
  
  await queryInterface.sequelize.query(`UPDATE "federatedHosts" SET "ignoreAutomatedBlocklist" = true WHERE "blocked" = true`, {
    type: QueryTypes.UPDATE
  })
}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.removeColumn('federatedHosts', 'blockedByAutomatedBlocklist')
}
