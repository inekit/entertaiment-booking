import { Telegraf, Markup } from 'telegraf';
import { sequelize } from './db';
require('dotenv').config()
import LocalSession = require("telegraf-session-local")
import { getMainMenu, getEventsInline, getEventInfo, getPeopleCountInline, getSlotsInlineWithCounts, getAdminMenu, getParticipantsList, getParticipantsInlineBack } from './bot-menu';
import { Event } from './models/event.model';
import { TimeSlot } from './models/timeslot.model';
import { Booking } from './models/booking.model';
import { User } from './models/user.model';

const bot = new Telegraf(process.env.BOT_TOKEN!);

// Подключаем session
bot.use((new LocalSession({ database: 'session_db.json' })).middleware());

// Расширяем типизацию контекста для session
declare module 'telegraf/typings/context' {
  interface Context {
    session?: {
      slotId?: number;
      eventId?: number;
      free?: number;
      admin?: boolean;
    };
  }
}

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    console.log('База данных успешно подключена и синхронизирована!');
  } catch (error) {
    console.error('Ошибка подключения к базе данных:', error);
    process.exit(1);
  }

  bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
})();





// Регистрация пользователя при первом запуске
bot.use(async (ctx, next) => {
  if (ctx.from) {
    const [user] = await User.findOrCreate({
      where: { telegram_id: ctx.from.id },
      defaults: { telegram_id: ctx.from.id, name: ctx.from.first_name },
    });
    ctx.state.user = user;
  }
  return next();
});

// Главное меню с админ-кнопкой
bot.start((ctx) => {
  const welcome = `
*Дорогой участник турслёта!* 👋

Здесь можно _записаться на свободные локации_, которые работают с *15:30 до 18:30*.
Можно записать себя, коллегу или любимого ребёнка.

Не забывай о *мастер-классах* в шатре — туда можно попасть в свободном формате и сделать свою уникальную вещь:
• сотворить браслет из бусин
• расписать значок
• расписать фрисби

_Хорошего тебе отдыха!_

*Помни:* если ты хочешь отменить запись — это легко сделать здесь же.
`;
  if (ctx.from && ctx.from.id === Number(process.env.ADMIN_ID)) {
    return ctx.reply('Добро пожаловать, админ!', getAdminMenu());
  }
  return ctx.reply(welcome, { parse_mode: 'Markdown', ...getMainMenu() });
});

bot.hears('👑 Админ-панель', async (ctx) => {
  if (!ctx.from || ctx.from.id !== Number(process.env.ADMIN_ID)) return;
  const events = await Event.findAll();
  if (!events.length) return ctx.reply('Нет мероприятий.');
  await ctx.reply('Выберите мероприятие для просмотра:', getEventsInline(events));
  ctx.session = { admin: true };
});

// Выбор мероприятия в админ-режиме
bot.action(/event_(\d+)/, async (ctx, next) => {
  if (ctx.session && ctx.session.admin && ctx.from && ctx.from.id === Number(process.env.ADMIN_ID)) {
    const eventId = Number(ctx.match[1]);
    const event = await Event.findByPk(eventId);
    const slots = await TimeSlot.findAll({ where: { event_id: eventId } });
    if (!slots.length) return ctx.editMessageText('Нет слотов для этого мероприятия.');
    await ctx.editMessageText(`*${event?.title || 'Мероприятие'}*\n\nВыберите слот:`, {
      parse_mode: 'Markdown',
      ...getSlotsInlineWithCounts(slots, {}, [], 0),
    });
    ctx.session.eventId = eventId;
    return;
  }
  return next();
});

// Выбор слота в админ-режиме
bot.action(/slot_(\d+)/, async (ctx, next) => {
  if (ctx.session && ctx.session.admin && ctx.from && ctx.from.id === Number(process.env.ADMIN_ID)) {
    const slotId = Number(ctx.match[1]);
    const slot = await TimeSlot.findByPk(slotId);
    const event = slot ? await Event.findByPk(slot.event_id) : null;
    const bookings = await Booking.findAll({
      where: { timeslot_id: slotId },
      include: [{ model: User, as: 'user' }],
    });
    const participants = bookings.map((b) => ({
      name: b.user?.name || '',
      telegram_id: b.user?.telegram_id || 0,
      friends_count: b.friends_count,
    }));
    const used = bookings.reduce((acc, b) => acc + b.friends_count + 1, 0);
    const free = event ? event.capacity - used : 0;
    const slotInfo = slot && event
      ? `*${event.title}*\nВремя: ${slot.start_time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${slot.end_time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nСвободно мест: ${free}`
      : '';
    await ctx.editMessageText(`${slotInfo}\n\n${getParticipantsList(participants)}`, {
      parse_mode: 'Markdown',
      ...getParticipantsInlineBack(),
    });
    ctx.session.slotId = slotId;
    return;
  }
  return next();
});

// Главное меню
bot.hears('🗓 Мероприятия и запись', async (ctx) => {
  // Для админа открываем обычное меню пользователя
  const events = await Event.findAll();
  if (!events.length) return ctx.reply('Нет доступных мероприятий.');
  // Если это callback (editMessageText), иначе reply
  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText('Выберите мероприятие:', getEventsInline(events));
  } else {
    await ctx.reply('Выберите мероприятие:', getEventsInline(events));
  }
});

// Список мероприятий (inline)
bot.action(/event_(\d+)/, async (ctx) => {
  const eventId = Number(ctx.match[1]);
  const event = await Event.findByPk(eventId);
  if (!event) return ctx.answerCbQuery('Мероприятие не найдено');
  const slots = await TimeSlot.findAll({ where: { event_id: event.id } });
  const bookings = await Booking.findAll({ where: { event_id: event.id } });
  const used = bookings.reduce((acc, b) => acc + b.friends_count + 1, 0);
  const free = event.capacity - used;
  const slotCounts: Record<number, number> = {};
  for (const slot of slots) {
    slotCounts[slot.id] = bookings
      .filter((b) => b.timeslot_id === slot.id)
      .reduce((acc, b) => acc + b.friends_count + 1, 0);
  }
  // Получаем все записи пользователя для поиска пересечений
  let disabledSlotIds: number[] = [];
  if (ctx.state.user) {
    const userBookings = await Booking.findAll({
      where: { user_id: ctx.state.user.id },
      include: [{ model: TimeSlot, as: 'timeslot' }],
    });
    disabledSlotIds = slots
      .filter((slot) =>
        userBookings.some((b) => {
          const s = b.timeslot;
          if (!s) return false;
          const newStart = slot.start_time.getTime();
          const newEnd = slot.end_time.getTime();
          const existStart = s.start_time.getTime();
          const existEnd = s.end_time.getTime();
          return newStart < existEnd && newEnd > existStart;
        })
      )
      .map((slot) => slot.id);
  }
  await ctx.editMessageText(getEventInfo(event, free, slots), {
    parse_mode: 'Markdown',
    ...getSlotsInlineWithCounts(slots, slotCounts, disabledSlotIds, event.capacity),
  });
});

// Обработка нажатия на неактивную кнопку
bot.action('disabled_slot', async (ctx) => {
  await ctx.answerCbQuery('Вы не можете записаться на этот слот, так как у вас уже есть пересекающаяся запись.');
});

// Выбор слота (inline)
bot.action(/slot_(\d+)/, async (ctx) => {
  const slotId = Number(ctx.match[1]);
  const slot = await TimeSlot.findByPk(slotId);
  if (!slot) return ctx.answerCbQuery('Слот не найден');
  // Проверяем мероприятие и свободные места
  const event = await Event.findByPk(slot.event_id);
  if (!event) return ctx.answerCbQuery('Мероприятие не найдено');
  const bookings = await Booking.findAll({ where: { event_id: event.id, timeslot_id: slot.id } });
  const used = bookings.reduce((acc, b) => acc + b.friends_count + 1, 0);
  const free = event.capacity - used;
  if (free <= 0) return ctx.answerCbQuery('Нет свободных мест на этот слот');
  // Информация о мероприятии и выбранном слоте
  const slotInfo = `*${event.title}*\n${event.description ? event.description + '\n' : ''}Время: ${slot.start_time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${slot.end_time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  await ctx.editMessageText(`${slotInfo}\n\nСколько человек записать? (свободно: ${free})`, {
    parse_mode: 'Markdown',
    ...getPeopleCountInline(free),
  });
  ctx.session = { slotId, eventId: event.id, free };
});

// Выбор количества человек (inline)
bot.action(/people_(\d+)/, async (ctx) => {
  const count = Number(ctx.match[1]);
  const session = ctx.session || {};
  if (!session.slotId || !session.eventId || !session.free) {
    return ctx.reply('Пожалуйста, выберите слот заново.');
  }
  if (count < 1 || count > Math.min(4, session.free)) {
    return ctx.reply('Некорректное количество человек.');
  }
  // Проверка на пересечение записей
  const slot = await TimeSlot.findByPk(session.slotId);
  if (!slot) return ctx.reply('Слот не найден.');
  const userBookings = await Booking.findAll({
    where: { user_id: ctx.state.user.id },
    include: [{ model: TimeSlot, as: 'timeslot' }],
  });
  const overlap = userBookings.some((b) => {
    const s = b.timeslot;
    if (!s) return false;
    const newStart = slot.start_time.getTime();
    const newEnd = slot.end_time.getTime();
    const existStart = s.start_time.getTime();
    const existEnd = s.end_time.getTime();
    return (
      (newStart < existEnd && newEnd > existStart)
    );
  });
  if (overlap) {
    return ctx.reply('У вас уже есть запись на другой слот, пересекающийся по времени!');
  }
  const exists = await Booking.findOne({
    where: {
      user_id: ctx.state.user.id,
      event_id: session.eventId,
      timeslot_id: session.slotId,
    },
  });
  if (exists) {
    return ctx.reply('Вы уже записаны на этот слот!');
  }
  await Booking.create({
    user_id: ctx.state.user.id,
    event_id: session.eventId,
    timeslot_id: session.slotId,
    friends_count: count - 1,
  });
  await ctx.reply('Вы успешно записаны!');
});

// Мои записи / отмена записи
bot.hears('❌ Мои записи / Отменить запись', async (ctx) => {
  const bookings = await Booking.findAll({
    where: { user_id: ctx.state.user.id },
    include: [
      { model: Event, as: 'event' },
      { model: TimeSlot, as: 'timeslot' },
    ],
  });
  if (!bookings.length) return ctx.reply('У вас нет активных записей.');
  for (const booking of bookings) {
    const event = booking.event;
    const slot = booking.timeslot;
    let text = `*${event.title}*\n`;
    text += `Время: ${slot.start_time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${slot.end_time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n`;
    text += `Количество человек: ${booking.friends_count + 1}`;
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Отменить запись', `cancel_${booking.id}`)],
      ]),
    });
  }
});

// Обработка отмены записи
bot.action(/cancel_(\d+)/, async (ctx) => {
  const bookingId = Number(ctx.match[1]);
  const booking = await Booking.findByPk(bookingId);
  if (!booking || booking.user_id !== ctx.state.user.id) {
    return ctx.answerCbQuery('Запись не найдена или не принадлежит вам');
  }
  await booking.destroy();
  await ctx.editMessageText('Запись отменена.');
});

// Кнопка назад к списку мероприятий
bot.action('back_to_events', async (ctx) => {
  const events = await Event.findAll();
  await ctx.editMessageText('Выберите мероприятие:', getEventsInline(events));
});

// Кнопка назад к списку слотов в админ-панели
bot.action('admin_back_to_slots', async (ctx) => {
  const session = ctx.session || {};
  if (!session.eventId) return ctx.answerCbQuery('Сначала выберите мероприятие');
  const event = await Event.findByPk(session.eventId);
  const slots = await TimeSlot.findAll({ where: { event_id: session.eventId } });
  await ctx.editMessageText(`*${event?.title || 'Мероприятие'}*\n\nВыберите слот:`, {
    parse_mode: 'Markdown',
    ...getSlotsInlineWithCounts(slots, {}, [], 0),
  });
});


