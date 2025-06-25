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

export function getEventsInline(events: Event[]) {
  return Markup.inlineKeyboard(
    events.map((event) => [
      Markup.button.callback(event.title, `event_${event.id}`),
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

export function getSlotsInlineWithCounts(slots: TimeSlot[], slotCounts: Record<number, number>, disabledSlotIds: number[] = [], slotCapacity?: number) {
  const rows = slots.map((slot) => [
    (() => {
      const used = slotCounts[slot.id] || 0;
      const free = slotCapacity ? slotCapacity - used : undefined;
      const timeStr = `${slot.start_time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${slot.end_time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
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
        `slot_${slot.id}`,
      );
    })(),
  ]);
  // Кнопка назад
  rows.push([Markup.button.callback('⬅️ Назад', 'back_to_events')]);
  return Markup.inlineKeyboard(rows);
}

export function getPeopleCountInline(max: number) {
  const buttons = [];
  const limit = Math.min(4, max);
  for (let i = 1; i <= limit; i++) {
    buttons.push(Markup.button.callback(`${i}`, `people_${i}`));
  }
  // Кнопка назад
  buttons.push(Markup.button.callback('⬅️ Назад', 'back_to_slots'));
  return Markup.inlineKeyboard([buttons]);
}

export function getParticipantsList(participants: { name: string; telegram_id: number; friends_count: number }[]) {
  if (!participants.length) return 'Нет записавшихся на этот слот.';
  const text = participants
    .map((p, i) => `${i + 1}. ${p.name || 'Без имени'} (id: ${p.telegram_id}) — всего: ${p.friends_count + 1}`)
    .join('\n');
  return text;
}

export function getParticipantsInlineBack() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Назад', 'admin_back_to_slots')],
  ]);
} 
    