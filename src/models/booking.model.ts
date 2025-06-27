import { Table, Column, Model, DataType, ForeignKey, BelongsTo, CreatedAt, UpdatedAt, HasMany } from 'sequelize-typescript';
import { User } from './user.model';
import { Event } from './event.model';
import { TimeSlot } from './timeslot.model';
import { SubSlot } from './subslot.model';
import { BookingMember } from './bookingmember.model';

export interface BookingCreationAttrs {
  user_id: number;
  event_id: number;
  timeslot_id: number;
  subslot_id: number;
}

@Table({ tableName: 'bookings' })
export class Booking extends Model<Booking, BookingCreationAttrs> {
  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  user_id!: number;

  @ForeignKey(() => Event)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  event_id!: number;

  @ForeignKey(() => TimeSlot)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  timeslot_id!: number;

  @ForeignKey(() => SubSlot)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  subslot_id!: number;

  @CreatedAt
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  created_at!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  updated_at!: Date;

  @BelongsTo(() => Event, 'event_id')
  event!: Event;

  @BelongsTo(() => TimeSlot, 'timeslot_id')
  timeslot!: TimeSlot;

  @BelongsTo(() => User, 'user_id')
  user!: User;

  @BelongsTo(() => SubSlot, 'subslot_id')
  subslot!: SubSlot;

  @HasMany(() => BookingMember)
  members!: BookingMember[];
} 