import { DataTypes } from 'sequelize'
import { Migration } from '../migrate.js'

// reply control would require this. we wait the other server to send us an approval if the thing is to true
export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.addColumn('posts', 'waitToSendPost', {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  })
}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.removeColumn('posts', 'waitToSendPost')
}
