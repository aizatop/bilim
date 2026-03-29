import express from 'express';
import { ApiResponse } from '../types';
import db from '../utils/database';
import { createError, asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

router.get('/dashboard', asyncHandler(async (req, res) => {
  const teacherId = req.user?.id;

  const teacher = await db('users')
    .select('id', 'first_name', 'last_name', 'middle_name', 'email', 'role')
    .where('id', teacherId)
    .first();

  if (!teacher) {
    throw createError('Teacher not found', 404);
  }

  const teacherClasses = await db('classes')
    .select('classes.*')
    .where('classes.class_teacher_id', teacherId)
    .orWhereExists(
      db('schedule')
        .select(1)
        .whereRaw('schedule.teacher_id = ?', teacherId)
        .whereRaw('schedule.class_ids @> ARRAY[classes.id]::text[]')
    );

  const classIds = teacherClasses.map(c => c.id);

  const studentsInClasses = await db('users')
    .select('id', 'first_name', 'last_name', 'middle_name', 'email')
    .where('role', 'student')
    .whereIn('class_id', classIds);

  const recentGrades = await db('grades')
    .select(
      'grades.*',
      'users.first_name as student_first_name',
      'users.last_name as student_last_name',
      'subjects.name as subject_name',
      'subjects.color as subject_color'
    )
    .join('users', 'grades.teacher_id', 'users.id')
    .join('subjects', 'grades.subject_id', 'subjects.id')
    .where('grades.teacher_id', teacherId)
    .orderBy('grades.date', 'desc')
    .limit(20);

  const riskStudents = await db('risk_analysis')
    .select(
      'risk_analysis.*',
      'users.first_name as student_first_name',
      'users.last_name as student_last_name',
      'subjects.name as subject_name',
      'subjects.color as subject_color'
    )
    .join('users', 'risk_analysis.student_id', 'users.id')
    .join('subjects', 'risk_analysis.subject_id', 'subjects.id')
    .where('risk_analysis.risk_level', '>', 0.7)
    .whereIn('risk_analysis.student_id', studentsInClasses.map(s => s.id))
    .orderBy('risk_analysis.risk_level', 'desc')
    .limit(15);

  const attendanceStats = await db('attendance')
    .select(
      'subjects.name as subject_name',
      db.raw('COUNT(*) as total_classes'),
      db.raw('SUM(CASE WHEN status = \'present\' THEN 1 ELSE 0 END) as present'),
      db.raw('SUM(CASE WHEN status = \'absent\' THEN 1 ELSE 0 END) as absent'),
      db.raw('SUM(CASE WHEN status = \'late\' THEN 1 ELSE 0 END) as late')
    )
    .join('subjects', 'attendance.subject_id', 'subjects.id')
    .where('attendance.marked_by', teacherId)
    .groupBy('subjects.id', 'subjects.name')
    .orderBy('subjects.name');

  const dashboard = {
    teacher,
    classes: teacherClasses,
    totalStudents: studentsInClasses.length,
    recentGrades,
    riskStudents,
    attendanceStats,
    summary: {
      totalClasses: teacherClasses.length,
      highRiskStudents: riskStudents.length,
      averageAttendanceRate: attendanceStats.length > 0 ?
        Math.round(
          attendanceStats.reduce((sum, stat) => 
            sum + (Number(stat.present) / Number(stat.total_classes)) * 100, 0
          ) / attendanceStats.length * 100
        ) / 100 : 0
    }
  };

  res.json({
    success: true,
    data: dashboard
  });
}));

router.get('/classes/:classId/grades', asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { subject, quarter, page = 1, limit = 50 } = req.query;

  let query = db('grades')
    .select(
      'grades.*',
      'users.first_name as student_first_name',
      'users.last_name as student_last_name',
      'subjects.name as subject_name',
      'subjects.color as subject_color'
    )
    .join('users', 'grades.student_id', 'users.id')
    .join('subjects', 'grades.subject_id', 'subjects.id')
    .where('users.class_id', classId)
    .orderBy('grades.date', 'desc');

  if (subject) {
    query = query.where('subjects.name', 'like', `%${subject}%`);
  }

  if (quarter) {
    query = query.where('grades.quarter', quarter);
  }

  const offset = (Number(page) - 1) * Number(limit);
  const grades = await query.offset(offset).limit(Number(limit));

  const total = await db('grades')
    .join('users', 'grades.student_id', 'users.id')
    .where('users.class_id', classId)
    .count('* as count')
    .first();

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

router.get('/classes/:classId/risk-report', asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { subject } = req.query;

  let query = db('risk_analysis')
    .select(
      'risk_analysis.*',
      'users.first_name as student_first_name',
      'users.last_name as student_last_name',
      'subjects.name as subject_name',
      'subjects.color as subject_color'
    )
    .join('users', 'risk_analysis.student_id', 'users.id')
    .join('subjects', 'risk_analysis.subject_id', 'subjects.id')
    .where('users.class_id', classId)
    .orderBy('risk_analysis.risk_level', 'desc');

  if (subject) {
    query = query.where('subjects.name', 'like', `%${subject}%`);
  }

  const riskAnalysis = await query;

  const riskLevels = {
    low: riskAnalysis.filter(r => r.risk_level <= 0.3).length,
    medium: riskAnalysis.filter(r => r.risk_level > 0.3 && r.risk_level <= 0.7).length,
    high: riskAnalysis.filter(r => r.risk_level > 0.7).length
  };

  const report = {
    classId,
    riskAnalysis,
    riskLevels,
    summary: {
      totalStudents: new Set(riskAnalysis.map(r => r.student_id)).size,
      highRiskCount: riskLevels.high,
      averageRiskLevel: riskAnalysis.length > 0 ?
        Math.round(
          riskAnalysis.reduce((sum, r) => sum + Number(r.risk_level), 0) / 
          riskAnalysis.length * 100
        ) / 100 : 0
    }
  };

  res.json({
    success: true,
    data: report
  });
}));

router.post('/classes/:classId/generate-report', asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { format = 'json', includeDetails = false } = req.body;

  const classInfo = await db('classes')
    .select('*')
    .where('id', classId)
    .first();

  if (!classInfo) {
    throw createError('Class not found', 404);
  }

  const students = await db('users')
    .select('id', 'first_name', 'last_name', 'middle_name', 'email')
    .where('role', 'student')
    .where('class_id', classId)
    .orderBy('last_name', 'asc');

  const gradesByStudent = await db('grades')
    .select(
      'grades.*',
      'subjects.name as subject_name',
      'subjects.color as subject_color'
    )
    .join('subjects', 'grades.subject_id', 'subjects.id')
    .whereIn('grades.student_id', students.map(s => s.id))
    .orderBy('grades.student_id', 'asc')
    .orderBy('grades.date', 'desc');

  const attendanceByStudent = await db('attendance')
    .select('*')
    .whereIn('student_id', students.map(s => s.id))
    .orderBy('student_id', 'asc')
    .orderBy('date', 'desc');

  const report = {
    classInfo,
    generatedAt: new Date(),
    students: students.map(student => {
      const studentGrades = gradesByStudent.filter(g => g.student_id === student.id);
      const studentAttendance = attendanceByStudent.filter(a => a.student_id === student.id);

      return {
        student,
        grades: includeDetails ? studentGrades : {
          total: studentGrades.length,
          average: studentGrades.length > 0 ?
            Math.round(
              studentGrades.reduce((sum, g) => sum + (g.score / g.max_score) * 100, 0) / 
              studentGrades.length * 100
            ) / 100 : 0
        },
        attendance: includeDetails ? studentAttendance : {
          total: studentAttendance.length,
          present: studentAttendance.filter(a => a.status === 'present').length,
          absent: studentAttendance.filter(a => a.status === 'absent').length,
          rate: studentAttendance.length > 0 ?
            Math.round(
              (studentAttendance.filter(a => a.status === 'present').length / 
               studentAttendance.length) * 100 * 100
            ) / 100 : 0
        }
      };
    }),
    summary: {
      totalStudents: students.length,
      totalGrades: gradesByStudent.length,
      averageClassGrade: gradesByStudent.length > 0 ?
        Math.round(
          gradesByStudent.reduce((sum, g) => sum + (g.score / g.max_score) * 100, 0) / 
          gradesByStudent.length * 100
        ) / 100 : 0,
      overallAttendanceRate: attendanceByStudent.length > 0 ?
        Math.round(
          (attendanceByStudent.filter(a => a.status === 'present').length / 
           attendanceByStudent.length) * 100 * 100
        ) / 100 : 0
    }
  };

  res.json({
    success: true,
    data: report
  });
}));

export default router;
