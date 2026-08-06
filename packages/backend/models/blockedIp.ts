import { Model, Table, Column, DataType } from 'sequelize-typescript'

export interface BlockedIpsAttributes {
    ip: string
}

@Table({
    tableName: 'blockedIps',
    modelName: 'blockedIps',
    timestamps: false
})
export class BlockedIps
    extends Model<BlockedIpsAttributes, BlockedIpsAttributes>
    implements BlockedIpsAttributes {
    @Column({
        allowNull: false,
        type: DataType.STRING(46)
    })
    declare ip: string

    @Column({
        primaryKey: true,
        type: DataType.UUID,
        defaultValue: DataType.UUIDV4
    })
    declare id: string
}
