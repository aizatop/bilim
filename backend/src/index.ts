import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

import authRoutes from './routes/auth';
import studentRoutes from './routes/students';
import teacherRoutes from './routes/teachers';
import parentRoutes from './routes/parents';
import adminRoutes from './routes/admin';
import scheduleRoutes from './routes/schedule';
import kioskRoutes from './routes/kiosk';
import notificationsRoutes from './routes/notifications';
import bilimRoutes from './routes/bilim';

import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { initDatabase } from './utils/database';
import { NotificationService } from './services/notificationService';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/student', authMiddleware, studentRoutes);
app.use('/api/teacher', authMiddleware, teacherRoutes);
app.use('/api/parent', authMiddleware, parentRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);
app.use('/api/schedule', authMiddleware, scheduleRoutes);
app.use('/api/kiosk', kioskRoutes);
app.use('/api/notifications', authMiddleware, notificationsRoutes);
app.use('/api/bilim', authMiddleware, bilimRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

const notificationService = new NotificationService(io);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-room', (userId) => {
    socket.join(`user-${userId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

async function startServer() {
  try {
    await initDatabase();
    console.log('Database initialized successfully');
    
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export { app, io, notificationService };
