import express from 'express';
import { ApiResponse, KioskFeed } from '../types';
import db from '../utils/database';
import { createError, asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

router.get('/feed', asyncHandler(async (req, res) => {
  const { mode = 'kiosk', limit = 20 } = req.query;

  const feedItems = await db('kiosk_feed')
    .select('*')
    .where('is_active', true)
    .where(function() {
      this.where('start_time', '<=', new Date())
          .orWhereNull('start_time');
    })
    .where(function() {
      this.where('end_time', '>=', new Date())
          .orWhereNull('end_time');
    })
    .orderBy('display_order', 'asc')
    .orderBy('created_at', 'desc')
    .limit(Number(limit));

  const enrichedFeed = await Promise.all(
    feedItems.map(async (item) => {
      let enrichedItem = { ...item };

      switch (item.type) {
        case 'top_students':
          const topStudents = await getTopStudents();
          enrichedItem.content = {
            ...JSON.parse(item.content || '{}'),
            students: topStudents
          };
          break;

        case 'schedule_change':
          const scheduleChanges = await getTodayScheduleChanges();
          enrichedItem.content = {
            ...JSON.parse(item.content || '{}'),
            changes: scheduleChanges
          };
          break;

        case 'achievement':
          const recentAchievements = await getRecentAchievements();
          enrichedItem.content = {
            ...JSON.parse(item.content || '{}'),
            achievements: recentAchievements
          };
          break;

        case 'announcement':
          enrichedItem.content = JSON.parse(item.content || '{}');
          break;

        default:
          enrichedItem.content = JSON.parse(item.content || '{}');
      }

      return enrichedItem;
    })
  );

  res.json({
    success: true,
    data: {
      feed: enrichedFeed,
      mode,
      timestamp: new Date(),
      autoScrollInterval: 15000,
      itemsPerScreen: 3
    }
  });
}));

router.get('/top-students', asyncHandler(async (req, res) => {
  const { period = 'week', grade, limit = 10 } = req.query;

  let dateFilter = '';
  if (period === 'week') {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    dateFilter = `AND date >= '${weekStart.toISOString()}'`;
  } else if (period === 'month') {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    dateFilter = `AND date >= '${monthStart.toISOString()}'`;
  }

  let gradeFilter = '';
  if (grade) {
    gradeFilter = `AND classes.grade = ${grade}`;
  }

  const topStudents = await db.raw(`
    SELECT 
      u.id,
      u.first_name,
      u.last_name,
      u.middle_name,
      c.name as class_name,
      c.grade,
      c.letter,
      COALESCE(grade_points.points, 0) as grade_points,
      COALESCE(achievement_points.points, 0) as achievement_points,
      COALESCE(grade_points.points, 0) + COALESCE(achievement_points.points, 0) as total_points
    FROM users u
    JOIN classes c ON u.class_id = c.id
    LEFT JOIN (
      SELECT 
        g.student_id,
        SUM(g.score::float / g.max_score * 10) as points
      FROM grades g
      WHERE g.date >= CURRENT_DATE - INTERVAL '7 days' ${gradeFilter}
      GROUP BY g.student_id
    ) grade_points ON u.id = grade_points.student_id
    LEFT JOIN (
      SELECT 
        a.student_id,
        SUM(a.points) as points
      FROM achievements a
      WHERE a.date >= CURRENT_DATE - INTERVAL '7 days' ${gradeFilter}
      AND a.is_verified = true
      GROUP BY a.student_id
    ) achievement_points ON u.id = achievement_points.student_id
    WHERE u.role = 'student'
    AND u.is_active = true
    ${gradeFilter}
    ORDER BY total_points DESC
    LIMIT ?
  `, [Number(limit)]);

  res.json({
    success: true,
    data: topStudents.rows
  });
}));

router.get('/schedule-changes', asyncHandler(async (req, res) => {
  const today = new Date();
  const dayOfWeek = today.getDay();

  const scheduleChanges = await db('schedule')
    .select(
      'schedule.*',
      'subjects.name as subject_name',
      'subjects.color as subject_color',
      'original_teacher.first_name as original_teacher_first_name',
      'original_teacher.last_name as original_teacher_last_name',
      'replacement_teacher.first_name as replacement_teacher_first_name',
      'replacement_teacher.last_name as replacement_teacher_last_name',
      'cabinets.number as cabinet_number'
    )
    .leftJoin('subjects', 'schedule.subject_id', 'subjects.id')
    .leftJoin('users as original_teacher', 'schedule.original_teacher_id', 'original_teacher.id')
    .leftJoin('users as replacement_teacher', 'schedule.teacher_id', 'replacement_teacher.id')
    .leftJoin('cabinets', 'schedule.cabinet_id', 'cabinets.id')
    .where('schedule.day_of_week', dayOfWeek)
    .where('schedule.is_substituted', true)
    .where('schedule.is_active', true)
    .orderBy('schedule.hour', 'asc');

  res.json({
    success: true,
    data: scheduleChanges
  });
}));

router.get('/events', asyncHandler(async (req, res) => {
  const { upcoming = true, limit = 5 } = req.query;

  let dateFilter = '';
  if (upcoming === 'true') {
    dateFilter = 'AND start_time >= NOW()';
  } else {
    dateFilter = 'AND start_time < NOW()';
  }

  const events = await db('kiosk_feed')
    .select('*')
    .where('type', 'event')
    .where('is_active', true)
    .whereRaw(`start_time ${upcoming === 'true' ? '>=' : '<'} NOW()`)
    .orderBy('start_time', upcoming === 'true' ? 'asc' : 'desc')
    .limit(Number(limit));

  res.json({
    success: true,
    data: events
  });
}));

router.get('/announcements', asyncHandler(async (req, res) => {
  const { priority, limit = 10 } = req.query;

  let query = db('kiosk_feed')
    .select('*')
    .where('type', 'announcement')
    .where('is_active', true)
    .whereRaw('(end_time IS NULL OR end_time >= NOW())')
    .orderBy('created_at', 'desc')
    .limit(Number(limit));

  if (priority) {
    query = query.whereRaw("content->>'priority' = ?", [priority]);
  }

  const announcements = await query;

  res.json({
    success: true,
    data: announcements
  });
}));

router.post('/feed', asyncHandler(async (req, res) => {
  const { type, title, content, image, displayOrder, startTime, endTime } = req.body;

  if (!type || !title || !content) {
    throw createError('Type, title, and content are required', 400);
  }

  const [feedItem] = await db('kiosk_feed').insert({
    type,
    title,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    image,
    display_order: displayOrder || 0,
    start_time: startTime ? new Date(startTime) : null,
    end_time: endTime ? new Date(endTime) : null,
    is_active: true,
    created_at: new Date()
  }).returning('*');

  res.status(201).json({
    success: true,
    data: feedItem
  });
}));

router.put('/feed/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type, title, content, image, displayOrder, startTime, endTime, isActive } = req.body;

  const existingItem = await db('kiosk_feed').where('id', id).first();
  if (!existingItem) {
    throw createError('Feed item not found', 404);
  }

  const updateData: any = {};
  if (type !== undefined) updateData.type = type;
  if (title !== undefined) updateData.title = title;
  if (content !== undefined) updateData.content = typeof content === 'string' ? content : JSON.stringify(content);
  if (image !== undefined) updateData.image = image;
  if (displayOrder !== undefined) updateData.display_order = displayOrder;
  if (startTime !== undefined) updateData.start_time = startTime ? new Date(startTime) : null;
  if (endTime !== undefined) updateData.end_time = endTime ? new Date(endTime) : null;
  if (isActive !== undefined) updateData.is_active = isActive;

  const [updatedItem] = await db('kiosk_feed')
    .where('id', id)
    .update(updateData)
    .returning('*');

  res.json({
    success: true,
    data: updatedItem
  });
}));

router.delete('/feed/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existingItem = await db('kiosk_feed').where('id', id).first();
  if (!existingItem) {
    throw createError('Feed item not found', 404);
  }

  await db('kiosk_feed').where('id', id).del();

  res.json({
    success: true,
    message: 'Feed item deleted successfully'
  });
}));

router.get('/stats', asyncHandler(async (req, res) => {
  const totalStudents = await db('users').where('role', 'student').where('is_active', true).count('* as count').first();
  const totalTeachers = await db('users').where('role', 'teacher').where('is_active', true).count('* as count').first();
  const totalClasses = await db('classes').where('is_active', true).count('* as count').first();
  const todayAttendance = await db('attendance')
    .select(
      db.raw('COUNT(*) as total'),
      db.raw('SUM(CASE WHEN status = \'present\' THEN 1 ELSE 0 END) as present')
    )
    .where('date', new Date().toISOString().split('T')[0])
    .first();

  const weeklyTopStudents = await getTopStudents('week', undefined, 3);
  const todayChanges = await getTodayScheduleChanges();
  const recentAchievements = await getRecentAchievements(5);

  res.json({
    success: true,
    data: {
      totalUsers: {
        students: Number(totalStudents?.count || 0),
        teachers: Number(totalTeachers?.count || 0),
        classes: Number(totalClasses?.count || 0)
      },
      todayAttendance: {
        total: Number(todayAttendance?.total || 0),
        present: Number(todayAttendance?.present || 0),
        rate: todayAttendance ? 
          Math.round((Number(todayAttendance.present) / Number(todayAttendance.total)) * 100 * 100) / 100 : 0
      },
      weeklyTopStudents,
      todayScheduleChanges: todayChanges.length,
      recentAchievements: recentAchievements.length
    }
  });
}));

async function getTopStudents(period: string = 'week', grade?: number, limit: number = 10) {
  let dateFilter = '';
  if (period === 'week') {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    dateFilter = `AND date >= '${weekStart.toISOString()}'`;
  }

  let gradeFilter = '';
  if (grade) {
    gradeFilter = `AND classes.grade = ${grade}`;
  }

  const result = await db.raw(`
    SELECT 
      u.id,
      u.first_name,
      u.last_name,
      c.name as class_name,
      COALESCE(grade_points.points, 0) + COALESCE(achievement_points.points, 0) as total_points
    FROM users u
    JOIN classes c ON u.class_id = c.id
    LEFT JOIN (
      SELECT 
        g.student_id,
        SUM(g.score::float / g.max_score * 10) as points
      FROM grades g
      WHERE g.date >= CURRENT_DATE - INTERVAL '7 days' ${gradeFilter}
      GROUP BY g.student_id
    ) grade_points ON u.id = grade_points.student_id
    LEFT JOIN (
      SELECT 
        a.student_id,
        SUM(a.points) as points
      FROM achievements a
      WHERE a.date >= CURRENT_DATE - INTERVAL '7 days' ${gradeFilter}
      AND a.is_verified = true
      GROUP BY a.student_id
    ) achievement_points ON u.id = achievement_points.student_id
    WHERE u.role = 'student'
    AND u.is_active = true
    ${gradeFilter}
    ORDER BY total_points DESC
    LIMIT ?
  `, [limit]);

  return result.rows;
}

async function getTodayScheduleChanges() {
  const today = new Date();
  const dayOfWeek = today.getDay();

  const result = await db('schedule')
    .select(
      'schedule.*',
      'subjects.name as subject_name',
      'original_teacher.first_name as original_teacher_first_name',
      'original_teacher.last_name as original_teacher_last_name',
      'replacement_teacher.first_name as replacement_teacher_first_name',
      'replacement_teacher.last_name as replacement_teacher_last_name'
    )
    .leftJoin('subjects', 'schedule.subject_id', 'subjects.id')
    .leftJoin('users as original_teacher', 'schedule.original_teacher_id', 'original_teacher.id')
    .leftJoin('users as replacement_teacher', 'schedule.teacher_id', 'replacement_teacher.id')
    .where('schedule.day_of_week', dayOfWeek)
    .where('schedule.is_substituted', true)
    .where('schedule.is_active', true);

  return result;
}

async function getRecentAchievements(limit: number = 5) {
  return await db('achievements')
    .select(
      'achievements.*',
      'users.first_name as student_first_name',
      'users.last_name as student_last_name',
      'classes.name as class_name'
    )
    .join('users', 'achievements.student_id', 'users.id')
    .join('classes', 'users.class_id', 'classes.id')
    .where('achievements.is_verified', true)
    .orderBy('achievements.date', 'desc')
    .limit(limit);
}

export default router;
