import React, { useState } from 'react'
import './App.css'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
  }

  if (!isLoggedIn) {
    return (
      <div className="app">
        <div className="login-container">
          <div className="login-card">
            <div className="logo-section">
              <h1>🎓 Aqbobek Portal</h1>
              <p>Единый образовательный портал</p>
            </div>
            
            <form onSubmit={handleLogin} className="login-form">
              <div className="form-group">
                <label>Email</label>
                <input 
                  type="email" 
                  placeholder="Введите ваш email"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Пароль</label>
                <input 
                  type="password" 
                  placeholder="Введите пароль"
                  required
                />
              </div>
              
              <button type="submit" className="login-btn">
                Войти в систему
              </button>
            </form>
            
            <div className="demo-info">
              <p>Демо доступ:</p>
              <small>admin@aqbobek.kz / admin123</small><br/>
              <small>teacher@aqbobek.kz / teacher123</small><br/>
              <small>student@aqbobek.kz / student123</small>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <h1>🎓 Aqbobek Portal</h1>
          </div>
          
          <nav className="nav-menu">
            <button 
              className={activeTab === 'dashboard' ? 'active' : ''}
              onClick={() => setActiveTab('dashboard')}
            >
              📊 Дашборд
            </button>
            <button 
              className={activeTab === 'grades' ? 'active' : ''}
              onClick={() => setActiveTab('grades')}
            >
              📚 Оценки
            </button>
            <button 
              className={activeTab === 'schedule' ? 'active' : ''}
              onClick={() => setActiveTab('schedule')}
            >
              📅 Расписание
            </button>
            <button 
              className={activeTab === 'analytics' ? 'active' : ''}
              onClick={() => setActiveTab('analytics')}
            >
              📈 Аналитика
            </button>
          </nav>
          
          <button onClick={handleLogout} className="logout-btn">
            🚪 Выйти
          </button>
        </div>
      </header>

      <main className="main-content">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'grades' && <Grades />}
        {activeTab === 'schedule' && <Schedule />}
        {activeTab === 'analytics' && <Analytics />}
      </main>
    </div>
  )
}

function Dashboard() {
  return (
    <div className="dashboard">
      <h2>📊 Панель управления</h2>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📚</div>
          <div className="stat-info">
            <h3>Средний балл</h3>
            <p className="stat-value">4.5</p>
            <p className="stat-change">+0.3 за месяц</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-info">
            <h3>Посещаемость</h3>
            <p className="stat-value">95%</p>
            <p className="stat-change">+2% за неделю</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">🏆</div>
          <div className="stat-info">
            <h3>Достижения</h3>
            <p className="stat-value">12</p>
            <p className="stat-change">+2 за месяц</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">⚡</div>
          <div className="stat-info">
            <h3>AI-рекомендации</h3>
            <p className="stat-value">3</p>
            <p className="stat-change">Новые</p>
          </div>
        </div>
      </div>
      
      <div className="recent-activity">
        <h3>🔔 Последние уведомления</h3>
        <div className="activity-list">
          <div className="activity-item">
            <span className="activity-icon">📚</span>
            <div className="activity-content">
              <p>Новая оценка по математике: 5/5</p>
              <small>2 часа назад</small>
            </div>
          </div>
          <div className="activity-item">
            <span className="activity-icon">📅</span>
            <div className="activity-content">
              <p>Расписание на завтра обновлено</p>
              <small>5 часов назад</small>
            </div>
          </div>
          <div className="activity-item">
            <span className="activity-icon">🏆</span>
            <div className="activity-content">
              <p>Получено достижение "Отличник месяца"</p>
              <small>1 день назад</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Grades() {
  const grades = [
    { subject: 'Математика', grade: 5, max: 5, date: '2024-03-28', type: 'Контрольная' },
    { subject: 'Физика', grade: 4, max: 5, date: '2024-03-27', type: 'Лабораторная' },
    { subject: 'Химия', grade: 5, max: 5, date: '2024-03-26', type: 'Тест' },
    { subject: 'Литература', grade: 4, max: 5, date: '2024-03-25', type: 'Сочинение' },
    { subject: 'История', grade: 5, max: 5, date: '2024-03-24', type: 'Проект' },
  ]

  return (
    <div className="grades">
      <h2>📚 Мои оценки</h2>
      
      <div className="grades-summary">
        <div className="summary-card">
          <h3>Средний балл</h3>
          <p className="big-number">4.6</p>
        </div>
        <div className="summary-card">
          <h3>Всего оценок</h3>
          <p className="big-number">28</p>
        </div>
        <div className="summary-card">
          <h3>Пятерок</h3>
          <p className="big-number">15</p>
        </div>
      </div>
      
      <div className="grades-table">
        <h3>Последние оценки</h3>
        <table>
          <thead>
            <tr>
              <th>Предмет</th>
              <th>Оценка</th>
              <th>Тип</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody>
            {grades.map((grade, index) => (
              <tr key={index}>
                <td>{grade.subject}</td>
                <td>
                  <span className={`grade-badge grade-${grade.grade}`}>
                    {grade.grade}/{grade.max}
                  </span>
                </td>
                <td>{grade.type}</td>
                <td>{grade.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Schedule() {
  const schedule = [
    { time: '8:00', subject: 'Математика', teacher: 'Ахметов А.А.', room: '201' },
    { time: '9:00', subject: 'Физика', teacher: 'Смагулов К.М.', room: '305' },
    { time: '10:00', subject: 'Перерыв', teacher: '-', room: '-' },
    { time: '10:30', subject: 'Химия', teacher: 'Нурмагамбетова Г.С.', room: '203' },
    { time: '11:30', subject: 'Литература', teacher: 'Кожахметова А.Б.', room: '102' },
    { time: '12:30', subject: 'Обед', teacher: '-', room: '-' },
    { time: '13:00', subject: 'История', teacher: 'Есенбаев Б.К.', room: '104' },
  ]

  return (
    <div className="schedule">
      <h2>📅 Расписание на сегодня</h2>
      
      <div className="schedule-date">
        <h3>Пятница, 29 марта 2024</h3>
        <p>7 "А" класс</p>
      </div>
      
      <div className="schedule-list">
        {schedule.map((lesson, index) => (
          <div key={index} className={`schedule-item ${lesson.subject === 'Перерыв' || lesson.subject === 'Обед' ? 'break' : ''}`}>
            <div className="time">{lesson.time}</div>
            <div className="lesson-info">
              <h4>{lesson.subject}</h4>
              <p>{lesson.teacher}</p>
            </div>
            <div className="room">{lesson.room}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Analytics() {
  return (
    <div className="analytics">
      <h2>📈 Моя аналитика</h2>
      
      <div className="analytics-grid">
        <div className="chart-card">
          <h3>📊 График успеваемости</h3>
          <div className="chart-placeholder">
            <div className="chart-bars">
              <div className="bar" style={{height: '80%'}}></div>
              <div className="bar" style={{height: '90%'}}></div>
              <div className="bar" style={{height: '85%'}}></div>
              <div className="bar" style={{height: '95%'}}></div>
              <div className="bar" style={{height: '88%'}}></div>
            </div>
            <div className="chart-labels">
              <span>Сен</span>
              <span>Окт</span>
              <span>Ноя</span>
              <span>Дек</span>
              <span>Янв</span>
            </div>
          </div>
        </div>
        
        <div className="ai-recommendations">
          <h3>🤖 AI-рекомендации</h3>
          <div className="recommendation-list">
            <div className="recommendation-item high">
              <span className="priority">Высокий</span>
              <p>Уделите внимание физике - последние результаты ниже ожидаемых</p>
            </div>
            <div className="recommendation-item medium">
              <span className="priority">Средний</span>
              <p>Рекомендуется повторить темы по алгебре перед контрольной</p>
            </div>
            <div className="recommendation-item low">
              <span className="priority">Низкий</span>
              <p>Отличная работа по литературе! Продолжайте в том же духе</p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="achievements">
        <h3>🏆 Мои достижения</h3>
        <div className="achievement-grid">
          <div className="achievement-badge gold">
            <span className="achievement-icon">🌟</span>
            <p>Отличник</p>
          </div>
          <div className="achievement-badge silver">
            <span className="achievement-icon">📚</span>
            <p>Книголюб</p>
          </div>
          <div className="achievement-badge bronze">
            <span className="achievement-icon">🔬</span>
            <p>Юный ученый</p>
          </div>
          <div className="achievement-badge special">
            <span className="achievement-icon">💡</span>
            <p>Инноватор</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
