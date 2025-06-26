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
  const rows = slots.map((slot) => [
    (() => {
      const used = slotCounts[slot.id] || 0;
      const free = slotCapacity ? slotCapacity - used : undefined;
      const timeStr = `${formatTime(slot.start_time)}–${formatTime(slot.end_time)}`;
      if (disabledSlotIds.includes(slot.id)) {
        return Markup.button.callback(
          `${timeStr} (нет мест или пересечение)`,
          'disabled_slot',
        );
      }
      return Markup.button.callback(
        free !== undefined
          ? `${timeStr} (свободно: ${free})`
          : `${timeStr}`,
        `slot${isAdminMode?'_admin':''}_${slot.id}`,
      );
    })(),
  ]);
  // Кнопка назад
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

export function getParticipantsList(participants: { name: string; telegram_id: number; friends_count: number; friends_names?: string[]; subslot_title?: string }[]) {
  if (!participants.length) return 'Нет записавшихся на этот слот.';
  const text = participants
    .map((p, i) => {
      let names = [p.name || 'Без имени'];
      if (p.friends_names && p.friends_names.length) {
        names = names.concat(p.friends_names);
      }
      let base = `${i + 1}. `;
      if (p.subslot_title) base += `[${p.subslot_title}] `;
      base += `Участники: ${names.join(', ')} (id: ${p.telegram_id})`;
      return base;
    })
    .join('\n');
  return text;
}

export function getParticipantsInlineBack() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Назад', 'admin_bts')],
  ]);
} 
    