# Aqbobek Unified School Portal

Единый школьный цифровой портал для лицея Aqbobek с AI-аналитикой, умным расписанием и геймификацией.

## Архитектура

- **Фронтенд**: React + TypeScript + TailwindCSS + MUI
- **Бэкенд**: Node.js + Express + TypeScript
- **База данных**: PostgreSQL 
- **AI-сервис**: Python (scikit-learn, pandas) + Gemini API
- **Уведомления**: Firebase Cloud Messaging
- **Хостинг**: Vercel (фронтенд) + Railway (бэкенд)

## Основные модули

1. **Auth & Role Service** - Аутентификация и управление ролями
2. **Grade & Attendance Service** - Оценки и посещаемость
3. **Schedule & Timetable Service** - Умное расписание с авто-пересборкой
4. **AI Analytics & Tutor Service** - AI-рекомендации и анализ рисков
5. **Portfolio & Achievements Service** - Портфолио и геймификация
6. **Kiosk & Content Feed Service** - Интерактивная стенгазета
7. **Notifications Service** - Push-уведомления

## Роли пользователей

- **Student**: Дашборд успеваемости, AI-рекомендации, портфолио
- **Teacher**: Аналитика по классам, система ранних предупреждений
- **Parent**: Дашборд ребенка, AI-выжимки, уведомления
- **Admin**: Глобальная аналитика, управление расписанием

## Интеграция с BilimClass

Поддержка импорта данных через CSV-файлы с эмуляцией BilimClass API.

## Быстрый старт

```bash
# Установка зависимостей
npm install
cd frontend && npm install
cd ../backend && npm install

# Запуск разработки
npm run dev
```

## Развертывание

Подробная инструкция в `DEPLOYMENT.md`

## Лицензия

MIT License
