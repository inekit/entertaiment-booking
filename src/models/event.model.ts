import { Table, Column, Model, DataType, HasMany, PrimaryKey, CreatedAt, UpdatedAt } from 'sequelize-typescript';
import { Booking } from './booking.model';
import { TimeSlot } from './timeslot.model';
import { SubSlot } from './subslot.model';

export interface EventCreationAttrs {
  title: string;
  description?: string;
  capacity: number;
}

@Table({ tableName: 'events' })
export class Event extends Model<Event, EventCreationAttrs> {
  @PrimaryKey
  @Column
  id!: number

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  title!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  capacity!: number;

  @CreatedAt
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  created_at!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  updated_at!: Date;

  @HasMany(() => Booking)
  bookings!: Booking[];

  @HasMany(() => TimeSlot)
  timeslots!: TimeSlot[];

  @HasMany(() => SubSlot)
  subslots!: SubSlot[];
} 