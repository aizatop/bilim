export interface User {
  id: string;
  email: string;
  password: string;
  role: 'student' | 'teacher' | 'parent' | 'admin';
  firstName: string;
  lastName: string;
  middleName?: string;
  phone?: string;
  avatar?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Student extends User {
  role: 'student';
  classId: string;
  grade: number;
  parentIds: string[];
}

export interface Teacher extends User {
  role: 'teacher';
  subjects: string[];
  isClassTeacher?: boolean;
  classId?: string;
  cabinet?: string;
}

export interface Parent extends User {
  role: 'parent';
  childrenIds: string[];
}

export interface Admin extends User {
  role: 'admin';
  permissions: string[];
}

export interface Class {
  id: string;
  name: string;
  grade: number;
  letter: string;
  classTeacherId: string;
  students: string[];
  schedule: ScheduleItem[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subject {
  id: string;
  name: string;
  nameKz?: string;
  color: string;
  icon?: string;
  isActive: boolean;
}

export interface Grade {
  id: string;
  studentId: string;
  subjectId: string;
  teacherId: string;
  type: 'СОЧ' | 'СОР' | 'ДЗ' | 'КР' | 'ТР';
  score: number;
  maxScore: number;
  date: Date;
  quarter: number;
  topic?: string;
  description?: string;
  createdAt: Date;
}

export interface Attendance {
  id: string;
  studentId: string;
  date: Date;
  status: 'present' | 'absent' | 'late' | 'sick';
  reason?: string;
  markedBy: string;
  subjectId?: string;
  createdAt: Date;
}

export interface ScheduleItem {
  id: string;
  dayOfWeek: number;
  hour: number;
  subjectId: string;
  teacherId: string;
  cabinetId: string;
  classIds: string[];
  type: 'lesson' | 'break' | 'event' | 'exam';
  duration: number;
  isActive: boolean;
  isSubstituted?: boolean;
  originalTeacherId?: string;
}

export interface Cabinet {
  id: string;
  number: string;
  floor: number;
  capacity: number;
  equipment: string[];
  isActive: boolean;
}

export interface Achievement {
  id: string;
  studentId: string;
  type: 'olympiad' | 'contest' | 'project' | 'sport' | 'art' | 'volunteer';
  title: string;
  description: string;
  level: 'school' | 'city' | 'regional' | 'national' | 'international';
  place?: number;
  date: Date;
  verifiedBy?: string;
  isVerified: boolean;
  points: number;
  attachments?: string[];
}

export interface Notification {
  id: string;
  userId: string;
  type: 'schedule_change' | 'grade' | 'attendance' | 'achievement' | 'system' | 'ai_recommendation';
  title: string;
  message: string;
  data?: any;
  isRead: boolean;
  createdAt: Date;
  readAt?: Date;
}

export interface AIRecommendation {
  id: string;
  studentId: string;
  subjectId: string;
  type: 'risk_warning' | 'study_tip' | 'resource' | 'improvement';
  title: string;
  content: string;
  priority: 'low' | 'medium' | 'high';
  riskLevel?: number;
  isViewed: boolean;
  createdAt: Date;
  expiresAt?: Date;
}

export interface KioskFeed {
  id: string;
  type: 'top_students' | 'schedule_change' | 'event' | 'achievement' | 'announcement';
  title: string;
  content: string;
  image?: string;
  displayOrder: number;
  isActive: boolean;
  startTime?: Date;
  endTime?: Date;
  createdAt: Date;
}

export interface GamificationPoints {
  id: string;
  studentId: string;
  points: number;
  source: 'grade' | 'attendance' | 'achievement' | 'homework' | 'participation';
  description: string;
  date: Date;
}

export interface Leaderboard {
  studentId: string;
  totalPoints: number;
  rank: number;
  classRank: number;
  gradeRank: number;
  weeklyPoints: number;
  monthlyPoints: number;
}

export interface RiskAnalysis {
  studentId: string;
  subjectId: string;
  riskLevel: number;
  factors: {
    averageGrade: number;
    gradeVariance: number;
    attendanceRate: number;
    recentTrend: number;
    missedAssignments: number;
  };
  recommendations: string[];
  lastUpdated: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: Omit<User, 'password'>;
  tokens: AuthTokens;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
