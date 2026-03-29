import { Server } from 'socket.io';
import { Notification } from '../types';
import db from '../utils/database';

export class NotificationService {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  async sendNotification(userId: string, notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) {
    const [newNotification] = await db('notifications').insert({
      user_id: userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data ? JSON.stringify(notification.data) : null,
      is_read: false,
      created_at: new Date()
    }).returning('*');

    this.io.to(`user-${userId}`).emit('notification', {
      type: 'new_notification',
      data: newNotification
    });

    return newNotification;
  }

  async sendBulkNotifications(userIds: string[], notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) {
    const notifications = userIds.map(userId => ({
      user_id: userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data ? JSON.stringify(notification.data) : null,
      is_read: false,
      created_at: new Date()
    }));

    const insertedNotifications = await db('notifications').insert(notifications).returning('*');

    for (const userId of userIds) {
      const userNotifications = insertedNotifications.filter(n => n.user_id === userId);
      this.io.to(`user-${userId}`).emit('notification', {
        type: 'new_notification',
        data: userNotifications
      });
    }

    return insertedNotifications;
  }

  async markAsRead(userId: string, notificationId: string) {
    const [updatedNotification] = await db('notifications')
      .where('id', notificationId)
      .where('user_id', userId)
      .update({
        is_read: true,
        read_at: new Date()
      })
      .returning('*');

    this.io.to(`user-${userId}`).emit('notification_read', {
      type: 'notification_read',
      data: updatedNotification
    });

    return updatedNotification;
  }

  async sendGradeNotification(studentId: string, grade: any) {
    const student = await db('users').where('id', studentId).first();
    const parentIds = student?.parent_ids || [];

    const notificationData = {
      type: 'grade' as const,
      title: 'Новая оценка',
      message: `Получена оценка ${grade.score}/${grade.max_score} по предмету ${grade.subject_name}`,
      data: {
        gradeId: grade.id,
        subject: grade.subject_name,
        score: grade.score,
        maxScore: grade.max_score,
        type: grade.type
      }
    };

    await this.sendNotification(studentId, notificationData);

    for (const parentId of parentIds) {
      await this.sendNotification(parentId, {
        ...notificationData,
        title: `Новая оценка - ${student?.first_name} ${student?.last_name}`,
        message: `Ваш ребенок получил оценку ${grade.score}/${grade.max_score} по предмету ${grade.subject_name}`
      });
    }
  }

  async sendAttendanceNotification(studentId: string, attendance: any) {
    const student = await db('users').where('id', studentId).first();
    const parentIds = student?.parent_ids || [];

    if (attendance.status === 'absent' || attendance.status === 'late') {
      const notificationData = {
        type: 'attendance' as const,
        title: 'Отсутствие на уроке',
        message: `Отсутствие на уроке по предмету ${attendance.subject_name || 'Не указан'}`,
        data: {
          attendanceId: attendance.id,
          subject: attendance.subject_name,
          status: attendance.status,
          date: attendance.date,
          reason: attendance.reason
        }
      };

      await this.sendNotification(studentId, notificationData);

      for (const parentId of parentIds) {
        await this.sendNotification(parentId, {
          ...notificationData,
          title: `Отсутствие - ${student?.first_name} ${student?.last_name}`,
          message: `Ваш ребенок отсутствовал на уроке по предмету ${attendance.subject_name || 'Не указан'}`
        });
      }
    }
  }

  async sendScheduleChangeNotification(classIds: string[], change: any) {
    const students = await db('users')
      .select('id', 'parent_ids')
      .whereIn('class_id', classIds)
      .where('role', 'student');

    const notificationData = {
      type: 'schedule_change' as const,
      title: 'Изменение в расписании',
      message: `Расписание урока по предмету ${change.subject_name} было изменено`,
      data: {
        scheduleItemId: change.id,
        subject: change.subject_name,
        originalTeacher: change.original_teacher_first_name + ' ' + change.original_teacher_last_name,
        replacementTeacher: change.replacement_teacher_first_name + ' ' + change.replacement_teacher_last_name,
        hour: change.hour,
        dayOfWeek: change.day_of_week
      }
    };

    const userIds = students.flatMap(s => [s.id, ...(s.parent_ids || [])]);
    const uniqueUserIds = [...new Set(userIds)];

    await this.sendBulkNotifications(uniqueUserIds, notificationData);
  }

  async sendAchievementNotification(studentId: string, achievement: any) {
    const student = await db('users').where('id', studentId).first();
    const parentIds = student?.parent_ids || [];

    const notificationData = {
      type: 'achievement' as const,
      title: 'Новое достижение!',
      message: `Получено достижение: ${achievement.title}`,
      data: {
        achievementId: achievement.id,
        title: achievement.title,
        type: achievement.type,
        level: achievement.level,
        points: achievement.points
      }
    };

    await this.sendNotification(studentId, notificationData);

    for (const parentId of parentIds) {
      await this.sendNotification(parentId, {
        ...notificationData,
        title: `Достижение - ${student?.first_name} ${student?.last_name}`,
        message: `Ваш ребенок получил достижение: ${achievement.title}`
      });
    }
  }

  async sendAIRecommendationNotification(studentId: string, recommendation: any) {
    const student = await db('users').where('id', studentId).first();
    const parentIds = student?.parent_ids || [];

    const notificationData = {
      type: 'ai_recommendation' as const,
      title: 'AI-рекомендация',
      message: recommendation.title,
      data: {
        recommendationId: recommendation.id,
        subject: recommendation.subject_name,
        priority: recommendation.priority,
        riskLevel: recommendation.risk_level
      }
    };

    await this.sendNotification(studentId, notificationData);

    if (recommendation.priority === 'high') {
      for (const parentId of parentIds) {
        await this.sendNotification(parentId, {
          ...notificationData,
          title: `Важная рекомендация - ${student?.first_name} ${student?.last_name}`,
          message: `AI-система рекомендует обратить внимание на: ${recommendation.title}`
        });
      }
    }
  }

  async sendSystemNotification(userIds: string[], title: string, message: string, data?: any) {
    const notificationData = {
      type: 'system' as const,
      title,
      message,
      data
    };

    await this.sendBulkNotifications(userIds, notificationData);
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await db('notifications')
      .where('user_id', userId)
      .where('is_read', false)
      .count('* as count')
      .first();

    return Number(result?.count || 0);
  }

  async getRecentNotifications(userId: string, limit: number = 10) {
    return await db('notifications')
      .select('*')
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  async cleanupOldNotifications(daysToKeep: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const deletedCount = await db('notifications')
      .where('created_at', '<', cutoffDate)
      .where('is_read', true)
      .del();

    console.log(`Cleaned up ${deletedCount} old notifications`);
    return deletedCount;
  }
}

export default NotificationService;
