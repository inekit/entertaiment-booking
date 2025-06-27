import { Telegraf, Markup, Context } from 'telegraf';
import { sequelize } from './db';
require('dotenv').config()
import LocalSession = require("telegraf-session-local")
import { getMainMenu, getEventsInline, getEventInfo, getPeopleCountInline, getSlotsInlineWithCounts, getAdminMenu, getParticipantsList, getParticipantsInlineBack, getAdminBookingsListWithButtons } from './bot-menu';
import { Event } from './models/event.model';
import { TimeSlot } from './models/timeslot.model';
import { Booking } from './models/booking.model';
import { User } from './models/user.model';
import { UpdateType } from 'telegraf/typings/telegram-types';
import * as fs from 'fs';
import * as path from 'path';
import { Sequelize } from 'sequelize-typescript';
import { SubSlot } from './models/subslot.model';
import { getMyBookingsMenu, getBookingDetailMenu } from './my-bookings-menu';
import { BookingMember } from './models/bookingmember.model';
import { WhereOptions } from 'sequelize';
import { CallbackQuery, Update } from 'telegraf/typings/core/types/typegram';

const bot = new Telegraf(process.env.BOT_TOKEN!);

// Подключаем session
bot.use((new LocalSession({ database: 'session_db.json' })).middleware());

const allowed_updates:UpdateType[] = ["message", "callback_query", "chat_member"];

// Расширяем типизацию контекста для session
declare module 'telegraf/typings/context' {
  interface Context {
    session?: {
      slotId?: number;
      eventId?: number;
      subslotId?: number;
      free?: number;
      admin?: boolean;
      friends?: string[];
      addingFriend?: boolean;
      lastMessageId?:number
    };
  }
}

const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim()).filter(Boolean).map(Number);
function isAdmin(userId: number) {
  return ADMIN_IDS.includes(userId);
}

async function importEventsIfNeeded(sequelize: Sequelize) {
  if (process.env.IMPORT_EVENTS === '1') {
    const sqlPath = path.join(__dirname, '../sql/events_import.sql');
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      try {
        await sequelize.query(sql);
        console.log('Импорт мероприятий из events_import.sql выполнен!');
      } catch (e) {
        console.error('Ошибка импорта мероприятий:', e);
      }
    } else {
      console.warn('Файл events_import.sql не найден!');
    }
  }
}

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    await importEventsIfNeeded(sequelize);
    console.log('База данных успешно подключена и синхронизирована!');
  } catch (error) {
    console.error('Ошибка подключения к базе данных:', error);
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production") {
    bot.catch(console.error);

    const secretPath = `/clothes/telegraf/${bot.secretPathComponent()}`;

    console.log(secretPath);

    await bot.launch({
      webhook: {
        domain: process.env.SERVER_URI,
        hookPath: secretPath,
        host: '127.0.0.1',
        port: +(process.env.PORT ?? 3030),
      },
      //allowedUpdates: allowed_updates,
      dropPendingUpdates: true,
    });

    console.log(await bot.telegram.getWebhookInfo());
  } else {
    await bot.launch({
      allowedUpdates: allowed_updates,
      dropPendingUpdates: true,
    });
  }

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
  if (ctx.from && isAdmin(ctx.from.id)) {
    return ctx.reply('Добро пожаловать, админ!', getAdminMenu());
  }
  return ctx.reply(welcome, { parse_mode: 'Markdown', ...getMainMenu() });
});


async function sendAdminMenu(ctx:Context,isEdit?:boolean){

const reply = (isEdit? ctx.editMessageText: ctx.reply).bind(ctx)
  if (!ctx.from || !isAdmin(ctx.from.id)) return;
  const events = await Event.findAll({ order: [['id', 'ASC']] });
  if (!events.length) return reply('Нет мероприятий.');
  await reply('Выберите мероприятие для просмотра:', getEventsInline(events,true));
  ctx.session = { admin: true };
}

bot.hears('👑 Админ-панель', async (ctx) => {
    sendAdminMenu(ctx)
});

// Выбор мероприятия в админ-режиме
bot.action(/event_admin_(\d+)/, async (ctx, next) => {
  await safeAnswerCbQuery(ctx);

  if (ctx.session &&  ctx.from && isAdmin(ctx.from.id)) {

    const eventId = Number(ctx.match[1]);
    const event = await Event.findByPk(eventId);
    const slots = await TimeSlot.findAll({ where: { event_id: eventId } });
    if (!slots.length) {
      try {
        await ctx.editMessageText('Нет слотов для этого мероприятия.');
      } catch (e: any) {
        if (e.description?.includes('message is not modified')) {
          //await safeAnswerCbQuery(ctx, 'Уже выбрано.');
        } else {
          throw e;
        }
      }
      return;
    }
    try {
      await ctx.editMessageText(`*${event?.title || 'Мероприятие'}*\n\nВыберите слот:`, {
        parse_mode: 'Markdown',
        ...getSlotsInlineWithCounts(slots,true, {}, [], 0),
      });
    } catch (e: any) {
      if (e.description?.includes('message is not modified')) {
        //await safeAnswerCbQuery(ctx, 'Уже выбрано.');
      } else {
        throw e;
      }
    }
    ctx.session.eventId = eventId;
    return;
  }
  return next();
});

async function sendSlotAdminMenu(ctx: Context,slotId: number) {
    const slot = await TimeSlot.findByPk(slotId);
    const event = slot ? await Event.findByPk(slot.event_id) : null;
    const bookings = await Booking.findAll({
      where: { timeslot_id: slotId },
      include: [
        { model: User, as: 'user' },
        { model: SubSlot, as: 'subslot' },
        { model: BookingMember, as: 'members' },
      ],
    });
    // Для админки: список записей с участниками
    const bookingList = bookings.map((b) => ({
      id: b.id,
      members: b.members?.map(m => m.name) || [],
      subslot_title: b.subslot ? b.subslot.title : undefined,
    }));
    const {text, keyboard} = getAdminBookingsListWithButtons(bookingList);
    const used = bookings.reduce((acc, b) => acc + (b.members?.length || 0), 0);
    const free = event ? event.capacity - used : 0;
    const slotInfo = slot && event
      ? `*${event.title}*\nВремя: ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}\nСвободно мест: ${free}`
      : '';
    await ctx.editMessageText(`${slotInfo}\n\n${text}`, {
      parse_mode: 'Markdown',
      ...(keyboard ? { ...keyboard } : getParticipantsInlineBack()),
    });
    ctx.session.slotId = slotId;
    return;
}

// Выбор слота в админ-режиме
bot.action(/slot_admin_(\d+)/, async (ctx, next) => {
  await safeAnswerCbQuery(ctx);

  if (ctx.session && ctx.from && isAdmin(ctx.from.id)) {
    const slotId = Number((ctx as any).match[1]);
   return await sendSlotAdminMenu(ctx,slotId)
  }
  return next();
});

// Главное меню
bot.hears('🗓 Мероприятия и запись', async (ctx) => {
  const events = await Event.findAll({ order: [['id', 'ASC']] });
  if (!events.length) return ctx.reply('Нет доступных мероприятий.');
  if (ctx.callbackQuery) {
    await ctx.editMessageText('Выберите мероприятие:', getEventsInline(events));
  } else {
    await ctx.reply('Выберите мероприятие:', getEventsInline(events));
  }
});

// Список мероприятий (inline)
bot.action(/event_(\d+)/, async (ctx) => {
  const eventId = Number(ctx.match[1]);
  const event = await Event.findByPk(eventId);
  if (!event) return safeAnswerCbQuery(ctx, 'Мероприятие не найдено');
  await safeAnswerCbQuery(ctx);

  const slots = await TimeSlot.findAll({ where: { event_id: event.id } });
  // Получаем все бронирования для всех слотов этого мероприятия
  const allBookings = await Booking.findAll({ where: { event_id: event.id } });
  // Для каждого слота считаем bookingIds и BookingMember.count
  const slotCounts: Record<number, number> = {};
  for (const slot of slots) {
    const bookings = allBookings.filter(b => b.timeslot_id === slot.id);
    const bookingIds = bookings.map(b => b.id);
    slotCounts[slot.id] = bookingIds.length > 0 ? await BookingMember.count({ where: { booking_id: bookingIds } }) : 0;
  }
  // used — всего участников по всем слотам
  const used = Object.values(slotCounts).reduce((a, b) => a + b, 0);
  const free = event.capacity - used;
  // Получаем все записи пользователя для поиска пересечений
  let disabledSlotIds: number[] = [];
  if (ctx.state.user) {
    const userBookings = await Booking.findAll({
      where: { user_id: ctx.state.user.id },
      include: [{ model: TimeSlot, as: 'timeslot' }],
    });
    disabledSlotIds = 
    slots
      .filter((slot) =>
        userBookings.some((b) => {
          const s = b.timeslot;
          if (!s) return false;
         // if (slot.id===s.id) return false;
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
    ...getSlotsInlineWithCounts(slots, false, slotCounts, disabledSlotIds, event.capacity),
  });
});

// Обработка нажатия на неактивную кнопку
bot.action('disabled_slot', async (ctx) => {
  await safeAnswerCbQuery(ctx, 'Вы уже записаны на это время.');
});

// Меню для записи с друзьями
function getBookingMenu(free: number, friends: string[], eventId: number) {
  let text = `Список участников:\n`;
  if (friends.length === 0) {
    text += '_Пока никто не добавлен_';
  } else {
    friends.forEach((name, i) => {
      text += `\n${i + 1}. ${name}`;
    });
  }
  text += `\n\nСвободно еще мест: ${free}`;
  text += `\n\nДобавьте себя и/или друзей. Каждый участник должен быть добавлен по отдельности.`;
  text += `\n\nКогда все участники добавлены, нажмите ✅ для подтверждения.`;

  const buttons = [
    ...(friends.length > 0 && free >= 0 ? [[Markup.button.callback('✅ Подтвердить запись', 'confirm_booking')]] : []),
    ...(free > 0 ? [[Markup.button.callback('👨 Добавить участника', 'add_friend')]] : []),
    [Markup.button.callback('⬅️ Назад', `event_${eventId}`)],
  ];

  return {
    text,
    keyboard: Markup.inlineKeyboard(buttons),
  };
}

async function getFreePlacesCount(event:Event,slotId:number,capacity: number,subslotId?: number){
    // Считаем свободные места по слоту
  const whereClause: WhereOptions = { event_id: event.id, timeslot_id: slotId }
    if (subslotId!==undefined) whereClause.subslot_id = subslotId
console.log(234,subslotId)
    const bookings = await Booking.findAll({ where: whereClause });
    const bookingIds = bookings.map(b => b.id);
    const taken = bookingIds.length > 0 ? await BookingMember.count({ where: { booking_id: bookingIds } }) : 0;
    const free = capacity - taken;

    return free
}

// Выбор слота (inline)
bot.action(/slot_(\d+)/, async (ctx) => {
  const slotId = Number(ctx.match[1]);
  const slot = await TimeSlot.findByPk(slotId);
  if (!slot) return ctx.answerCbQuery('Слот не найден');
  const event = await Event.findByPk(slot.event_id, { include: [SubSlot] });
  if (!event) return ctx.answerCbQuery('Мероприятие не найдено');
  if (!event.subslots || event.subslots.length === 0) {
    // Нет SubSlot — сразу меню записи
    // Считаем свободные места по слоту
    const free = await getFreePlacesCount(event,slot.id,event.capacity);
    if (free <= 0) return ctx.answerCbQuery('Нет свободных мест на этот слот');
    await safeAnswerCbQuery(ctx);

    ctx.session = { slotId, eventId: event.id, free, friends: [] };
    const slotInfo = `*${event.title}*\n${event.description ? event.description + '\n' : ''}Время: ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}`;
    const menu = getBookingMenu(free, [],event.id);
    await ctx.editMessageText(`${slotInfo}\n\n${menu.text}`, {
      parse_mode: 'Markdown',
      ...menu.keyboard,
    });
    return;
  }
  await safeAnswerCbQuery(ctx);

  // Если есть SubSlot — показываем выбор SubSlot
  const buttons = [];
  for (const subslot of event.subslots) {
    const bookings = await Booking.findAll({ where: { timeslot_id: slot.id, subslot_id: subslot.id } });
    const bookingIds = bookings.map(b => b.id);
    const used = bookingIds.length > 0 ? await BookingMember.count({ where: { booking_id: bookingIds } }) : 0;
    const free = subslot.capacity - used;
    buttons.push([Markup.button.callback(`${subslot.title} (свободно: ${free})`, `s2lot_${slot.id}_${subslot.id}`)]);
  }
  buttons.push([Markup.button.callback('⬅️ Назад', `event_${event.id}`)]);
  await ctx.editMessageText(
    `*${event.title}*\n${event.description ? event.description + '\n' : ''}Время: ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}\n\nВыберите ${
      event.id === 8 ? 'команду' : event.id === 1 ? 'лодку' : 'катамаран'}:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons),
    }
  );
  ctx.session = { slotId, eventId: event.id };
});

// Добавить друга
bot.action('add_friend', async (ctx) => {
  const session = ctx.session || {};
  // Динамически считаем свободные места
  let free = 0;
  if (session.subslotId) {
    const slot = await TimeSlot.findByPk(session.slotId);
    const subslot = await SubSlot.findByPk(session.subslotId);
    if (slot && subslot) {
      const bookings = await Booking.findAll({ where: { timeslot_id: slot.id, subslot_id: subslot.id } });
      const bookingIds = bookings.map(b => b.id);
      const taken = bookingIds.length > 0 ? await BookingMember.count({ where: { booking_id: bookingIds } }) : 0;
      free = subslot.capacity - taken - (session.friends?.length || 0);
    }
  } else if (session.slotId) {
    const slot = await TimeSlot.findByPk(session.slotId);
    if (slot) {
      const event = await Event.findByPk(slot.event_id);
      if (event) {
        const bookings = await Booking.findAll({ where: { timeslot_id: slot.id } });
        const bookingIds = bookings.map(b => b.id);
        const taken = bookingIds.length > 0 ? await BookingMember.count({ where: { booking_id: bookingIds } }) : 0;
        free = event.capacity - taken - (session.friends?.length || 0);
      }
    }
  }
  if (free <= 0) {
    return ctx.answerCbQuery('Больше добавить нельзя!');
  }
  await safeAnswerCbQuery(ctx);
  ctx.session.addingFriend = true;
  let sentMessage;
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    try {
      sentMessage = await ctx.editMessageText('Введите имя и фамилию участника:', {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Назад', `basket_back_${session.eventId}`)]
        ]),
      });
    } catch (e) {
      sentMessage = await ctx.reply('Введите имя и фамилию участника:');
    }
  } else {
    sentMessage = await ctx.reply('Введите имя и фамилию участника:');
  }
  ctx.session.lastMessageId = sentMessage.message_id;
});

// Кнопка назад к корзине участников
bot.action(/basket_back_(\d+)/, async (ctx) => {
  await safeAnswerCbQuery(ctx);
  await backToBasket(ctx, true);
});

async function backToBasket(ctx: any, isEdit?: boolean) {
  // Показываем меню снова
  const slot = await TimeSlot.findByPk(ctx.session.slotId);
  let event = null;
  let slotInfo = '';
  let menu;
  const friendsCount = ctx.session.friends?.length || 0;
  const reply = (isEdit ? ctx.editMessageText : ctx.reply).bind(ctx);

  if (ctx.session.subslotId) {
    const subslot = await SubSlot.findByPk(ctx.session.subslotId);
    event = slot && subslot ? await Event.findByPk(slot.event_id) : null;
    if (!slot || !event || !subslot) return reply('Ошибка. Попробуйте выбрать слот заново.');
    slotInfo = `*${event.title}*\n${event.description ? event.description + '\n' : ''}Время: ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}\nКоманда/лодка: ${subslot.title}`;
    // Считаем занятые места только в этом subslot+slot
    const free = (await getFreePlacesCount(event,slot.id, subslot.capacity,subslot.id)) - friendsCount;

    menu = getBookingMenu(free, ctx.session.friends, event.id);
  } else {
    event = slot ? await Event.findByPk(slot.event_id) : null;
    if (!slot || !event) return reply('Ошибка. Попробуйте выбрать слот заново.');
    slotInfo = `*${event.title}*\n${event.description ? event.description + '\n' : ''}Время: ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}`;
    // Считаем занятые места только в этом слоте
    const free = (await getFreePlacesCount(event,slot.id, event.capacity)) - friendsCount;

    menu = getBookingMenu(free, ctx.session.friends, event.id);
  }
  const sent = await reply(`${slotInfo}\n\n${menu.text}`, {
    parse_mode: 'Markdown',
    ...menu.keyboard,
  });
  if (!isEdit && ctx.message && ctx.message.message_id) {
    // Удаляем сообщение пользователя с именем
    try { await ctx.deleteMessage(ctx.message.message_id); } catch {}
  }
}

bot.on('text', async (ctx, next) => {
  if (ctx.session && ctx.session.addingFriend) {
    const name = ctx.message.text.trim();
    if (!name) return ctx.reply('Имя не может быть пустым. Введите имя и фамилию участника:');
    ctx.session.friends = ctx.session.friends || [];
    // Динамически считаем свободные места
    let free = 0;
    if (ctx.session.subslotId) {
      const slot = await TimeSlot.findByPk(ctx.session.slotId);
      const subslot = await SubSlot.findByPk(ctx.session.subslotId);
      if (slot && subslot) {
        const bookings = await Booking.findAll({ where: { timeslot_id: slot.id, subslot_id: subslot.id } });
        const bookingIds = bookings.map(b => b.id);
        const taken = bookingIds.length > 0 ? await BookingMember.count({ where: { booking_id: bookingIds } }) : 0;
        free = subslot.capacity - taken - (ctx.session.friends?.length || 0);
      }
    } else if (ctx.session.slotId) {
      const slot = await TimeSlot.findByPk(ctx.session.slotId);
      if (slot) {
        const event = await Event.findByPk(slot.event_id);
        if (event) {
          const bookings = await Booking.findAll({ where: { timeslot_id: slot.id } });
          const bookingIds = bookings.map(b => b.id);
          const taken = bookingIds.length > 0 ? await BookingMember.count({ where: { booking_id: bookingIds } }) : 0;
          free = event.capacity - taken - (ctx.session.friends?.length || 0);
        }
      }
    }
    if (free <= 0) {
      ctx.session.addingFriend = false;
      return ctx.reply('Больше добавить нельзя!');
    }
    ctx.session.friends.push(name);
    ctx.session.addingFriend = false;
    // Удаляем сообщение "Введите имя и фамилию участника:" если оно было
    if (ctx.message.reply_to_message && ctx.message.reply_to_message.message_id) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.reply_to_message.message_id);
      } catch {}
    }
    if (ctx.session.lastMessageId){
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.lastMessageId);
        delete ctx.session.lastMessageId
    }
    await backToBasket(ctx)
    return;
  }
  return next();
});

// Подтвердить запись
bot.action('confirm_booking', async (ctx) => {
  await safeAnswerCbQuery(ctx);
  const session = ctx.session || {};
  if (!session.slotId || !session.eventId || !session.friends || session.friends.length === 0) {
    return ctx.reply('Пожалуйста, выберите слот и добавьте участников.');
  }
  // Создаём бронь
  const booking = await Booking.create({
    user_id: ctx.state.user.id,
    event_id: session.eventId,
    timeslot_id: session.slotId,
    subslot_id: session.subslotId || null,
  });
  // Добавляем участников
  for (const name of session.friends) {
    await BookingMember.create({ booking_id: booking.id, name });
  }
  await ctx.editMessageText('Вы успешно записаны!');
  ctx.session = {};
  if (ctx.from && isAdmin(ctx.from.id)) {
    return await ctx.reply('Главное меню', getAdminMenu());
  }
  await ctx.reply('Главное меню', getMainMenu());
});

// Мои записи с меню и пагинацией
bot.hears('❌ Мои записи / Отменить запись', async (ctx) => {
  const bookings = await Booking.findAll({
    where: { user_id: ctx.state.user.id },
    include: [ { model: Event, as: 'event' }, { model: TimeSlot, as: 'timeslot' } ]
  });
  if (!bookings.length) return ctx.reply('У вас нет активных записей.');
  const { text, keyboard } = getMyBookingsMenu(bookings, 0);
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action(/mybookings_page_(\d+)/, async (ctx) => {
  await safeAnswerCbQuery(ctx);
  const page = Number(ctx.match[1]);
  const bookings = await Booking.findAll({
    where: { user_id: ctx.state.user.id },
    include: [ { model: Event, as: 'event' }, { model: TimeSlot, as: 'timeslot' } ]
  });
  const { text, keyboard } = getMyBookingsMenu(bookings, page);
  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action(/mybooking_(\d+)/, async (ctx) => {
  await safeAnswerCbQuery(ctx);
  const bookingId = Number(ctx.match[1]);
  const booking = await Booking.findByPk(bookingId, { include: [ { model: Event, as: 'event' }, { model: TimeSlot, as: 'timeslot' }, { model: BookingMember, as: 'members' } ] });
  if (!booking) return ctx.editMessageText('Запись не найдена.');
  const { text, keyboard } = getBookingDetailMenu(booking);
  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action(/remove_member_(\d+)/, async (ctx) => {
  await safeAnswerCbQuery(ctx);
  const memberId = Number(ctx.match[1]);
  const member = await BookingMember.findByPk(memberId);
  if (!member) return ctx.editMessageText('Участник не найден.');
  const bookingId = member.booking_id;
  await member.destroy();
  // Проверяем, остались ли участники
  const membersLeft = await BookingMember.count({ where: { booking_id: bookingId } });
  
  const query = ctx.callbackQuery?.['data']
  const isAdminLocal = query && query.startsWith('admin') && ctx.from && isAdmin(ctx.from.id)

  if (membersLeft === 0) {
    const booking = await Booking.findByPk(bookingId);
    if (!booking) return ctx.editMessageText('Запись не найдена.');
    await booking.destroy();
    await safeAnswerCbQuery(ctx, 'Запись удалена.');

    
    if (isAdminLocal) {
      await sendSlotAdminMenu(ctx,booking.timeslot_id);
      return
   }

    const bookings = await Booking.findAll({
      where: { user_id: ctx.state.user.id },
      include: [ { model: Event, as: 'event' }, { model: TimeSlot, as: 'timeslot' } ]
    });
    const { text, keyboard } = getMyBookingsMenu(bookings, 0);
    return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await safeAnswerCbQuery(ctx, 'Участник удалён.');

    if (isAdminLocal) {
      await sendAdminBookingMenu(ctx,bookingId)
      return
    }
    const booking = await Booking.findByPk(bookingId, { include: [ { model: Event, as: 'event' }, { model: TimeSlot, as: 'timeslot' }, { model: BookingMember, as: 'members' } ] });
    const { text, keyboard } = getBookingDetailMenu(booking!);
    return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  }
});

bot.action(/delete_booking_(\d+)/, async (ctx) => {
  
  await safeAnswerCbQuery(ctx);
  const bookingId = Number(ctx.match[1]);
  const booking = await Booking.findByPk(bookingId);
  if (!booking) return ctx.editMessageText('Запись не найдена.');
  await booking.destroy();
  await safeAnswerCbQuery(ctx, 'Запись удалена.');

  const query = ctx.callbackQuery?.['data']
  if (query && query.startsWith('admin') && ctx.session && ctx.from && isAdmin(ctx.from.id)) {
     await sendSlotAdminMenu(ctx,booking.timeslot_id);
     return
  }
  // Возвращаемся в меню моих записей

  const bookings = await Booking.findAll({
    where: { user_id: ctx.state.user.id },
    include: [ { model: Event, as: 'event' }, { model: TimeSlot, as: 'timeslot' } ]
  });
  const { text, keyboard } = getMyBookingsMenu(bookings, 0);
  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action('back_to_mybookings', async (ctx) => {
  await safeAnswerCbQuery(ctx);
  const bookings = await Booking.findAll({
    where: { user_id: ctx.state.user.id },
    include: [ { model: Event, as: 'event' }, { model: TimeSlot, as: 'timeslot' } ]
  });
  const { text, keyboard } = getMyBookingsMenu(bookings, 0);
  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
});

bot.action('close_mybookings', async (ctx) => {
  await safeAnswerCbQuery(ctx);
  try { await ctx.deleteMessage(); } catch {}
});

// Кнопка назад к списку мероприятий
bot.action('back_to_events', async (ctx) => {
  await safeAnswerCbQuery(ctx);

  const events = await Event.findAll({ order: [['id', 'ASC']] });
  try {
    await ctx.editMessageText('Выберите мероприятие:', getEventsInline(events));
  } catch (e: any) {
    if (e.description?.includes('message is not modified')) {
      //await safeAnswerCbQuery(ctx, 'Уже выбрано.');
    } else {
      throw e;
    }
  }
});

// Кнопка назад к списку мероприятий
bot.action('admin_bta', async (ctx) => {
    await safeAnswerCbQuery(ctx);
    sendAdminMenu(ctx,true)
  });
  



// Кнопка назад к списку слотов в админ-панели
bot.action('admin_bts', async (ctx) => {

  const session = ctx.session || {};
  if (!session.eventId) return ctx.answerCbQuery('Сначала выберите мероприятие');

  await safeAnswerCbQuery(ctx);

  const event = await Event.findByPk(session.eventId);
  const slots = await TimeSlot.findAll({ where: { event_id: session.eventId } });
  await ctx.editMessageText(`*${event?.title || 'Мероприятие'}*\n\nВыберите слот:`, {
    parse_mode: 'Markdown',
    ...getSlotsInlineWithCounts(slots,true, {}, [], 0),
  });
});

bot.action(/s2lot_(\d+)_(\d+)/, async (ctx) => {
    console.log('sslot')

  const slotId = Number(ctx.match[1]);
  const subslotId = Number(ctx.match[2]);
  const slot = await TimeSlot.findByPk(slotId);
  const subslot = await SubSlot.findByPk(subslotId);
  if (!slot || !subslot) return ctx.answerCbQuery('Ошибка выбора команды/лодки');
  const event = await Event.findByPk(subslot.event_id);
  if (!event) return ctx.answerCbQuery('Мероприятие не найдено');
  // Считаем свободные места в этом subslot+slot
  const free = await getFreePlacesCount(event,slot.id,subslot.capacity,subslot.id);
  if (free <= 0) return ctx.answerCbQuery('Нет свободных мест в этой команде/лодке');
  
  ctx.session = { slotId, eventId: event.id, subslotId: subslot.id, free, friends: [] };
  const slotInfo = `*${event.title}*\n${event.description ? event.description + '\n' : ''}Время: ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}\nКоманда/лодка: ${subslot.title}`;
  const menu = getBookingMenu(free, [],event.id);

  await safeAnswerCbQuery(ctx);

  await ctx.editMessageText(`${slotInfo}\n\n${menu.text}`, {
    parse_mode: 'Markdown',
    ...menu.keyboard,
  });
});

function formatTime(date: Date) {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Etc/GMT0' });
}

// Универсальная функция для безопасного вызова answerCbQuery
async function safeAnswerCbQuery(ctx: any, text?: string) {
  try {
    await ctx.answerCbQuery(text);
  } catch (e) {
    // ignore
  }
}


async function sendAdminBookingMenu(ctx: Context,bookingId: number){
  const booking = await Booking.findByPk(bookingId, { include: [ { model: Event, as: 'event' }, { model: TimeSlot, as: 'timeslot' }, { model: BookingMember, as: 'members' }, { model: SubSlot, as: 'subslot' } ] });
  if (!booking) return ctx.editMessageText('Запись не найдена.');
  const members = booking.members || [];
  // Формируем список участников
  let membersText = '—';
  if (members.length > 0) {
    membersText = members.map((m, i) => `${i + 1}. ${m.name}`).join('\n');
  }
  // Кнопки удаления участников в 2 ряда
  const memberButtons = [];
  for (let i = 0; i < members.length; i += 2) {
    const row = [];
    row.push(Markup.button.callback(`Удалить: ${members[i].name}`, `admin_remove_member_${members[i].id}`));
    if (members[i + 1]) {
      row.push(Markup.button.callback(`Удалить: ${members[i + 1].name}`, `admin_remove_member_${members[i + 1].id}`));
    }
    memberButtons.push(row);
  }
  memberButtons.push([Markup.button.callback('❌ Удалить запись', `admin_delete_booking_${booking.id}`)]);
  memberButtons.push([Markup.button.callback('⬅️ Назад', `slot_admin_${booking.timeslot_id}`)]);
  const text = `*${booking.event?.title}*\nВремя: ${formatTime(booking.timeslot?.start_time)}–${formatTime(booking.timeslot?.end_time)}${booking.subslot ? `\nКоманда/лодка: ${booking.subslot.title}` : ''}\n\nУчастники:\n${membersText}`;
  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(memberButtons) });

}

// Меню состояния записи для админа
bot.action(/admin_booking_(\d+)/, async (ctx) => {
  await safeAnswerCbQuery(ctx);
  const bookingId = Number((ctx as any).match[1]);
  await sendAdminBookingMenu(ctx,bookingId)
});


