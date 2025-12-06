import {
  Model, Table, Column, DataType, ForeignKey, BelongsTo
} from "sequelize-typescript";
import { generateRandomStringInviteCode } from "../utils/generateRandomString.js";
import { User } from "./index.js";

export interface InviteCodeAttributes {
  code?: string
  createdAt?: Date
  updatedAt?: Date
  createdByUserId: string
  expirationDate: Date
  usedByUserId?: string | null
}

@Table({
  tableName: "inviteCodes",
  modelName: "inviteCodes",
  timestamps: true
})
export class InviteCode extends Model<InviteCodeAttributes, InviteCodeAttributes> implements InviteCodeAttributes {
  @Column({
    primaryKey: true,
    type: DataType.CHAR,
    defaultValue: () => generateRandomStringInviteCode()
  })
  declare code: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID
  })
  declare createdByUserId: string

  @Column({
    type: DataType.DATE,
    defaultValue: () => {
      const date = new Date()
      date.setDate(date.getDate() + 7)
      return date
    }
  })
  declare expirationDate: Date;

  @ForeignKey(() => User)
  @Column({
    allowNull: true,
    type: DataType.UUID
  })
  declare usedByUserId: string | null

  @BelongsTo(() => User, 'createdByUserId')
  declare createdBy: User

  @BelongsTo(() => User, 'usedByUserId')
  declare usedBy: User

  get isUsedOrExpired() {
    return this.usedByUserId || new Date() > this.expirationDate
  }
}
