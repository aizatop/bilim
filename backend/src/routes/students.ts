import express from 'express';
import { Grade, Attendance, AIRecommendation, ApiResponse, PaginatedResponse } from '../types';
import db from '../utils/database';
import { createError, asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

router.get('/:id/grades', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quarter, subject, page = 1, limit = 50 } = req.query;

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
    .where('grades.student_id', id)
    .orderBy('grades.date', 'desc');

  if (quarter) {
    query = query.where('grades.quarter', quarter);
  }

  if (subject) {
    query = query.where('subjects.name', 'like', `%${subject}%`);
  }

  const offset = (Number(page) - 1) * Number(limit);
  const grades = await query.offset(offset).limit(Number(limit));

  const total = await db('grades').where('student_id', id).count('* as count').first();

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

router.get('/:id/attendance', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate, page = 1, limit = 50 } = req.query;

  let query = db('attendance')
    .select(
      'attendance.*',
      'subjects.name as subject_name',
      'subjects.color as subject_color'
    )
    .leftJoin('subjects', 'attendance.subject_id', 'subjects.id')
    .where('attendance.student_id', id)
    .orderBy('attendance.date', 'desc');

  if (startDate) {
    query = query.where('attendance.date', '>=', startDate);
  }

  if (endDate) {
    query = query.where('attendance.date', '<=', endDate);
  }

  const offset = (Number(page) - 1) * Number(limit);
  const attendance = await query.offset(offset).limit(Number(limit));

  const total = await db('attendance').where('student_id', id).count('* as count').first();

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

router.get('/:id/ai-recommendations', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { subject, priority, page = 1, limit = 20 } = req.query;

  let query = db('ai_recommendations')
    .select(
      'ai_recommendations.*',
      'subjects.name as subject_name',
      'subjects.color as subject_color'
    )
    .leftJoin('subjects', 'ai_recommendations.subject_id', 'subjects.id')
    .where('ai_recommendations.student_id', id)
    .where('ai_recommendations.expires_at', '>', new Date())
    .orderBy('ai_recommendations.created_at', 'desc');

  if (subject) {
    query = query.where('subjects.name', 'like', `%${subject}%`);
  }

  if (priority) {
    query = query.where('ai_recommendations.priority', priority);
  }

  const offset = (Number(page) - 1) * Number(limit);
  const recommendations = await query.offset(offset).limit(Number(limit));

  const total = await db('ai_recommendations')
    .where('student_id', id)
    .where('expires_at', '>', new Date())
    .count('* as count')
    .first();

  res.json({
    success: true,
    data: recommendations,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(total?.count || 0),
      pages: Math.ceil(Number(total?.count || 0) / Number(limit))
    }
  });
}));

router.get('/:id/dashboard', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quarter } = req.query;

  const student = await db('users')
    .select('id', 'first_name', 'last_name', 'middle_name', 'email', 'role')
    .where('id', id)
    .first();

  if (!student) {
    throw createError('Student not found', 404);
  }

  const currentQuarter = quarter || Math.ceil((new Date().getMonth() + 1) / 3);

  const gradesBySubject = await db('grades')
    .select(
      'subjects.name as subject_name',
      'subjects.color as subject_color',
      db.raw('AVG(grades.score::float / grades.max_score * 100) as average_percentage'),
      db.raw('COUNT(*) as total_grades'),
      db.raw('ARRAY_AGG(grades.score ORDER BY grades.date DESC) as recent_scores')
    )
    .join('subjects', 'grades.subject_id', 'subjects.id')
    .where('grades.student_id', id)
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
    .where('student_id', id)
    .first();

  const recentAchievements = await db('achievements')
    .select('*')
    .where('student_id', id)
    .where('is_verified', true)
    .orderBy('date', 'desc')
    .limit(5);

  const riskAnalysis = await db('risk_analysis')
    .select(
      'risk_analysis.*',
      'subjects.name as subject_name',
      'subjects.color as subject_color'
    )
    .leftJoin('subjects', 'risk_analysis.subject_id', 'subjects.id')
    .where('risk_analysis.student_id', id)
    .orderBy('risk_analysis.risk_level', 'desc')
    .limit(10);

  const attendanceRate = attendanceStats ? 
    (Number(attendanceStats.present_days) / Number(attendanceStats.total_days)) * 100 : 0;

  const dashboard = {
    student,
    quarter: currentQuarter,
    gradesBySubject,
    attendance: {
      ...attendanceStats,
      attendanceRate: Math.round(attendanceRate * 100) / 100
    },
    recentAchievements,
    riskAnalysis,
    summary: {
      totalSubjects: gradesBySubject.length,
      averageGrade: gradesBySubject.length > 0 ? 
        Math.round(
          gradesBySubject.reduce((sum, subject) => sum + Number(subject.average_percentage), 0) / 
          gradesBySubject.length * 100
        ) / 100 : 0,
      attendanceRate: Math.round(attendanceRate * 100) / 100,
      riskSubjects: riskAnalysis.filter(r => r.risk_level > 0.7).length
    }
  };

  res.json({
    success: true,
    data: dashboard
  });
}));

router.post('/:id/ai-recommendations/:recommendationId/view', asyncHandler(async (req, res) => {
  const { id, recommendationId } = req.params;

  const updated = await db('ai_recommendations')
    .where('id', recommendationId)
    .where('student_id', id)
    .update({ is_viewed: true, viewed_at: new Date() });

  if (updated === 0) {
    throw createError('Recommendation not found', 404);
  }

  res.json({
    success: true,
    message: 'Recommendation marked as viewed'
  });
}));

export default router;
