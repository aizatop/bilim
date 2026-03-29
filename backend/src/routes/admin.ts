import express from 'express';
import { ApiResponse } from '../types';
import db from '../utils/database';
import { createError, asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

router.get('/dashboard', asyncHandler(async (req, res) => {
  const totalUsers = await db('users').count('* as count').first();
  const totalStudents = await db('users').where('role', 'student').count('* as count').first();
  const totalTeachers = await db('users').where('role', 'teacher').count('* as count').first();
  const totalParents = await db('users').where('role', 'parent').count('* as count').first();
  const totalClasses = await db('classes').count('* as count').first();
  const totalGrades = await db('grades').count('* as count').first();
  const totalAchievements = await db('achievements').count('* as count').first();

  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);

  const attendanceStats = await db('attendance')
    .select(
      db.raw('COUNT(*) as total_records'),
      db.raw('SUM(CASE WHEN status = \'present\' THEN 1 ELSE 0 END) as present'),
      db.raw('SUM(CASE WHEN status = \'absent\' THEN 1 ELSE 0 END) as absent'),
      db.raw('SUM(CASE WHEN status = \'late\' THEN 1 ELSE 0 END) as late'),
      db.raw('SUM(CASE WHEN status = \'sick\' THEN 1 ELSE 0 END) as sick')
    )
    .where('date', '>=', new Date(new Date().getFullYear(), (currentQuarter - 1) * 3, 1))
    .first();

  const gradeDistribution = await db('grades')
    .select(
      db.raw('COUNT(*) as total_grades'),
      db.raw('AVG(score::float / max_score * 100) as average_percentage'),
      db.raw('MIN(score::float / max_score * 100) as min_percentage'),
      db.raw('MAX(score::float / max_score * 100) as max_percentage')
    )
    .where('quarter', currentQuarter)
    .first();

  const riskAnalysis = await db('risk_analysis')
    .select(
      db.raw('COUNT(*) as total_analyses'),
      db.raw('AVG(risk_level) as average_risk'),
      db.raw('SUM(CASE WHEN risk_level > 0.7 THEN 1 ELSE 0 END) as high_risk_count'),
      db.raw('SUM(CASE WHEN risk_level > 0.3 AND risk_level <= 0.7 THEN 1 ELSE 0 END) as medium_risk_count'),
      db.raw('SUM(CASE WHEN risk_level <= 0.3 THEN 1 ELSE 0 END) as low_risk_count')
    )
    .first();

  const recentActivity = await db('grades')
    .select(
      'grades.*',
      'users.first_name as student_first_name',
      'users.last_name as student_last_name',
      'subjects.name as subject_name'
    )
    .join('users', 'grades.student_id', 'users.id')
    .join('subjects', 'grades.subject_id', 'subjects.id')
    .orderBy('grades.date', 'desc')
    .limit(10);

  const dashboard = {
    statistics: {
      totalUsers: Number(totalUsers?.count || 0),
      totalStudents: Number(totalStudents?.count || 0),
      totalTeachers: Number(totalTeachers?.count || 0),
      totalParents: Number(totalParents?.count || 0),
      totalClasses: Number(totalClasses?.count || 0),
      totalGrades: Number(totalGrades?.count || 0),
      totalAchievements: Number(totalAchievements?.count || 0)
    },
    attendance: {
      ...attendanceStats,
      attendanceRate: attendanceStats ? 
        Math.round((Number(attendanceStats.present) / Number(attendanceStats.total_records)) * 100 * 100) / 100 : 0
    },
    grades: {
      ...gradeDistribution,
      averagePercentage: gradeDistribution ? 
        Math.round(Number(gradeDistribution.average_percentage) * 100) / 100 : 0,
      minPercentage: gradeDistribution ? 
        Math.round(Number(gradeDistribution.min_percentage) * 100) / 100 : 0,
      maxPercentage: gradeDistribution ? 
        Math.round(Number(gradeDistribution.max_percentage) * 100) / 100 : 0
    },
    riskAnalysis: {
      ...riskAnalysis,
      averageRisk: riskAnalysis ? 
        Math.round(Number(riskAnalysis.average_risk) * 100 * 100) / 100 : 0
    },
    recentActivity,
    currentQuarter
  };

  res.json({
    success: true,
    data: dashboard
  });
}));

router.get('/users', asyncHandler(async (req, res) => {
  const { role, page = 1, limit = 50, search } = req.query;

  let query = db('users')
    .select('id', 'email', 'first_name', 'last_name', 'middle_name', 'phone', 'role', 'is_active', 'created_at')
    .orderBy('last_name', 'asc');

  if (role) {
    query = query.where('role', role);
  }

  if (search) {
    query = query.where(function() {
      this.where('first_name', 'ilike', `%${search}%`)
          .orWhere('last_name', 'ilike', `%${search}%`)
          .orWhere('email', 'ilike', `%${search}%`);
    });
  }

  const offset = (Number(page) - 1) * Number(limit);
  const users = await query.offset(offset).limit(Number(limit));

  const totalQuery = db('users');
  if (role) totalQuery.where('role', role);
  if (search) {
    totalQuery.where(function() {
      this.where('first_name', 'ilike', `%${search}%`)
          .orWhere('last_name', 'ilike', `%${search}%`)
          .orWhere('email', 'ilike', `%${search}%`);
    });
  }
  const total = await totalQuery.count('* as count').first();

  res.json({
    success: true,
    data: users,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(total?.count || 0),
      pages: Math.ceil(Number(total?.count || 0) / Number(limit))
    }
  });
}));

router.post('/users', asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName, middleName, phone, role, classId, parentIds, childrenIds } = req.body;

  if (!email || !password || !firstName || !lastName || !role) {
    throw createError('Email, password, firstName, lastName, and role are required', 400);
  }

  const existingUser = await db('users').where({ email }).first();
  if (existingUser) {
    throw createError('User with this email already exists', 409);
  }

  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(password, 12);

  const userData: any = {
    email,
    password: hashedPassword,
    first_name: firstName,
    last_name: lastName,
    middle_name: middleName,
    phone,
    role,
    is_active: true
  };

  if (role === 'student' && classId) {
    userData.class_id = classId;
  }

  if (role === 'parent' && childrenIds) {
    userData.children_ids = childrenIds;
  }

  const [user] = await db('users').insert(userData).returning('*');

  const { password: _, ...userWithoutPassword } = user;

  res.status(201).json({
    success: true,
    data: userWithoutPassword
  });
}));

router.put('/users/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, middleName, phone, isActive, classId, childrenIds } = req.body;

  const existingUser = await db('users').where({ id }).first();
  if (!existingUser) {
    throw createError('User not found', 404);
  }

  const updateData: any = {};
  if (firstName !== undefined) updateData.first_name = firstName;
  if (lastName !== undefined) updateData.last_name = lastName;
  if (middleName !== undefined) updateData.middle_name = middleName;
  if (phone !== undefined) updateData.phone = phone;
  if (isActive !== undefined) updateData.is_active = isActive;
  if (classId !== undefined) updateData.class_id = classId;
  if (childrenIds !== undefined) updateData.children_ids = childrenIds;

  const [updatedUser] = await db('users')
    .where({ id })
    .update(updateData)
    .returning('*');

  const { password: _, ...userWithoutPassword } = updatedUser;

  res.json({
    success: true,
    data: userWithoutPassword
  });
}));

router.delete('/users/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existingUser = await db('users').where({ id }).first();
  if (!existingUser) {
    throw createError('User not found', 404);
  }

  await db('users').where({ id }).del();

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
}));

router.get('/classes', asyncHandler(async (req, res) => {
  const { grade, page = 1, limit = 50 } = req.query;

  let query = db('classes')
    .select(
      'classes.*',
      'users.first_name as class_teacher_first_name',
      'users.last_name as class_teacher_last_name'
    )
    .leftJoin('users', 'classes.class_teacher_id', 'users.id')
    .orderBy('classes.grade', 'asc')
    .orderBy('classes.letter', 'asc');

  if (grade) {
    query = query.where('classes.grade', grade);
  }

  const offset = (Number(page) - 1) * Number(limit);
  const classes = await query.offset(offset).limit(Number(limit));

  const totalQuery = db('classes');
  if (grade) totalQuery.where('grade', grade);
  const total = await totalQuery.count('* as count').first();

  res.json({
    success: true,
    data: classes,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(total?.count || 0),
      pages: Math.ceil(Number(total?.count || 0) / Number(limit))
    }
  });
}));

router.post('/classes', asyncHandler(async (req, res) => {
  const { name, grade, letter, classTeacherId } = req.body;

  if (!name || !grade || !letter) {
    throw createError('Name, grade, and letter are required', 400);
  }

  const [newClass] = await db('classes').insert({
    name,
    grade,
    letter,
    class_teacher_id: classTeacherId,
    students: [],
    is_active: true
  }).returning('*');

  res.status(201).json({
    success: true,
    data: newClass
  });
}));

router.get('/subjects', asyncHandler(async (req, res) => {
  const subjects = await db('subjects')
    .select('*')
    .where('is_active', true)
    .orderBy('name');

  res.json({
    success: true,
    data: subjects
  });
}));

router.post('/subjects', asyncHandler(async (req, res) => {
  const { name, nameKz, color, icon } = req.body;

  if (!name) {
    throw createError('Name is required', 400);
  }

  const [subject] = await db('subjects').insert({
    name,
    name_kz: nameKz,
    color: color || '#3B82F6',
    icon,
    is_active: true
  }).returning('*');

  res.status(201).json({
    success: true,
    data: subject
  });
}));

router.get('/analytics/performance', asyncHandler(async (req, res) => {
  const { period = 'quarter', grade, subject } = req.query;

  let dateFilter = '';
  if (period === 'quarter') {
    const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
    dateFilter = `AND grades.quarter = ${currentQuarter}`;
  } else if (period === 'month') {
    dateFilter = `AND grades.date >= '${new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()}'`;
  } else if (period === 'year') {
    dateFilter = `AND grades.date >= '${new Date(new Date().getFullYear(), 0, 1).toISOString()}'`;
  }

  let whereClause = '1=1';
  if (grade) {
    whereClause += ` AND classes.grade = ${grade}`;
  }
  if (subject) {
    whereClause += ` AND subjects.name ILIKE '%${subject}%'`;
  }

  const performanceData = await db.raw(`
    SELECT 
      subjects.name as subject_name,
      subjects.color as subject_color,
      COUNT(*) as total_grades,
      AVG(grades.score::float / grades.max_score * 100) as average_percentage,
      MIN(grades.score::float / grades.max_score * 100) as min_percentage,
      MAX(grades.score::float / grades.max_score * 100) as max_percentage,
      STDDEV(grades.score::float / grades.max_score * 100) as std_deviation
    FROM grades
    JOIN subjects ON grades.subject_id = subjects.id
    JOIN users ON grades.student_id = users.id
    JOIN classes ON users.class_id = classes.id
    WHERE ${whereClause} ${dateFilter}
    GROUP BY subjects.id, subjects.name, subjects.color
    ORDER BY subjects.name
  `);

  res.json({
    success: true,
    data: performanceData.rows
  });
}));

router.get('/analytics/attendance', asyncHandler(async (req, res) => {
  const { period = 'month', grade } = req.query;

  let dateFilter = '';
  if (period === 'month') {
    dateFilter = `AND date >= '${new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()}'`;
  } else if (period === 'quarter') {
    const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
    dateFilter = `AND date >= '${new Date(new Date().getFullYear(), (currentQuarter - 1) * 3, 1).toISOString()}'`;
  } else if (period === 'year') {
    dateFilter = `AND date >= '${new Date(new Date().getFullYear(), 0, 1).toISOString()}'`;
  }

  let whereClause = '1=1';
  if (grade) {
    whereClause += ` AND classes.grade = ${grade}`;
  }

  const attendanceData = await db.raw(`
    SELECT 
      COUNT(*) as total_records,
      SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
      SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
      SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late,
      SUM(CASE WHEN status = 'sick' THEN 1 ELSE 0 END) as sick,
      (SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as attendance_rate
    FROM attendance
    JOIN users ON attendance.student_id = users.id
    JOIN classes ON users.class_id = classes.id
    WHERE ${whereClause} ${dateFilter}
  `);

  res.json({
    success: true,
    data: attendanceData.rows[0]
  });
}));

export default router;
