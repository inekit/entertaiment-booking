import { Table, Column, Model, DataType, ForeignKey, BelongsTo, CreatedAt, UpdatedAt, AutoIncrement, PrimaryKey, HasMany } from 'sequelize-typescript';
import { Event } from './event.model';
import { Booking } from './booking.model';

export interface SubSlotCreationAttrs {
  event_id: number;
  title: string;
  capacity: number;
  order?: number;
}

@Table({ tableName: 'subslots' })
export class SubSlot extends Model<SubSlot, SubSlotCreationAttrs> {
  @AutoIncrement
  @PrimaryKey
  @Column
  id!: number;

  @ForeignKey(() => Event)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  event_id!: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  title!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  capacity!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  order?: number;

  @CreatedAt
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  created_at!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  updated_at!: Date;

  @BelongsTo(() => Event, 'event_id')
  event!: Event;

  @HasMany(() => Booking)
  bookings!: Booking[];
} 