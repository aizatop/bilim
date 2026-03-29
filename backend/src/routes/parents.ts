import express from 'express';
import { ApiResponse } from '../types';
import db from '../utils/database';
import { createError, asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

router.get('/children', asyncHandler(async (req, res) => {
  const parentId = req.user?.id;

  const parent = await db('users')
    .select('children_ids')
    .where('id', parentId)
    .where('role', 'parent')
    .first();

  if (!parent || !parent.children_ids || parent.children_ids.length === 0) {
    return res.json({
      success: true,
      data: []
    });
  }

  const children = await db('users')
    .select(
      'id', 'first_name', 'last_name', 'middle_name', 'email', 'role',
      'class_id'
    )
    .whereIn('id', parent.children_ids)
    .where('role', 'student')
    .where('is_active', true);

  const childrenWithClasses = await Promise.all(
    children.map(async (child) => {
      const classInfo = await db('classes')
        .select('id', 'name', 'grade', 'letter')
        .where('id', child.class_id)
        .first();

      return {
        ...child,
        class: classInfo
      };
    })
  );

  res.json({
    success: true,
    data: childrenWithClasses
  });
}));

router.get('/child-dashboard/:childId', asyncHandler(async (req, res) => {
  const { childId } = req.params;
  const parentId = req.user?.id;

  const parent = await db('users')
    .select('children_ids')
    .where('id', parentId)
    .where('role', 'parent')
    .first();

  if (!parent || !parent.children_ids.includes(childId)) {
    throw createError('Access denied: This child is not associated with your account', 403);
  }

  const child = await db('users')
    .select('id', 'first_name', 'last_name', 'middle_name', 'email', 'class_id')
    .where('id', childId)
    .where('role', 'student')
    .first();

  if (!child) {
    throw createError('Child not found', 404);
  }

  const classInfo = await db('classes')
    .select('id', 'name', 'grade', 'letter')
    .where('id', child.class_id)
    .first();

  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);

  const recentGrades = await db('grades')
    .select(
      'grades.*',
      'subjects.name as subject_name',
      'subjects.color as subject_color',
      'users.first_name as teacher_first_name',
      'users.last_name as teacher_last_name'
    )
    .join('subjects', 'grades.subject_id', 'subjects.id')
    .join('users', 'grades.teacher_id', 'users.id')
    .where('grades.student_id', childId)
    .where('grades.quarter', currentQuarter)
    .orderBy('grades.date', 'desc')
    .limit(10);

  const gradesBySubject = await db('grades')
    .select(
      'subjects.name as subject_name',
      'subjects.color as subject_color',
      db.raw('AVG(grades.score::float / grades.max_score * 100) as average_percentage'),
      db.raw('COUNT(*) as total_grades'),
      db.raw('MIN(grades.score::float / grades.max_score * 100) as min_percentage'),
      db.raw('MAX(grades.score::float / grades.max_score * 100) as max_percentage')
    )
    .join('subjects', 'grades.subject_id', 'subjects.id')
    .where('grades.student_id', childId)
    .where('grades.quarter', currentQuarter)
    .groupBy('subjects.id', 'subjects.name', 'subjects.color')
    .orderBy('subjects.name');

  const attendanceStats = await db('attendance')
    .select(
      db.raw('COUNT(*) as total_days'),
      db.raw('SUM(CASE WHEN status = \'present\' THEN 1 ELSE 0 END) as present_days'),
      db.raw('SUM(CASE WHEN status = \'absent\' THEN 1 ELSE 0 END) as absent_days'),
      db.raw('SUM(CASE WHEN status = \'late\' THEN 1 ELSE 0 END) as late_days'),
      db.raw('SUM(CASE WHEN status = \'sick\' THEN 1 ELSE 0 END) as sick_days')
    )
    .where('student_id', childId)
    .where('date', '>=', new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    .first();

  const recentAchievements = await db('achievements')
    .select('*')
    .where('student_id', childId)
    .where('is_verified', true)
    .orderBy('date', 'desc')
    .limit(5);

  const aiRecommendations = await db('ai_recommendations')
    .select(
      'ai_recommendations.*',
      'subjects.name as subject_name',
      'subjects.color as subject_color'
    )
    .leftJoin('subjects', 'ai_recommendations.subject_id', 'subjects.id')
    .where('ai_recommendations.student_id', childId)
    .where('ai_recommendations.expires_at', '>', new Date())
    .where('ai_recommendations.priority', 'high')
    .orderBy('ai_recommendations.created_at', 'desc')
    .limit(5);

  const attendanceRate = attendanceStats ? 
    (Number(attendanceStats.present_days) / Number(attendanceStats.total_days)) * 100 : 0;

  const dashboard = {
    child: {
      ...child,
      class: classInfo
    },
    quarter: currentQuarter,
    recentGrades,
    gradesBySubject,
    attendance: {
      ...attendanceStats,
      attendanceRate: Math.round(attendanceRate * 100) / 100
    },
    recentAchievements,
    aiRecommendations,
    summary: {
      totalSubjects: gradesBySubject.length,
      averageGrade: gradesBySubject.length > 0 ? 
        Math.round(
          gradesBySubject.reduce((sum, subject) => sum + Number(subject.average_percentage), 0) / 
          gradesBySubject.length * 100
        ) / 100 : 0,
      attendanceRate: Math.round(attendanceRate * 100) / 100,
      totalAchievements: recentAchievements.length,
      highRiskRecommendations: aiRecommendations.filter(r => r.priority === 'high').length
    }
  };

  res.json({
    success: true,
    data: dashboard
  });
}));

router.get('/child/:childId/grades', asyncHandler(async (req, res) => {
  const { childId } = req.params;
  const { quarter, subject, page = 1, limit = 50 } = req.query;

  const parentId = req.user?.id;

  const parent = await db('users')
    .select('children_ids')
    .where('id', parentId)
    .where('role', 'parent')
    .first();

  if (!parent || !parent.children_ids.includes(childId)) {
    throw createError('Access denied: This child is not associated with your account', 403);
  }

  let query = db('grades')
    .select(
      'grades.*',
      'subjects.name as subject_name',
      'subjects.color as subject_color',
      'users.first_name as teacher_first_name',
      'users.last_name as teacher_last_name'
    )
    .join('subjects', 'grades.subject_id', 'subjects.id')
    .join('users', 'grades.teacher_id', 'users.id')
    .where('grades.student_id', childId)
    .orderBy('grades.date', 'desc');

  if (quarter) {
    query = query.where('grades.quarter', quarter);
  }

  if (subject) {
    query = query.where('subjects.name', 'like', `%${subject}%`);
  }

  const offset = (Number(page) - 1) * Number(limit);
  const grades = await query.offset(offset).limit(Number(limit));

  const total = await db('grades').where('student_id', childId).count('* as count').first();

  res.json({
    success: true,
    data: grades,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(total?.count || 0),
      pages: Math.ceil(Number(total?.count || 0) / Number(limit))
    }
  });
}));

router.get('/child/:childId/attendance', asyncHandler(async (req, res) => {
  const { childId } = req.params;
  const { startDate, endDate, page = 1, limit = 50 } = req.query;

  const parentId = req.user?.id;

  const parent = await db('users')
    .select('children_ids')
    .where('id', parentId)
    .where('role', 'parent')
    .first();

  if (!parent || !parent.children_ids.includes(childId)) {
    throw createError('Access denied: This child is not associated with your account', 403);
  }

  let query = db('attendance')
    .select(
      'attendance.*',
      'subjects.name as subject_name',
      'subjects.color as subject_color'
    )
    .leftJoin('subjects', 'attendance.subject_id', 'subjects.id')
    .where('attendance.student_id', childId)
    .orderBy('attendance.date', 'desc');

  if (startDate) {
    query = query.where('attendance.date', '>=', startDate);
  }

  if (endDate) {
    query = query.where('attendance.date', '<=', endDate);
  }

  const offset = (Number(page) - 1) * Number(limit);
  const attendance = await query.offset(offset).limit(Number(limit));

  const total = await db('attendance').where('student_id', childId).count('* as count').first();

  res.json({
    success: true,
    data: attendance,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(total?.count || 0),
      pages: Math.ceil(Number(total?.count || 0) / Number(limit))
    }
  });
}));

router.get('/weekly-summary/:childId', asyncHandler(async (req, res) => {
  const { childId } = req.params;

  const parentId = req.user?.id;

  const parent = await db('users')
    .select('children_ids')
    .where('id', parentId)
    .where('role', 'parent')
    .first();

  if (!parent || !parent.children_ids.includes(childId)) {
    throw createError('Access denied: This child is not associated with your account', 403);
  }

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const weekGrades = await db('grades')
    .select(
      'grades.*',
      'subjects.name as subject_name',
      'subjects.color as subject_color'
    )
    .join('subjects', 'grades.subject_id', 'subjects.id')
    .where('grades.student_id', childId)
    .where('grades.date', '>=', weekStart)
    .where('grades.date', '<=', weekEnd)
    .orderBy('grades.date', 'desc');

  const weekAttendance = await db('attendance')
    .select('*')
    .where('student_id', childId)
    .where('date', '>=', weekStart)
    .where('date', '<=', weekEnd);

  const weekAchievements = await db('achievements')
    .select('*')
    .where('student_id', childId)
    .where('date', '>=', weekStart)
    .where('date', '<=', weekEnd)
    .where('is_verified', true);

  const weeklySummary = {
    weekStart,
    weekEnd,
    grades: {
      total: weekGrades.length,
      average: weekGrades.length > 0 ?
        Math.round(
          weekGrades.reduce((sum, g) => sum + (g.score / g.max_score) * 100, 0) / 
          weekGrades.length * 100
        ) / 100 : 0,
      bySubject: weekGrades.reduce((acc, grade) => {
        const subject = grade.subject_name;
        if (!acc[subject]) {
          acc[subject] = [];
        }
        acc[subject].push(grade);
        return acc;
      }, {})
    },
    attendance: {
      total: weekAttendance.length,
      present: weekAttendance.filter(a => a.status === 'present').length,
      absent: weekAttendance.filter(a => a.status === 'absent').length,
      late: weekAttendance.filter(a => a.status === 'late').length,
      sick: weekAttendance.filter(a => a.status === 'sick').length
    },
    achievements: weekAchievements,
    summary: {
      totalActivities: weekGrades.length + weekAttendance.length,
      performance: weekGrades.length > 0 ? 'good' : 'no_data',
      attendance: weekAttendance.length > 0 ? 
        (weekAttendance.filter(a => a.status === 'present').length / weekAttendance.length) >= 0.9 ? 'excellent' :
        (weekAttendance.filter(a => a.status === 'present').length / weekAttendance.length) >= 0.8 ? 'good' : 'needs_improvement'
        : 'no_data'
    }
  };

  res.json({
    success: true,
    data: weeklySummary
  });
}));

export default router;
