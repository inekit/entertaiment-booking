import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany, PrimaryKey, UpdatedAt, CreatedAt, AutoIncrement } from 'sequelize-typescript';
import { Event } from './event.model';
import { Booking } from './booking.model';

export interface TimeSlotCreationAttrs {
  event_id: number;
  start_time: Date;
  end_time: Date;
}

@Table({ tableName: 'timeslots' })
export class TimeSlot extends Model<TimeSlot, TimeSlotCreationAttrs> {
  @AutoIncrement
  @PrimaryKey
  @Column
  id!: number

  @ForeignKey(() => Event)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  event_id!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  start_time!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  end_time!: Date;

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