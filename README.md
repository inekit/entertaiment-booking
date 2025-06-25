# Entertainment Booking Telegram Bot

## Стек
- Node.js + TypeScript
- Telegraf.js
- Sequelize-Typescript + PostgreSQL
- ESLint + Prettier

## Быстрый старт

1. Установите зависимости:
   ```bash
   npm install
   ```
2. Создайте файл `.env` и добавьте токен бота:
   ```env
   BOT_TOKEN=ваш_токен_бота
   ```
3. Запустите бота в режиме разработки:
   ```bash
   npm start
   ```
4. Настройте переменные окружения для подключения к базе данных PostgreSQL:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASS=postgres
   DB_NAME=entertainment
   ```

## Проверка и автоисправление кода
- Проверка линтинга: `npm run lint`
- Автоисправление: `npm run lint:fix`
- Форматирование: `npm run format` 