# Aqbobek Unified School Portal - Deployment Guide

## Overview

This guide covers deployment of the Aqbobek School Portal on free hosting platforms using the provided architecture.

## Architecture Components

- **Backend**: Node.js + Express + TypeScript + PostgreSQL
- **Frontend**: React + TypeScript + Vite + Material-UI
- **AI Service**: Python FastAPI + scikit-learn + Gemini AI
- **Database**: PostgreSQL (free tiers available)
- **Real-time**: Socket.io
- **Notifications**: Firebase Cloud Messaging

## Free Hosting Options

### 1. Railway (Recommended for Backend)
- **Free tier**: 500 hours/month, 512MB RAM
- **Supports**: Node.js, PostgreSQL, Python
- **Perfect for**: Backend API and Database

### 2. Vercel (Recommended for Frontend)
- **Free tier**: Unlimited static sites
- **Supports**: React, Vite build output
- **Perfect for**: Frontend SPA

### 3. Render (Alternative)
- **Free tier**: 750 hours/month
- **Supports**: Node.js, PostgreSQL
- **Good alternative**: Backend + Database

### 4. Fly.io (Alternative)
- **Free tier**: Shared CPU, 256MB RAM
- **Supports**: Docker deployments
- **Advanced option**: Container-based deployment

## Deployment Steps

### 1. Prepare Environment Variables

Create `.env` files for each service:

#### Backend (.env)
```env
DB_HOST=your-railway-postgres-host.railway.app
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-password
DB_NAME=aqbobek_portal

JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key

FRONTEND_URL=https://your-app.vercel.app
GEMINI_API_KEY=your-gemini-api-key

FIREBASE_PROJECT_ID=your-firebase-project
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
```

#### AI Service (.env)
```env
DATABASE_URL=postgresql://postgres:password@your-railway-host.railway.app:5432/aqbobek_portal
GEMINI_API_KEY=your-gemini-api-key
REDIS_URL=redis://your-redis-host:6379
```

#### Frontend (.env)
```env
VITE_API_URL=https://your-backend.railway.app
VITE_SOCKET_URL=https://your-backend.railway.app
VITE_APP_NAME=Aqbobek Portal
```

### 2. Deploy Backend (Railway)

1. **Create Railway Account**
   - Sign up at [railway.app](https://railway.app)
   - Install Railway CLI: `npm install -g @railway/cli`

2. **Initialize Project**
   ```bash
   cd backend
   railway login
   railway init
   ```

3. **Configure Services**
   ```bash
   # Add PostgreSQL service
   railway add postgresql
   
   # Add Node.js service
   railway add nodejs
   ```

4. **Set Environment Variables**
   ```bash
   railway variables set DB_HOST=$(railway service get -n postgresql -o json | jq -r '.SERVICE_URL')
   # Set other variables from your .env file
   ```

5. **Deploy**
   ```bash
   railway up
   ```

### 3. Deploy AI Service (Railway)

1. **Add Python Service**
   ```bash
   cd ai-service
   railway add python
   ```

2. **Configure and Deploy**
   ```bash
   railway up
   ```

### 4. Deploy Frontend (Vercel)

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy**
   ```bash
   cd frontend
   vercel --prod
   ```

3. **Configure Environment Variables**
   ```bash
   vercel env add VITE_API_URL production
   vercel env add VITE_SOCKET_URL production
   ```

### 5. Setup Firebase (for Push Notifications)

1. **Create Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Create new project
   - Enable Cloud Messaging

2. **Generate Service Account Key**
   - Go to Project Settings > Service Accounts
   - Generate new private key
   - Save JSON file

3. **Configure Backend**
   - Add Firebase credentials to backend environment variables
   - Test push notifications

## Database Setup

### PostgreSQL Migration

```bash
# Install dependencies
cd backend
npm install

# Run migrations
npm run migrate

# Seed initial data
npm run seed
```

### Initial Data Setup

Create admin user and basic subjects:

```sql
-- Create admin user
INSERT INTO users (id, email, password, first_name, last_name, role, is_active)
VALUES (
  gen_random_uuid(),
  'admin@aqbobek.kz',
  '$2b$12$hashedpassword',
  'Admin',
  'User',
  'admin',
  true
);

-- Create basic subjects
INSERT INTO subjects (name, name_kz, color, is_active) VALUES
('Математика', 'Математика', '#1976d2', true),
('Физика', 'Физика', '#d32f2f', true),
('Химия', 'Химия', '#388e3c', true),
('Биология', 'Биология', '#7b1fa2', true),
('История', 'Тарих', '#f57c00', true),
('География', 'География', '#00796b', true),
('Информатика', 'Информатика', '#0277bd', true),
('Литература', 'Әдебиет', '#6a1b9a', true);
```

## Domain Configuration

### Custom Domain Setup

1. **Backend Domain**
   - Configure in Railway dashboard
   - Add CNAME record pointing to Railway

2. **Frontend Domain**
   - Configure in Vercel dashboard
   - Add A records pointing to Vercel

### SSL Certificates
- Both Railway and Vercel provide automatic SSL
- No manual configuration needed

## Monitoring and Logging

### Application Monitoring

1. **Health Checks**
   - Backend: `GET /health`
   - AI Service: `GET /health`

2. **Logging**
   - Railway provides built-in logs
   - Use Winston for structured logging

3. **Error Tracking**
   - Consider Sentry for error monitoring
   - Free tier available

## Performance Optimization

### Frontend Optimization
- Enable code splitting
- Optimize images
- Use CDN for static assets

### Backend Optimization
- Enable Redis caching
- Optimize database queries
- Use connection pooling

### Database Optimization
- Add indexes for frequently queried columns
- Monitor query performance
- Use connection pooling

## Scaling Considerations

### When to Upgrade
- High traffic (>1000 concurrent users)
- Large database (>1GB)
- Need for dedicated resources

### Scaling Options
- Upgrade to paid Railway tiers
- Consider dedicated servers
- Load balancing with multiple instances

## Backup Strategy

### Database Backups
- Railway provides automatic backups
- Export regular backups manually

### Code Backups
- Use Git with GitHub
- Tag releases for easy rollback

## Security Considerations

### Environment Security
- Use strong passwords
- Rotate secrets regularly
- Enable 2FA on all accounts

### Application Security
- Validate all inputs
- Use HTTPS everywhere
- Implement rate limiting

### API Security
- Use JWT tokens
- Implement CORS properly
- Sanitize user inputs

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Check environment variables
   - Verify database is running
   - Check network connectivity

2. **Build Failures**
   - Check dependency versions
   - Verify environment variables
   - Review build logs

3. **Performance Issues**
   - Monitor resource usage
   - Check database queries
   - Review application logs

### Debugging Tools
- Railway logs: `railway logs`
- Vercel logs: Dashboard > Functions > Logs
- Local debugging with Docker

## Maintenance

### Regular Tasks
- Update dependencies monthly
- Review and rotate secrets
- Monitor resource usage
- Backup database regularly

### Updates and Patches
- Test updates in staging
- Use semantic versioning
- Document all changes

## Support

### Documentation
- Keep this guide updated
- Document custom configurations
- Create runbooks for common tasks

### Community Support
- Join Railway Discord
- Follow Vercel blog
- Monitor GitHub issues

## Cost Management

### Free Tier Limits
- Railway: 500 hours/month
- Vercel: Unlimited static sites
- Firebase: Free tier sufficient for small schools

### Cost Optimization
- Optimize resource usage
- Monitor and scale down when possible
- Use open-source alternatives when possible

## Conclusion

This deployment setup provides a robust, scalable solution for the Aqbobek School Portal using free hosting tiers. The architecture is designed to handle typical school loads while remaining cost-effective.

For larger deployments or specific requirements, consider upgrading to paid tiers or exploring dedicated hosting options.
