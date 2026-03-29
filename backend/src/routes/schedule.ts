import express from 'express';
import { ApiResponse, ScheduleItem } from '../types';
import db from '../utils/database';
import { createError, asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

router.get('/week', asyncHandler(async (req, res) => {
  const { weekOffset = 0, classId, teacherId } = req.query;

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + (Number(weekOffset) * 7));
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  let query = db('schedule')
    .select(
      'schedule.*',
      'subjects.name as subject_name',
      'subjects.color as subject_color',
      'users.first_name as teacher_first_name',
      'users.last_name as teacher_last_name',
      'cabinets.number as cabinet_number'
    )
    .leftJoin('subjects', 'schedule.subject_id', 'subjects.id')
    .leftJoin('users', 'schedule.teacher_id', 'users.id')
    .leftJoin('cabinets', 'schedule.cabinet_id', 'cabinets.id')
    .where('schedule.is_active', true)
    .orderBy('schedule.day_of_week', 'asc')
    .orderBy('schedule.hour', 'asc');

  if (classId) {
    query = query.whereRaw('schedule.class_ids @> ARRAY[?]::text[]', [classId]);
  }

  if (teacherId) {
    query = query.where('schedule.teacher_id', teacherId);
  }

  const scheduleItems = await query;

  const scheduleByDay = {};
  for (let day = 0; day < 7; day++) {
    scheduleByDay[day] = [];
  }

  scheduleItems.forEach(item => {
    if (scheduleByDay[item.day_of_week]) {
      scheduleByDay[item.day_of_week].push({
        ...item,
        class_ids: Array.isArray(item.class_ids) ? item.class_ids : JSON.parse(item.class_ids || '[]')
      });
    }
  });

  res.json({
    success: true,
    data: {
      weekStart: startOfWeek,
      weekEnd: endOfWeek,
      schedule: scheduleByDay
    }
  });
}));

router.get('/today', asyncHandler(async (req, res) => {
  const { classId, teacherId } = req.query;

  const today = new Date();
  const dayOfWeek = today.getDay();

  let query = db('schedule')
    .select(
      'schedule.*',
      'subjects.name as subject_name',
      'subjects.color as subject_color',
      'users.first_name as teacher_first_name',
      'users.last_name as teacher_last_name',
      'cabinets.number as cabinet_number'
    )
    .leftJoin('subjects', 'schedule.subject_id', 'subjects.id')
    .leftJoin('users', 'schedule.teacher_id', 'users.id')
    .leftJoin('cabinets', 'schedule.cabinet_id', 'cabinets.id')
    .where('schedule.day_of_week', dayOfWeek)
    .where('schedule.is_active', true)
    .orderBy('schedule.hour', 'asc');

  if (classId) {
    query = query.whereRaw('schedule.class_ids @> ARRAY[?]::text[]', [classId]);
  }

  if (teacherId) {
    query = query.where('schedule.teacher_id', teacherId);
  }

  const todaySchedule = await query;

  const formattedSchedule = todaySchedule.map(item => ({
    ...item,
    class_ids: Array.isArray(item.class_ids) ? item.class_ids : JSON.parse(item.class_ids || '[]')
  }));

  res.json({
    success: true,
    data: {
      date: today,
      schedule: formattedSchedule
    }
  });
}));

router.post('/regenerate', asyncHandler(async (req, res) => {
  const { classId, teacherId, dateRange } = req.body;

  const existingSchedule = await db('schedule')
    .select('*')
    .where('is_active', true);

  if (classId) {
    await db('schedule')
      .whereRaw('class_ids @> ARRAY[?]::text[]', [classId])
      .del();
  }

  if (teacherId) {
    await db('schedule').where('teacher_id', teacherId).del();
  }

  const newSchedule = await generateOptimalSchedule(classId, teacherId);

  res.json({
    success: true,
    data: {
      message: 'Schedule regenerated successfully',
      schedule: newSchedule
    }
  });
}));

router.post('/teacher/:teacherId/mark-unavailable', asyncHandler(async (req, res) => {
  const { teacherId } = req.params;
  const { startDate, endDate, reason } = req.body;

  if (!startDate || !endDate) {
    throw createError('Start date and end date are required', 400);
  }

  const teacher = await db('users')
    .select('*')
    .where('id', teacherId)
    .where('role', 'teacher')
    .first();

  if (!teacher) {
    throw createError('Teacher not found', 404);
  }

  const affectedScheduleItems = await db('schedule')
    .select('*')
    .where('teacher_id', teacherId)
    .where('is_active', true);

  for (const item of affectedScheduleItems) {
    const dayOfWeek = new Date(startDate).getDay();
    const startHour = 8;
    const endHour = 17;

    for (let hour = startHour; hour <= endHour; hour++) {
      const availableTeachers = await findAvailableTeachers(item.subject_id, dayOfWeek, hour, item.class_ids);

      if (availableTeachers.length > 0) {
        const replacementTeacher = availableTeachers[0];

        await db('schedule')
          .where('id', item.id)
          .update({
            original_teacher_id: teacherId,
            teacher_id: replacementTeacher.id,
            is_substituted: true
          });

        await db('notifications').insert({
          user_id: replacementTeacher.id,
          type: 'schedule_change',
          title: 'Замена в расписании',
          message: `Вам назначена замена урока по предмету "${item.subject_id}" для классов ${item.class_ids.join(', ')}`,
          data: {
            schedule_item_id: item.id,
            original_teacher_id: teacherId,
            reason: reason || 'Болезнь учителя'
          },
          is_read: false,
          created_at: new Date()
        });

        break;
      }
    }
  }

  const studentsToNotify = await db('users')
    .select('id')
    .whereIn('class_id', affectedScheduleItems.flatMap(item => item.class_ids))
    .where('role', 'student');

  for (const student of studentsToNotify) {
    await db('notifications').insert({
      user_id: student.id,
      type: 'schedule_change',
      title: 'Изменение в расписании',
      message: `Учитель ${teacher.first_name} ${teacher.last_name} временно недоступен. Расписание будет изменено.`,
      data: {
        teacher_id: teacherId,
        reason: reason || 'Болезнь учителя'
      },
      is_read: false,
      created_at: new Date()
    });
  }

  res.json({
    success: true,
    message: 'Teacher marked as unavailable and schedule updated',
    affectedLessons: affectedScheduleItems.length
  });
}));

router.get('/conflicts', asyncHandler(async (req, res) => {
  const conflicts = await db.raw(`
    SELECT 
      s1.id as schedule_id_1,
      s2.id as schedule_id_2,
      s1.day_of_week,
      s1.hour,
      s1.teacher_id,
      t1.first_name || ' ' || t1.last_name as teacher_name,
      s1.cabinet_id,
      c1.number as cabinet_number,
      s1.class_ids,
      'teacher_conflict' as conflict_type
    FROM schedule s1
    JOIN schedule s2 ON s1.day_of_week = s2.day_of_week 
                        AND s1.hour = s2.hour 
                        AND s1.teacher_id = s2.teacher_id 
                        AND s1.id != s2.id
                        AND s1.is_active = true 
                        AND s2.is_active = true
    JOIN users t1 ON s1.teacher_id = t1.id
    LEFT JOIN cabinets c1 ON s1.cabinet_id = c1.id
    
    UNION ALL
    
    SELECT 
      s1.id as schedule_id_1,
      s2.id as schedule_id_2,
      s1.day_of_week,
      s1.hour,
      s1.cabinet_id,
      c1.number as cabinet_name,
      s1.teacher_id,
      t1.first_name || ' ' || t1.last_name as teacher_name,
      s1.class_ids,
      'cabinet_conflict' as conflict_type
    FROM schedule s1
    JOIN schedule s2 ON s1.day_of_week = s2.day_of_week 
                        AND s1.hour = s2.hour 
                        AND s1.cabinet_id = s2.cabinet_id 
                        AND s1.id != s2.id
                        AND s1.is_active = true 
                        AND s2.is_active = true
    JOIN cabinets c1 ON s1.cabinet_id = c1.id
    JOIN users t1 ON s1.teacher_id = t1.id
  `);

  res.json({
    success: true,
    data: conflicts.rows
  });
}));

router.post('/optimize', asyncHandler(async (req, res) => {
  const { constraints } = req.body;

  const currentSchedule = await db('schedule')
    .select('*')
    .where('is_active', true);

  const optimizedSchedule = await optimizeSchedule(currentSchedule, constraints);

  for (const item of currentSchedule) {
    await db('schedule').where('id', item.id).del();
  }

  for (const item of optimizedSchedule) {
    await db('schedule').insert({
      day_of_week: item.day_of_week,
      hour: item.hour,
      subject_id: item.subject_id,
      teacher_id: item.teacher_id,
      cabinet_id: item.cabinet_id,
      class_ids: item.class_ids,
      type: item.type || 'lesson',
      duration: item.duration || 1,
      is_active: true
    });
  }

  res.json({
    success: true,
    message: 'Schedule optimized successfully',
    optimizedItems: optimizedSchedule.length
  });
}));

async function generateOptimalSchedule(classId?: string, teacherId?: string): Promise<ScheduleItem[]> {
  const subjects = await db('subjects').select('*').where('is_active', true);
  const teachers = await db('users').select('*').where('role', 'teacher').where('is_active', true);
  const cabinets = await db('cabinets').select('*').where('is_active', true);
  const classes = await db('classes').select('*').where('is_active', true);

  const schedule: ScheduleItem[] = [];

  for (let day = 1; day <= 6; day++) {
    for (let hour = 8; hour <= 16; hour++) {
      for (const subject of subjects) {
        const availableTeachers = teachers.filter(teacher => 
          teacher.subjects && teacher.subjects.includes(subject.name)
        );

        if (availableTeachers.length === 0) continue;

        const teacher = availableTeachers[Math.floor(Math.random() * availableTeachers.length)];
        const cabinet = cabinets[Math.floor(Math.random() * cabinets.length)];
        const targetClasses = classId ? 
          classes.filter(c => c.id === classId) : 
          classes.slice(0, 2);

        schedule.push({
          id: '',
          dayOfWeek: day,
          hour,
          subjectId: subject.id,
          teacherId: teacher.id,
          cabinetId: cabinet.id,
          classIds: targetClasses.map(c => c.id),
          type: 'lesson',
          duration: 1,
          isActive: true
        });
      }
    }
  }

  return schedule;
}

async function findAvailableTeachers(subjectId: string, dayOfWeek: number, hour: number, classIds: string[]) {
  const availableTeachers = await db('users')
    .select('users.*', 'subjects.name as subject_name')
    .join('subjects', 'users.subjects', '@>', `ARRAY[${subjectId}]`)
    .where('users.role', 'teacher')
    .where('users.is_active', true)
    .whereNotExists(
      db('schedule')
        .select(1)
        .where('schedule.teacher_id', 'users.id')
        .where('schedule.day_of_week', dayOfWeek)
        .where('schedule.hour', hour)
        .where('schedule.is_active', true)
    )
    .limit(5);

  return availableTeachers;
}

async function optimizeSchedule(currentSchedule: any[], constraints: any): Promise<ScheduleItem[]> {
  return currentSchedule.map(item => ({
    ...item,
    classIds: Array.isArray(item.class_ids) ? item.class_ids : JSON.parse(item.class_ids || '[]')
  }));
}

export default router;
