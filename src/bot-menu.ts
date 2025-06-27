import { Markup } from 'telegraf';
import { Event } from './models/event.model';
import { TimeSlot } from './models/timeslot.model';

export function getMainMenu() {
  return Markup.keyboard([
    ['🗓 Мероприятия и запись', '❌ Мои записи / Отменить запись'],
  ]).resize();
}

export function getAdminMenu() {
  return Markup.keyboard([
    ['🗓 Мероприятия и запись', '❌ Мои записи / Отменить запись'],
    ['👑 Админ-панель'],
  ]).resize();
}

export function getEventsInline(events: Event[],isAdminMode?:boolean) {
  return Markup.inlineKeyboard(
    events.map((event) => [
      Markup.button.callback(event.title, `event${isAdminMode?'_admin':''}_${event.id}`),
    ]),
  );
}

export function getEventInfo(event: Event, freePlaces: number, slots: TimeSlot[]) {
  let text = `*${event.title}*\n`;
  if (event.description) text += `${event.description}\n`;
  if (slots.length) {
    text += `\nДоступные слоты:`;
  }
  return text;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Etc/GMT0' });
}

export function getSlotsInlineWithCounts(slots: TimeSlot[], isAdminMode:boolean, slotCounts: Record<number, number>, disabledSlotIds: number[] = [], slotCapacity?: number) {
  const buttons = slots.map((slot) => {
    const used = slotCounts[slot.id] || 0;
    const free = slotCapacity ? slotCapacity - used : undefined;
    const timeStr = `${formatTime(slot.start_time)}–${formatTime(slot.end_time)}`;
    if (disabledSlotIds.includes(slot.id)) {
      return Markup.button.callback(
        `${timeStr} (пересечение)`,
        'disabled_slot',
      );
    }
    return Markup.button.callback(
      free !== undefined
        ? `${timeStr} (${slots.length > 5? 'св.':'свободно'}: ${free})`
        : `${timeStr}`,
      `slot${isAdminMode?'_admin':''}_${slot.id}`,
    );
  });
  const rows = [];
  if (buttons.length > 5) {
    // 2 столбца
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push([buttons[i], buttons[i + 1]].filter(Boolean));
    }
  } else {
    // по одному в строке
    for (let i = 0; i < buttons.length; i++) {
      rows.push([buttons[i]]);
    }
  }
  // Кнопка назад отдельной строкой
  rows.push([Markup.button.callback('⬅️ Назад', isAdminMode? 'admin_bta':'back_to_events')]);
  return Markup.inlineKeyboard(rows);
}

export function getPeopleCountInline(max: number,eventId:number) {
  const buttons = [];
  const limit = Math.min(4, max);
  for (let i = 1; i <= limit; i++) {
    buttons.push(Markup.button.callback(`${i}`, `people_${i}`));
  }
  // Кнопка назад
  buttons.push(Markup.button.callback('⬅️ Назад', `event_${eventId}`));
  return Markup.inlineKeyboard([buttons]);
}

export function getParticipantsList(participants: { name: string; telegram_id: number; members: string[]; subslot_title?: string }[]) {
  if (!participants.length) return 'Нет записавшихся на этот слот.';
  const text = participants
    .map((p, i) => {
      let base = `${i + 1}. `;
      if (p.subslot_title) base += `[${p.subslot_title}] `;
      // Только участники (members), без владельца
      base += `Участники: ${p.members.length ? p.members.join(', ') : '—'}`;
      // id владельца не выводим
      return base;
    })
    .join('\n');
  return text;
}

// Новый список для админки: список записей с кнопками-цифрами
export function getAdminBookingsListWithButtons(bookings: {id: number, members: string[], subslot_title?: string}[]) {
  if (!bookings.length) return {text: 'Нет записей на этот слот.', keyboard: undefined};
  const text = bookings.map((b, i) => {
    let base = `${i + 1}. `;
    if (b.subslot_title) base += `[${b.subslot_title}] `;
    base += `Участники: ${b.members.length ? b.members.join(', ') : '—'}`;
    return base;
  }).join('\n');
  // Кнопки-цифры для перехода к меню записи в 2 ряда
  const buttons = [];
  for (let i = 0; i < bookings.length; i += 2) {
    const row = [];
    row.push(Markup.button.callback(`${i + 1}`, `admin_booking_${bookings[i].id}`));
    if (bookings[i + 1]) {
      row.push(Markup.button.callback(`${i + 2}`, `admin_booking_${bookings[i + 1].id}`));
    }
    buttons.push(row);
  }
  // Кнопка назад
  buttons.push([Markup.button.callback('⬅️ Назад', 'admin_bts')]);
  return {text, keyboard: Markup.inlineKeyboard(buttons)};
}

export function getParticipantsInlineBack() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Назад', 'admin_bts')],
  ]);
} 
    