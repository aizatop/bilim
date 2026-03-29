from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.graph_objects as go
import plotly.express as px
from plotly.utils import PlotlyJSONEncoder
import json
import google.generativeai as genai
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
import logging
import asyncio
import aiofiles
from sqlalchemy import create_engine, text
import redis
import pickle
import base64
from io import BytesIO

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Aqbobek AI Analytics Service",
    description="AI-powered analytics and recommendations for Aqbobek School Portal",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/aqbobek_portal")
engine = create_engine(DATABASE_URL)

# Redis connection
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.from_url(REDIS_URL)

# Gemini AI setup
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-pro')

class GradeData(BaseModel):
    student_id: str
    subject: str
    score: float
    max_score: float
    date: datetime
    quarter: int
    type: str

class AttendanceData(BaseModel):
    student_id: str
    date: datetime
    status: str
    subject: Optional[str] = None

class RiskAnalysisRequest(BaseModel):
    student_id: str
    subject_ids: List[str]

class RecommendationRequest(BaseModel):
    student_id: str
    subject_id: str
    risk_level: float
    recent_grades: List[float]
    attendance_rate: float

class RiskAnalysisResponse(BaseModel):
    student_id: str
    subject_id: str
    risk_level: float
    factors: Dict[str, float]
    recommendations: List[str]
    last_updated: datetime

class AIRecommendation(BaseModel):
    student_id: str
    subject_id: str
    type: str
    title: str
    content: str
    priority: str
    risk_level: Optional[float] = None

# Global ML models
risk_models = {}
scalers = {}

def get_db_connection():
    return engine.connect()

def get_redis():
    return redis_client

def load_student_data(student_id: str) -> Dict[str, pd.DataFrame]:
    """Load student data from database"""
    conn = get_db_connection()
    
    # Load grades
    grades_query = text("""
        SELECT g.*, s.name as subject_name, s.color as subject_color,
               u.first_name || ' ' || u.last_name as teacher_name
        FROM grades g
        JOIN subjects s ON g.subject_id = s.id
        JOIN users u ON g.teacher_id = u.id
        WHERE g.student_id = :student_id
        ORDER BY g.date DESC
    """)
    
    # Load attendance
    attendance_query = text("""
        SELECT a.*, s.name as subject_name, s.color as subject_color
        FROM attendance a
        LEFT JOIN subjects s ON a.subject_id = s.id
        WHERE a.student_id = :student_id
        ORDER BY a.date DESC
    """)
    
    grades_df = pd.read_sql(grades_query, conn, params={"student_id": student_id})
    attendance_df = pd.read_sql(attendance_query, conn, params={"student_id": student_id})
    
    conn.close()
    
    return {
        "grades": grades_df,
        "attendance": attendance_df
    }

def calculate_risk_factors(grades_df: pd.DataFrame, attendance_df: pd.DataFrame) -> Dict[str, float]:
    """Calculate risk factors for a student"""
    factors = {}
    
    if not grades_df.empty:
        # Grade performance factors
        grades_df['percentage'] = (grades_df['score'] / grades_df['max_score']) * 100
        factors['average_grade'] = grades_df['percentage'].mean()
        factors['grade_variance'] = grades_df['percentage'].var()
        factors['grade_trend'] = calculate_grade_trend(grades_df)
        factors['failing_rate'] = (grades_df['percentage'] < 60).mean() * 100
    
    if not attendance_df.empty:
        # Attendance factors
        total_days = len(attendance_df)
        present_days = (attendance_df['status'] == 'present').sum()
        factors['attendance_rate'] = (present_days / total_days) * 100 if total_days > 0 else 0
        factors['absence_rate'] = ((attendance_df['status'] == 'absent').sum() / total_days) * 100 if total_days > 0 else 0
        factors['late_rate'] = ((attendance_df['status'] == 'late').sum() / total_days) * 100 if total_days > 0 else 0
    
    return factors

def calculate_grade_trend(grades_df: pd.DataFrame) -> float:
    """Calculate grade trend (positive = improving, negative = declining)"""
    if len(grades_df) < 2:
        return 0.0
    
    grades_df = grades_df.sort_values('date')
    grades_df['percentage'] = (grades_df['score'] / grades_df['max_score']) * 100
    
    # Simple linear regression for trend
    x = np.arange(len(grades_df))
    y = grades_df['percentage'].values
    
    if len(x) < 2:
        return 0.0
    
    slope = np.polyfit(x, y, 1)[0]
    return slope

def calculate_overall_risk(factors: Dict[str, float]) -> float:
    """Calculate overall risk level (0-1)"""
    risk_score = 0.0
    weights = {
        'average_grade': 0.3,
        'grade_variance': 0.2,
        'grade_trend': 0.2,
        'attendance_rate': 0.2,
        'absence_rate': 0.1
    }
    
    # Normalize factors to 0-1 scale where higher = more risk
    normalized_factors = {}
    
    if 'average_grade' in factors:
        # Lower average grade = higher risk
        normalized_factors['average_grade'] = max(0, (100 - factors['average_grade']) / 100)
    
    if 'grade_variance' in factors:
        # Higher variance = higher risk
        max_variance = 400  # Maximum possible variance for 0-100 scale
        normalized_factors['grade_variance'] = min(1, factors['grade_variance'] / max_variance)
    
    if 'grade_trend' in factors:
        # Negative trend = higher risk
        normalized_factors['grade_trend'] = max(0, -factors['grade_trend'] / 10)  # Normalize negative trends
    
    if 'attendance_rate' in factors:
        # Lower attendance = higher risk
        normalized_factors['attendance_rate'] = max(0, (100 - factors['attendance_rate']) / 100)
    
    if 'absence_rate' in factors:
        # Higher absence rate = higher risk
        normalized_factors['absence_rate'] = min(1, factors['absence_rate'] / 100)
    
    # Calculate weighted risk score
    for factor, weight in weights.items():
        if factor in normalized_factors:
            risk_score += normalized_factors[factor] * weight
    
    return min(1.0, risk_score)

def generate_ml_recommendations(factors: Dict[str, float], risk_level: float) -> List[str]:
    """Generate ML-based recommendations"""
    recommendations = []
    
    if risk_level > 0.7:
        recommendations.append("Срочно требуется дополнительная помощь по предмету")
        recommendations.append("Рекомендуется индивидуальное занятие с учителем")
    
    if factors.get('average_grade', 100) < 60:
        recommendations.append("Необходимо уделить внимание базовым концепциям предмета")
        recommendations.append("Рекомендуется повторить предыдущие темы")
    
    if factors.get('attendance_rate', 100) < 80:
        recommendations.append("Важно улучшить посещаемость занятий")
        recommendations.append("Пропущенные занятия необходимо наверстать")
    
    if factors.get('grade_variance', 0) > 200:
        recommendations.append("Результаты нестабильны - требуется систематический подход")
        recommendations.append("Рекомендуется регулярная подготовка")
    
    if factors.get('grade_trend', 0) < -2:
        recommendations.append("Обнаружена отрицательная динамика - требуется вмешательство")
        recommendations.append("Необходимо выявить причины снижения успеваемости")
    
    return recommendations

async def generate_ai_recommendation(student_data: Dict, subject: str, risk_level: float) -> str:
    """Generate AI-powered recommendation using Gemini"""
    if not GEMINI_API_KEY:
        return "AI-сервис временно недоступен. Обратитесь к учителю за рекомендациями."
    
    try:
        prompt = f"""
        Ты - образовательный AI-ассистент для лицея Aqbobek. 
        
        Данные ученика:
        - Предмет: {subject}
        - Уровень риска: {risk_level:.2f} (0-1, где 1 - максимальный риск)
        - Средний балл: {student_data.get('average_grade', 'N/A')}%
        - Посещаемость: {student_data.get('attendance_rate', 'N/A')}%
        - Дисперсия оценок: {student_data.get('grade_variance', 'N/A')}
        - Тренд успеваемости: {student_data.get('grade_trend', 'N/A')}
        
        Сгенерируй краткую, конкретную и мотивирующую рекомендацию для ученика на казахском или русском языке.
        Рекомендация должна быть:
        1. Не более 2-3 предложений
        2. Практической и применимой
        3. Мотивирующей
        4. Адаптированной под уровень риска
        
        Ответ должен содержать только рекомендацию без дополнительных объяснений.
        """
        
        response = model.generate_content(prompt)
        return response.text.strip()
    
    except Exception as e:
        logger.error(f"Error generating AI recommendation: {e}")
        return "Временная ошибка AI-сервиса. Попробуйте позже."

@app.post("/analyze-risk", response_model=RiskAnalysisResponse)
async def analyze_risk(request: RiskAnalysisRequest):
    """Analyze student risk factors"""
    try:
        student_data = load_student_data(request.student_id)
        grades_df = student_data["grades"]
        attendance_df = student_data["attendance"]
        
        # Filter by subjects if specified
        if request.subject_ids:
            grades_df = grades_df[grades_df['subject_id'].isin(request.subject_ids)]
        
        factors = calculate_risk_factors(grades_df, attendance_df)
        risk_level = calculate_overall_risk(factors)
        
        # Generate recommendations
        ml_recommendations = generate_ml_recommendations(factors, risk_level)
        
        # Get AI recommendation for highest risk subject
        ai_recommendation = ""
        if not grades_df.empty and risk_level > 0.3:
            highest_risk_subject = grades_df.groupby('subject_name')['percentage'].mean().idxmin()
            subject_data = {
                'average_grade': factors.get('average_grade', 0),
                'attendance_rate': factors.get('attendance_rate', 0),
                'grade_variance': factors.get('grade_variance', 0),
                'grade_trend': factors.get('grade_trend', 0)
            }
            ai_recommendation = await generate_ai_recommendation(subject_data, highest_risk_subject, risk_level)
        
        all_recommendations = ml_recommendations
        if ai_recommendation:
            all_recommendations.append(ai_recommendation)
        
        return RiskAnalysisResponse(
            student_id=request.student_id,
            subject_id=request.subject_ids[0] if request.subject_ids else "",
            risk_level=risk_level,
            factors=factors,
            recommendations=all_recommendations,
            last_updated=datetime.now()
        )
    
    except Exception as e:
        logger.error(f"Error in risk analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-recommendation", response_model=AIRecommendation)
async def generate_recommendation(request: RecommendationRequest, background_tasks: BackgroundTasks):
    """Generate personalized AI recommendation"""
    try:
        student_data = load_student_data(request.student_id)
        
        # Prepare data for AI
        subject_data = {
            'average_grade': np.mean(request.recent_grades) if request.recent_grades else 0,
            'attendance_rate': request.attendance_rate,
            'recent_grades': request.recent_grades,
            'risk_level': request.risk_level
        }
        
        # Get subject name
        grades_df = student_data["grades"]
        subject_name = "Предмет"
        if not grades_df.empty:
            subject_row = grades_df[grades_df['subject_id'] == request.subject_id].iloc[0] if not grades_df[grades_df['subject_id'] == request.subject_id].empty else None
            if subject_row is not None:
                subject_name = subject_row['subject_name']
        
        # Generate AI recommendation
        content = await generate_ai_recommendation(subject_data, subject_name, request.risk_level)
        
        # Determine priority
        if request.risk_level > 0.7:
            priority = "high"
        elif request.risk_level > 0.4:
            priority = "medium"
        else:
            priority = "low"
        
        return AIRecommendation(
            student_id=request.student_id,
            subject_id=request.subject_id,
            type="ai_recommendation",
            title="AI-рекомендация",
            content=content,
            priority=priority,
            risk_level=request.risk_level
        )
    
    except Exception as e:
        logger.error(f"Error generating recommendation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/class-analytics/{class_id}")
async def get_class_analytics(class_id: str):
    """Get analytics for entire class"""
    try:
        conn = get_db_connection()
        
        # Get all students in class
        students_query = text("""
            SELECT id, first_name, last_name
            FROM users
            WHERE class_id = :class_id AND role = 'student'
        """)
        students_df = pd.read_sql(students_query, conn, params={"class_id": class_id})
        
        if students_df.empty:
            return {"students": [], "class_stats": {}}
        
        # Get grades for all students
        grades_query = text("""
            SELECT g.student_id, g.score, g.max_score, s.name as subject_name
            FROM grades g
            JOIN subjects s ON g.subject_id = s.id
            WHERE g.student_id IN (SELECT id FROM users WHERE class_id = :class_id)
        """)
        grades_df = pd.read_sql(grades_query, conn, params={"class_id": class_id})
        
        conn.close()
        
        # Calculate analytics for each student
        student_analytics = []
        class_risk_levels = []
        
        for _, student in students_df.iterrows():
            student_grades = grades_df[grades_df['student_id'] == student['id']]
            
            if not student_grades.empty:
                student_grades['percentage'] = (student_grades['score'] / student_grades['max_score']) * 100
                avg_grade = student_grades['percentage'].mean()
                variance = student_grades['percentage'].var()
                
                # Simple risk calculation
                risk_score = max(0, (100 - avg_grade) / 100) * 0.7 + (variance / 400) * 0.3
                class_risk_levels.append(risk_score)
                
                student_analytics.append({
                    "student_id": student['id'],
                    "name": f"{student['first_name']} {student['last_name']}",
                    "average_grade": avg_grade,
                    "grade_variance": variance,
                    "risk_level": risk_score,
                    "total_grades": len(student_grades)
                })
        
        # Class statistics
        class_stats = {}
        if class_risk_levels:
            class_stats = {
                "total_students": len(student_analytics),
                "average_risk": np.mean(class_risk_levels),
                "high_risk_students": len([r for r in class_risk_levels if r > 0.7]),
                "medium_risk_students": len([r for r in class_risk_levels if 0.4 < r <= 0.7]),
                "low_risk_students": len([r for r in class_risk_levels if r <= 0.4])
            }
        
        return {
            "students": student_analytics,
            "class_stats": class_stats
        }
    
    except Exception as e:
        logger.error(f"Error in class analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/performance-chart/{student_id}")
async def get_performance_chart(student_id: str):
    """Generate performance chart data"""
    try:
        student_data = load_student_data(student_id)
        grades_df = student_data["grades"]
        
        if grades_df.empty:
            return {"chart_data": None}
        
        grades_df['percentage'] = (grades_df['score'] / grades_df['max_score']) * 100
        grades_df = grades_df.sort_values('date')
        
        # Create trend data
        chart_data = {
            "dates": grades_df['date'].dt.strftime('%Y-%m-%d').tolist(),
            "percentages": grades_df['percentage'].tolist(),
            "subjects": grades_df['subject_name'].tolist(),
            "types": grades_df['type'].tolist()
        }
        
        return {"chart_data": chart_data}
    
    except Exception as e:
        logger.error(f"Error generating performance chart: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/batch-analyze")
async def batch_analyze_students(student_ids: List[str]):
    """Analyze multiple students at once"""
    try:
        results = []
        
        for student_id in student_ids:
            try:
                student_data = load_student_data(student_id)
                grades_df = student_data["grades"]
                attendance_df = student_data["attendance"]
                
                factors = calculate_risk_factors(grades_df, attendance_df)
                risk_level = calculate_overall_risk(factors)
                
                results.append({
                    "student_id": student_id,
                    "risk_level": risk_level,
                    "factors": factors
                })
            
            except Exception as e:
                logger.error(f"Error analyzing student {student_id}: {e}")
                results.append({
                    "student_id": student_id,
                    "error": str(e)
                })
        
        return {"results": results}
    
    except Exception as e:
        logger.error(f"Error in batch analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "database": "connected",
            "redis": "connected" if redis_client.ping() else "disconnected",
            "ai": "available" if GEMINI_API_KEY else "disabled"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
