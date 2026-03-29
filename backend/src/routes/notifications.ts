import express from 'express';
import { ApiResponse, Notification } from '../types';
import db from '../utils/database';
import { createError, asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { type, isRead, page = 1, limit = 50 } = req.query;

  let query = db('notifications')
    .select('*')
    .where('user_id', userId)
    .orderBy('created_at', 'desc');

  if (type) {
    query = query.where('type', type);
  }

  if (isRead !== undefined) {
    query = query.where('is_read', isRead === 'true');
  }

  const offset = (Number(page) - 1) * Number(limit);
  const notifications = await query.offset(offset).limit(Number(limit));

  const total = await db('notifications')
    .where('user_id', userId)
    .count('* as count')
    .first();

  res.json({
    success: true,
    data: notifications,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(total?.count || 0),
      pages: Math.ceil(Number(total?.count || 0) / Number(limit))
    }
  });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  const notification = await db('notifications')
    .where('id', id)
    .where('user_id', userId)
    .first();

  if (!notification) {
    throw createError('Notification not found', 404);
  }

  await db('notifications')
    .where('id', id)
    .update({
      is_read: true,
      read_at: new Date()
    });

  res.json({
    success: true,
    message: 'Notification marked as read'
  });
}));

router.post('/mark-all-read', asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  await db('notifications')
    .where('user_id', userId)
    .where('is_read', false)
    .update({
      is_read: true,
      read_at: new Date()
    });

  res.json({
    success: true,
    message: 'All notifications marked as read'
  });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  const notification = await db('notifications')
    .where('id', id)
    .where('user_id', userId)
    .first();

  if (!notification) {
    throw createError('Notification not found', 404);
  }

  await db('notifications')
    .where('id', id)
    .del();

  res.json({
    success: true,
    message: 'Notification deleted successfully'
  });
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  const unreadCount = await db('notifications')
    .where('user_id', userId)
    .where('is_read', false)
    .count('* as count')
    .first();

  res.json({
    success: true,
    data: {
      unreadCount: Number(unreadCount?.count || 0)
    }
  });
}));

router.post('/send', asyncHandler(async (req, res) => {
  const { userIds, type, title, message, data } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    throw createError('User IDs array is required', 400);
  }

  if (!type || !title || !message) {
    throw createError('Type, title, and message are required', 400);
  }

  const notifications = userIds.map(userId => ({
    user_id: userId,
    type,
    title,
    message,
    data: data ? JSON.stringify(data) : null,
    is_read: false,
    created_at: new Date()
  }));

  const insertedNotifications = await db('notifications')
    .insert(notifications)
    .returning('*');

  res.status(201).json({
    success: true,
    data: insertedNotifications
  });
}));

router.get('/types', asyncHandler(async (req, res) => {
  const notificationTypes = [
    { type: 'schedule_change', label: 'Изменение расписания', description: 'Уведомления об изменениях в расписании уроков' },
    { type: 'grade', label: 'Оценки', description: 'Новые оценки и результаты контрольных работ' },
    { type: 'attendance', label: 'Посещаемость', description: 'Уведомления о посещаемости и пропусках' },
    { type: 'achievement', label: 'Достижения', description: 'Новые достижения и награды учеников' },
    { type: 'system', label: 'Системные', description: 'Системные уведомления и объявления' },
    { type: 'ai_recommendation', label: 'AI-рекомендации', description: 'Персональные рекомендации от AI-ассистента' }
  ];

  res.json({
    success: true,
    data: notificationTypes
  });
}));

router.get('/settings', asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  const settings = await db('notification_settings')
    .select('*')
    .where('user_id', userId)
    .first();

  if (!settings) {
    const defaultSettings = {
      user_id: userId,
      email_notifications: true,
      push_notifications: true,
      schedule_changes: true,
      grade_notifications: true,
      attendance_notifications: true,
      achievement_notifications: true,
      ai_recommendations: true,
      system_notifications: true,
      created_at: new Date(),
      updated_at: new Date()
    };

    const [newSettings] = await db('notification_settings')
      .insert(defaultSettings)
      .returning('*');

    return res.json({
      success: true,
      data: newSettings
    });
  }

  res.json({
    success: true,
    data: settings
  });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const {
    emailNotifications,
    pushNotifications,
    scheduleChanges,
    gradeNotifications,
    attendanceNotifications,
    achievementNotifications,
    aiRecommendations,
    systemNotifications
  } = req.body;

  const existingSettings = await db('notification_settings')
    .where('user_id', userId)
    .first();

  const updateData = {
    email_notifications: emailNotifications,
    push_notifications: pushNotifications,
    schedule_changes: scheduleChanges,
    grade_notifications: gradeNotifications,
    attendance_notifications: attendanceNotifications,
    achievement_notifications: achievementNotifications,
    ai_recommendations: aiRecommendations,
    system_notifications: systemNotifications,
    updated_at: new Date()
  };

  if (existingSettings) {
    const [updatedSettings] = await db('notification_settings')
      .where('user_id', userId)
      .update(updateData)
      .returning('*');

    return res.json({
      success: true,
      data: updatedSettings
    });
  } else {
    const newSettings = {
      user_id: userId,
      ...updateData,
      created_at: new Date()
    };

    const [insertedSettings] = await db('notification_settings')
      .insert(newSettings)
      .returning('*');

    return res.json({
      success: true,
      data: insertedSettings
    });
  }
}));

router.delete('/cleanup', asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - Number(days));

  const deletedCount = await db('notifications')
    .where('created_at', '<', cutoffDate)
    .where('is_read', true)
    .del();

  res.json({
    success: true,
    message: `Cleaned up ${deletedCount} old notifications`
  });
}));

router.get('/stats', asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  const stats = await db('notifications')
    .select(
      db.raw('COUNT(*) as total'),
      db.raw('SUM(CASE WHEN is_read = false THEN 1 ELSE 0 END) as unread'),
      db.raw('SUM(CASE WHEN type = \'schedule_change\' THEN 1 ELSE 0 END) as schedule_changes'),
      db.raw('SUM(CASE WHEN type = \'grade\' THEN 1 ELSE 0 END) as grades'),
      db.raw('SUM(CASE WHEN type = \'attendance\' THEN 1 ELSE 0 END) as attendance'),
      db.raw('SUM(CASE WHEN type = \'achievement\' THEN 1 ELSE 0 END) as achievements'),
      db.raw('SUM(CASE WHEN type = \'ai_recommendation\' THEN 1 ELSE 0 END) as ai_recommendations'),
      db.raw('SUM(CASE WHEN type = \'system\' THEN 1 ELSE 0 END) as system')
    )
    .where('user_id', userId)
    .first();

  const recentNotifications = await db('notifications')
    .select('*')
    .where('user_id', userId)
    .orderBy('created_at', 'desc')
    .limit(5);

  res.json({
    success: true,
    data: {
      stats: {
        total: Number(stats?.total || 0),
        unread: Number(stats?.unread || 0),
        byType: {
          schedule_changes: Number(stats?.schedule_changes || 0),
          grades: Number(stats?.grades || 0),
          attendance: Number(stats?.attendance || 0),
          achievements: Number(stats?.achievements || 0),
          ai_recommendations: Number(stats?.ai_recommendations || 0),
          system: Number(stats?.system || 0)
        }
      },
      recent: recentNotifications
    }
  });
}));

export default router;
