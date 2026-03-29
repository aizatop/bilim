import express from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import { ApiResponse } from '../types';
import db from '../utils/database';
import { createError, asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

router.post('/import/grades', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw createError('No file uploaded', 400);
  }

  const results = [];
  const errors = [];

  const stream = require('stream');
  const bufferStream = new stream.PassThrough();
  bufferStream.end(req.file.buffer);

  await new Promise((resolve, reject) => {
    bufferStream
      .pipe(csv())
      .on('data', (data) => {
        try {
          const gradeData = validateGradeData(data);
          if (gradeData.isValid) {
            results.push(gradeData.data);
          } else {
            errors.push({
              row: results.length + 1,
              errors: gradeData.errors
            });
          }
        } catch (error) {
          errors.push({
            row: results.length + 1,
            errors: [error.message]
          });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  if (errors.length > 0 && errors.length > results.length * 0.1) {
    return res.status(400).json({
      success: false,
      error: 'Too many validation errors',
      data: {
        totalRows: results.length + errors.length,
        validRows: results.length,
        errors: errors.slice(0, 10)
      }
    });
  }

  const importedGrades = [];
  const importErrors = [];

  for (const gradeData of results) {
    try {
      const [grade] = await db('grades').insert({
        student_id: gradeData.studentId,
        subject_id: gradeData.subjectId,
        teacher_id: gradeData.teacherId,
        type: gradeData.type,
        score: gradeData.score,
        max_score: gradeData.maxScore,
        date: gradeData.date,
        quarter: gradeData.quarter,
        topic: gradeData.topic,
        description: gradeData.description
      }).returning('*');

      importedGrades.push(grade);
    } catch (error) {
      importErrors.push({
        data: gradeData,
        error: error.message
      });
    }
  }

  res.json({
    success: true,
    data: {
      imported: importedGrades.length,
      errors: importErrors.length,
      validationErrors: errors.length,
      details: {
        importedGrades,
        importErrors: importErrors.slice(0, 10),
        validationErrors: errors.slice(0, 10)
      }
    }
  });
}));

router.post('/import/attendance', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw createError('No file uploaded', 400);
  }

  const results = [];
  const errors = [];

  const stream = require('stream');
  const bufferStream = new stream.PassThrough();
  bufferStream.end(req.file.buffer);

  await new Promise((resolve, reject) => {
    bufferStream
      .pipe(csv())
      .on('data', (data) => {
        try {
          const attendanceData = validateAttendanceData(data);
          if (attendanceData.isValid) {
            results.push(attendanceData.data);
          } else {
            errors.push({
              row: results.length + 1,
              errors: attendanceData.errors
            });
          }
        } catch (error) {
          errors.push({
            row: results.length + 1,
            errors: [error.message]
          });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  const importedAttendance = [];
  const importErrors = [];

  for (const attendanceData of results) {
    try {
      const [attendance] = await db('attendance').insert({
        student_id: attendanceData.studentId,
        date: attendanceData.date,
        status: attendanceData.status,
        reason: attendanceData.reason,
        marked_by: attendanceData.markedBy,
        subject_id: attendanceData.subjectId
      }).returning('*');

      importedAttendance.push(attendance);
    } catch (error) {
      importErrors.push({
        data: attendanceData,
        error: error.message
      });
    }
  }

  res.json({
    success: true,
    data: {
      imported: importedAttendance.length,
      errors: importErrors.length,
      validationErrors: errors.length,
      details: {
        importedAttendance,
        importErrors: importErrors.slice(0, 10),
        validationErrors: errors.slice(0, 10)
      }
    }
  });
}));

router.get('/student/:studentId/grades', asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { quarter, subject, type, page = 1, limit = 50 } = req.query;

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
    .where('grades.student_id', studentId)
    .orderBy('grades.date', 'desc');

  if (quarter) {
    query = query.where('grades.quarter', quarter);
  }

  if (subject) {
    query = query.where('subjects.name', 'ilike', `%${subject}%`);
  }

  if (type) {
    query = query.where('grades.type', type);
  }

  const offset = (Number(page) - 1) * Number(limit);
  const grades = await query.offset(offset).limit(Number(limit));

  const total = await db('grades')
    .where('student_id', studentId)
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

router.get('/student/:studentId/attendance', asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { startDate, endDate, status, page = 1, limit = 50 } = req.query;

  let query = db('attendance')
    .select(
      'attendance.*',
      'subjects.name as subject_name',
      'subjects.color as subject_color'
    )
    .leftJoin('subjects', 'attendance.subject_id', 'subjects.id')
    .where('attendance.student_id', studentId)
    .orderBy('attendance.date', 'desc');

  if (startDate) {
    query = query.where('attendance.date', '>=', startDate);
  }

  if (endDate) {
    query = query.where('attendance.date', '<=', endDate);
  }

  if (status) {
    query = query.where('attendance.status', status);
  }

  const offset = (Number(page) - 1) * Number(limit);
  const attendance = await query.offset(offset).limit(Number(limit));

  const total = await db('attendance')
    .where('student_id', studentId)
    .count('* as count')
    .first();

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

router.get('/class/:classId/grades', asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { subject, quarter, type, page = 1, limit = 50 } = req.query;

  let query = db('grades')
    .select(
      'grades.*',
      'users.first_name as student_first_name',
      'users.last_name as student_last_name',
      'subjects.name as subject_name',
      'subjects.color as subject_color',
      'teacher.first_name as teacher_first_name',
      'teacher.last_name as teacher_last_name'
    )
    .join('users', 'grades.student_id', 'users.id')
    .join('subjects', 'grades.subject_id', 'subjects.id')
    .join('users as teacher', 'grades.teacher_id', 'teacher.id')
    .where('users.class_id', classId)
    .orderBy('grades.date', 'desc');

  if (subject) {
    query = query.where('subjects.name', 'ilike', `%${subject}%`);
  }

  if (quarter) {
    query = query.where('grades.quarter', quarter);
  }

  if (type) {
    query = query.where('grades.type', type);
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

router.get('/templates/grades', asyncHandler(async (req, res) => {
  const template = [
    'student_id',
    'student_email',
    'subject_name',
    'teacher_email',
    'type',
    'score',
    'max_score',
    'date',
    'quarter',
    'topic',
    'description'
  ];

  const exampleData = [
    {
      student_id: 'uuid-student-1',
      student_email: 'student1@school.kz',
      subject_name: 'Математика',
      teacher_email: 'teacher1@school.kz',
      type: 'СОЧ',
      score: 85,
      max_score: 100,
      date: '2024-03-15',
      quarter: 3,
      topic: 'Алгебраические уравнения',
      description: 'Контрольная работа по теме'
    }
  ];

  res.json({
    success: true,
    data: {
      headers: template,
      example: exampleData,
      description: {
        student_id: 'UUID ученика в системе',
        student_email: 'Email ученика для поиска',
        subject_name: 'Название предмета',
        teacher_email: 'Email учителя для поиска',
        type: 'Тип оценки (СОЧ, СОР, ДЗ, КР, ТР)',
        score: 'Полученный балл',
        max_score: 'Максимальный балл',
        date: 'Дата оценки (YYYY-MM-DD)',
        quarter: 'Четверть (1, 2, 3, 4)',
        topic: 'Тема работы',
        description: 'Описание работы'
      }
    }
  });
}));

router.get('/templates/attendance', asyncHandler(async (req, res) => {
  const template = [
    'student_id',
    'student_email',
    'date',
    'status',
    'reason',
    'marked_by_email',
    'subject_name'
  ];

  const exampleData = [
    {
      student_id: 'uuid-student-1',
      student_email: 'student1@school.kz',
      date: '2024-03-15',
      status: 'present',
      reason: '',
      marked_by_email: 'teacher1@school.kz',
      subject_name: 'Математика'
    },
    {
      student_id: 'uuid-student-2',
      student_email: 'student2@school.kz',
      date: '2024-03-15',
      status: 'absent',
      reason: 'Болезнь',
      marked_by_email: 'teacher1@school.kz',
      subject_name: 'Математика'
    }
  ];

  res.json({
    success: true,
    data: {
      headers: template,
      example: exampleData,
      description: {
        student_id: 'UUID ученика в системе',
        student_email: 'Email ученика для поиска',
        date: 'Дата посещения (YYYY-MM-DD)',
        status: 'Статус (present, absent, late, sick)',
        reason: 'Причина отсутствия',
        marked_by_email: 'Email отметившего учителя',
        subject_name: 'Название предмета'
      }
    }
  });
}));

router.get('/sync/status', asyncHandler(async (req, res) => {
  const lastSync = await db('bilim_sync_logs')
    .select('*')
    .orderBy('created_at', 'desc')
    .first();

  const stats = await db.raw(`
    SELECT 
      (SELECT COUNT(*) FROM grades) as total_grades,
      (SELECT COUNT(*) FROM attendance) as total_attendance,
      (SELECT COUNT(*) FROM grades WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as grades_this_week,
      (SELECT COUNT(*) FROM attendance WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as attendance_this_week
  `);

  res.json({
    success: true,
    data: {
      lastSync,
      statistics: stats.rows[0]
    }
  });
}));

function validateGradeData(data) {
  const errors = [];
  const validated = {};

  if (!data.student_id && !data.student_email) {
    errors.push('Either student_id or student_email is required');
  }

  if (!data.subject_name) {
    errors.push('subject_name is required');
  }

  if (!data.teacher_email) {
    errors.push('teacher_email is required');
  }

  if (!data.type) {
    errors.push('type is required');
  } else if (!['СОЧ', 'СОР', 'ДЗ', 'КР', 'ТР'].includes(data.type)) {
    errors.push('type must be one of: СОЧ, СОР, ДЗ, КР, ТР');
  }

  if (!data.score || isNaN(data.score)) {
    errors.push('score must be a valid number');
  }

  if (!data.max_score || isNaN(data.max_score)) {
    errors.push('max_score must be a valid number');
  }

  if (!data.date) {
    errors.push('date is required');
  } else if (!isValidDate(data.date)) {
    errors.push('date must be in YYYY-MM-DD format');
  }

  if (!data.quarter || isNaN(data.quarter) || data.quarter < 1 || data.quarter > 4) {
    errors.push('quarter must be a number between 1 and 4');
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      studentId: data.student_id,
      subjectId: data.subject_name,
      teacherId: data.teacher_email,
      type: data.type,
      score: Number(data.score),
      maxScore: Number(data.max_score),
      date: data.date,
      quarter: Number(data.quarter),
      topic: data.topic || '',
      description: data.description || ''
    }
  };
}

function validateAttendanceData(data) {
  const errors = [];
  const validated = {};

  if (!data.student_id && !data.student_email) {
    errors.push('Either student_id or student_email is required');
  }

  if (!data.date) {
    errors.push('date is required');
  } else if (!isValidDate(data.date)) {
    errors.push('date must be in YYYY-MM-DD format');
  }

  if (!data.status) {
    errors.push('status is required');
  } else if (!['present', 'absent', 'late', 'sick'].includes(data.status)) {
    errors.push('status must be one of: present, absent, late, sick');
  }

  if (!data.marked_by_email) {
    errors.push('marked_by_email is required');
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: {
      studentId: data.student_id,
      date: data.date,
      status: data.status,
      reason: data.reason || '',
      markedBy: data.marked_by_email,
      subjectId: data.subject_name || null
    }
  };
}

function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

export default router;
