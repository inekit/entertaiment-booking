import { Telegraf, Markup, Context } from 'telegraf';
import { sequelize } from './db';
require('dotenv').config()
import LocalSession = require("telegraf-session-local")
import { getMainMenu, getEventsInline, getEventInfo, getPeopleCountInline, getSlotsInlineWithCounts, getAdminMenu, getParticipantsList, getParticipantsInlineBack } from './bot-menu';
import { Event } from './models/event.model';
import { TimeSlot } from './models/timeslot.model';
import { Booking } from './models/booking.model';
import { User } from './models/user.model';
import { UpdateType } from 'telegraf/typings/telegram-types';
import * as fs from 'fs';
import * as path from 'path';
import { Sequelize } from 'sequelize-typescript';
import { SubSlot } from './models/subslot.model';

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
  const events = await Event.findAll();
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

// Выбор слота в админ-режиме
bot.action(/slot_admin_(\d+)/, async (ctx, next) => {
  await safeAnswerCbQuery(ctx);

  if (ctx.session && ctx.from && isAdmin(ctx.from.id)) {
    const slotId = Number(ctx.match[1]);
    const slot = await TimeSlot.findByPk(slotId);
    const event = slot ? await Event.findByPk(slot.event_id) : null;
    const bookings = await Booking.findAll({
      where: { timeslot_id: slotId },
      include: [
        { model: User, as: 'user' },
        { model: SubSlot, as: 'subslot' },
      ],
    });
    const participants = bookings.map((b) => ({
      name: b.user?.name || '',
      telegram_id: b.user?.telegram_id || 0,
      friends_count: b.friends_count,
      friends_names: b.friends_names,
      subslot_title: b.subslot ? b.subslot.title : undefined,
    }));
    const used = bookings.reduce((acc, b) => acc + b.friends_count + 1, 0);
    const free = event ? event.capacity - used : 0;
    const slotInfo = slot && event
      ? `*${event.title}*\nВремя: ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}\nСвободно мест: ${free}`
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
  const events = await Event.findAll();
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
    disabledSlotIds = [];
/*
slots
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
      .map((slot) => slot.id);*/
  }


  await ctx.editMessageText(getEventInfo(event, free, slots), {
    parse_mode: 'Markdown',
    ...getSlotsInlineWithCounts(slots, false,slotCounts, disabledSlotIds, event.capacity),
  });
});

// Обработка нажатия на неактивную кнопку
bot.action('disabled_slot', async (ctx) => {
  await safeAnswerCbQuery(ctx, 'Вы не можете записаться на этот слот, так как у вас уже есть пересекающаяся запись.');
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
  const realFreePlaces = free - friends.length;
  text += `\n\nСвободно еще мест: ${realFreePlaces}`;
  text += `\n\nДобавьте себя и/или друзей. Каждый участник должен быть добавлен по отдельности.`;
  text += `\n\nКогда все участники добавлены, нажмите ✅ для подтверждения.`;

  const buttons = [
    ...(friends.length > 0 ? [[Markup.button.callback('✅ Подтвердить запись', 'confirm_booking')] ] : []),
    [Markup.button.callback('👨 Добавить участника', 'add_friend')],
    [Markup.button.callback('⬅️ Назад', `event_${eventId}`)],
  ];
  if (realFreePlaces === 0) buttons.splice(1, 1);

  return {
    text,
    keyboard: Markup.inlineKeyboard(buttons),
  };
}

async function getFreePlacesCount(event:Event,slotId:number){
    // Считаем свободные места по слоту
    const bookings = await Booking.findAll({ where: { event_id: event.id, timeslot_id: slotId } });
    const used = bookings.reduce((acc, b) => acc + b.friends_count + 1, 0);
    const free = event.capacity - used;
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
    const free = await getFreePlacesCount(event,slot.id);
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

  console.log('slot')

  // Если есть SubSlot — показываем выбор SubSlot
  const bookings = await Booking.findAll({ where: { event_id: event.id, timeslot_id: slot.id } });
  const subslotCounts: Record<number, number> = {};
  for (const subslot of event.subslots) {
    subslotCounts[subslot.id] = bookings
      .filter((b) => b.subslot_id === subslot.id)
      .reduce((acc, b) => acc + b.friends_count + 1, 0);
  }
  const buttons = event.subslots.map((subslot) => {
    const used = subslotCounts[subslot.id] || 0;
    const free = subslot.capacity - used;
    return [Markup.button.callback(`${subslot.title} (свободно: ${free})`, `s2lot_${slot.id}_${subslot.id}`)];
  });
  buttons.push([Markup.button.callback('⬅️ Назад', `event_${event.id}`)]);
  await ctx.editMessageText(
    `*${event.title}*\n${event.description ? event.description + '\n' : ''
    }Время: ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}\n\nВыберите ${ 
      event.id === 8? 'команду': event.id === 1?'лодку':'катамаран'}:`,
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
  if (!session.slotId || !session.eventId || session.friends?.length >= session.free) {
    return ctx.answerCbQuery('Больше добавить нельзя!');
  }
  await safeAnswerCbQuery(ctx);

  ctx.session.addingFriend = true;

  let sentMessage
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

  ctx.session.lastMessageId = sentMessage.message_id
});


bot.action(/basket_back_(\d+)/, async (ctx) => {
    await safeAnswerCbQuery(ctx);

    await backToBasket(ctx,true)
})



async function backToBasket(ctx: Context,isEdit?:boolean){
    // Показываем меню снова
    const slot = await TimeSlot.findByPk(ctx.session.slotId);
    let event = null;
    let slotInfo = '';
    let menu;

    const reply = (isEdit? ctx.editMessageText: ctx.reply).bind(ctx)

    if (ctx.session.subslotId) {
      const subslot = await SubSlot.findByPk(ctx.session.subslotId);
      event = slot && subslot ? await Event.findByPk(slot.event_id) : null;
      if (!slot || !event || !subslot) return reply('Ошибка. Попробуйте выбрать слот заново.');
      slotInfo = `*${event.title}*\n${event.description ? event.description + '\n' : ''}Время: ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}\nКоманда/лодка: ${subslot.title}`;
      const free = await getFreePlacesCount(event,slot.id);

      menu = getBookingMenu(free, ctx.session.friends,event.id);
    } else {
      event = slot ? await Event.findByPk(slot.event_id) : null;
      if (!slot || !event) return reply('Ошибка. Попробуйте выбрать слот заново.');
      slotInfo = `*${event.title}*\n${event.description ? event.description + '\n' : ''}Время: ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}`;
      const free = await getFreePlacesCount(event,slot.id);

      menu = getBookingMenu(free, ctx.session.friends,event.id);
    }
    const sent = await reply(`${slotInfo}\n\n${menu.text}`, {
      parse_mode: 'Markdown',
      ...menu.keyboard,
    });
    if (!isEdit){
        // Удаляем сообщение пользователя с именем
        try { await ctx.deleteMessage(ctx.message.message_id); } catch {}  
    }
  
}

// Обработка ввода имени друга
bot.on('text', async (ctx, next) => {
  if (ctx.session && ctx.session.addingFriend) {
    const name = ctx.message.text.trim();
    if (!name) return ctx.reply('Имя не может быть пустым. Введите имя и фамилию участника:');
    ctx.session.friends = ctx.session.friends || [];
    if (ctx.session.friends.length >= ctx.session.free) {
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
    console.log( 23,ctx.session.lastMessageId)

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

  const session = ctx.session || {};
  if (!session.slotId || !session.eventId || !session.free) {
    return ctx.reply('Пожалуйста, выберите слот заново.');
  }
  if (!session.friends || session.friends.length === 0) {
    return ctx.answerCbQuery('Добавьте хотя бы одного участника!');
  }

  await safeAnswerCbQuery(ctx);

  const count = session.friends.length;
  if (count > session.free) {
    return ctx.reply('Недостаточно свободных мест!');
  }
  /*
  let exists;
  if (session.subslotId) {
    exists = await Booking.findOne({
      where: {
        user_id: ctx.state.user.id,
        event_id: session.eventId,
        timeslot_id: session.slotId,
        subslot_id: session.subslotId,
      },
    });
  } else {
    exists = await Booking.findOne({
      where: {
        user_id: ctx.state.user.id,
        event_id: session.eventId,
        timeslot_id: session.slotId,
        subslot_id: null,
      },
    });
  }
  if (exists) {
    return ctx.reply('Вы уже записаны на этот слот!');
  }*/
  await Booking.create({
    user_id: ctx.state.user.id,
    event_id: session.eventId,
    timeslot_id: session.slotId,
    subslot_id: session.subslotId || null,
    friends_count: count - 1,
    friends_names: session.friends || [],
  });
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    try {
      await ctx.editMessageText('Вы успешно записаны!');
    } catch (e) {
      await ctx.reply('Вы успешно записаны!');
    }
  } else {
    await ctx.reply('Вы успешно записаны!');
  }

  ctx.session = {};
  if (ctx.from && isAdmin(ctx.from.id)) {
    return await ctx.reply('Главное меню', getAdminMenu());
  }
  await ctx.reply('Главное меню', getMainMenu());

});

// Мои записи / отмена записи
bot.hears('❌ Мои записи / Отменить запись', async (ctx) => {
  const bookings = await Booking.findAll({
    where: { user_id: ctx.state.user.id },
    include: [
      { model: Event, as: 'event' },
      { model: TimeSlot, as: 'timeslot' },
      { model: SubSlot, as: 'subslot' },
    ],
  });
  if (!bookings.length) return ctx.reply('У вас нет активных записей.');
  for (const booking of bookings) {
    const event = booking.event;
    const slot = booking.timeslot;
    const subslot = booking.subslot;
    let text = `*${event.title}*\n`;
    text += `Время: ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}\n`;
    if (subslot) {
      text += `Команда/лодка: ${subslot.title}\n`;
    }
    if (booking.friends_names && booking.friends_names.length) {
      text += `Участники: ${booking.friends_names.join(', ')}`;
    }
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

  await safeAnswerCbQuery(ctx);
  await booking.destroy();
  await ctx.editMessageText('Запись отменена.');
});

// Кнопка назад к списку мероприятий
bot.action('back_to_events', async (ctx) => {
  await safeAnswerCbQuery(ctx);

  const events = await Event.findAll();
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
  const bookings = await Booking.findAll({ where: { event_id: event.id, timeslot_id: slot.id, subslot_id: subslot.id } });
  const used = bookings.reduce((acc, b) => acc + b.friends_count + 1, 0);
  const free = subslot.capacity - used;
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


