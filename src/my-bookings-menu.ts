import { Markup } from 'telegraf';
import { Booking } from './models/booking.model';
import { Event } from './models/event.model';
import { TimeSlot } from './models/timeslot.model';

export function getMyBookingsMenu(bookings: Booking[], page: number) {
  const pageSize = 5;
  const totalPages = Math.ceil(bookings.length / pageSize);
  const start = page * pageSize;
  const end = start + pageSize;
  const pageBookings = bookings.slice(start, end);
  const buttons = pageBookings.map((b) => [
    Markup.button.callback(
      `${b.event?.title || 'Мероприятие'} | ${formatTime(b.timeslot?.start_time)}–${formatTime(b.timeslot?.end_time)}`,
      `mybooking_${b.id}`
    )
  ]);
  // Пагинация
  const nav = [];
  if (page > 0) nav.push(Markup.button.callback('⬅️ Назад', `mybookings_page_${page - 1}`));
  if (page < totalPages - 1) nav.push(Markup.button.callback('Вперёд ➡️', `mybookings_page_${page + 1}`));
  if (nav.length) buttons.push(nav);
  // Кнопка закрыть
  buttons.push([Markup.button.callback('❌ Закрыть', 'close_mybookings')]);
  return {
    text: '*Мои записи*',
    keyboard: Markup.inlineKeyboard(buttons)
  };
}

export function getBookingDetailMenu(booking: Booking) {
  // booking.members должен быть подгружен через include
  const members = booking.members || [];
  const buttons = members.map((member) => [
    Markup.button.callback(
      `Удалить: ${member.name}`,
      `remove_member_${member.id}`
    )
  ]);
  buttons.push([Markup.button.callback('❌ Удалить запись', `delete_booking_${booking.id}`)]);
  buttons.push([Markup.button.callback('⬅️ Назад', 'back_to_mybookings')]);
  const text = `*${booking.event?.title}*
Время: ${formatTime(booking.timeslot?.start_time)}–${formatTime(booking.timeslot?.end_time)}

Участники:
${members.map((m, i) => `${i + 1}. ${m.name}`).join('\n')}`;
  return {
    text,
    keyboard: Markup.inlineKeyboard(buttons)
  };
}

function formatTime(date: Date | undefined) {
  if (!date) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Etc/GMT0' });
} 