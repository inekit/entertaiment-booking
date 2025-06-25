import { Table, Column, Model, DataType, HasMany, PrimaryKey, CreatedAt, UpdatedAt, AutoIncrement } from 'sequelize-typescript';
import { Booking } from './booking.model';

export interface UserCreationAttrs {
  telegram_id: number;
  name?: string;
}

@Table({ tableName: 'users' })
export class User extends Model<User, UserCreationAttrs> {
  @AutoIncrement
  @PrimaryKey
  @Column
  id!: number

  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    unique: true,
  })
  telegram_id!: number;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  name?: string;

  @CreatedAt
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  created_at!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  updated_at!: Date;

  @HasMany(() => Booking)
  bookings!: Booking[];
} 