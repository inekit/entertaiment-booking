import { Sequelize } from 'sequelize-typescript';
import { User } from './models/user.model';
import { Event } from './models/event.model';
import { TimeSlot } from './models/timeslot.model';
import { Booking } from './models/booking.model';
import { SubSlot } from './models/subslot.model';
require('dotenv').config()

export const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres',
  database: process.env.DB_NAME || 'entertainment',
  models: [User, Event, TimeSlot, Booking, SubSlot],
  logging: false,
  sync: {
    alter: true,
  },
}); 