import { DataTypes } from 'sequelize'
import { Migration } from '../migrate.js'

// FEP-6fce: stores the ReplyAuthorization/AnnounceAuthorization URL received from a remote
// server after a manual-approval reply/reblog (waitToSendPost) has been accepted.
export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.addColumn('posts', 'authorizationUrl', {
    type: DataTypes.STRING,
    defaultValue: null,
    allowNull: true
  })
}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.removeColumn('posts', 'authorizationUrl')
}
