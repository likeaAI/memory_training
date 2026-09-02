import os
import json
import sqlite3
from utils import hash_password

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "memory_app.db")

# =================================================================
# 🗄️ SQLite 데이터베이스 초기화 및 자동 마이그레이션
# =================================================================
def init_db():
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    
    # 0. 사용자(User) 테이블 (마스터 권한 및 승인제 탑재)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        role TEXT DEFAULT 'user',
        is_approved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 1. 단어 세트 테이블 (user_id 컬럼 포함)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS trainings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER DEFAULT 1,
        title TEXT NOT NULL,
        source_type TEXT DEFAULT 'topic',
        word_count INTEGER DEFAULT 5,
        quiz_data_json TEXT NOT NULL,
        user_story TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)

    # 2. 실전 훈련 세션 기록 테이블 (user_id 컬럼 포함)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS training_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER DEFAULT 1,
        training_id INTEGER,
        title TEXT,
        difficulty TEXT,
        memorize_sec REAL,
        test_sec REAL,
        sec_per_word REAL,
        total_words INTEGER,
        correct_words INTEGER,
        accuracy REAL,
        hints_used INTEGER DEFAULT 0,
        user_story TEXT,
        technique_score INTEGER DEFAULT 0,
        ai_summary TEXT,
        ai_weak_points TEXT,
        ai_tip TEXT,
        details_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (training_id) REFERENCES trainings (id)
    )
    """)
    
    # 3. 순간 공간 기억력 훈련 세션 테이블
    cur.execute("""
    CREATE TABLE IF NOT EXISTS spatial_memory_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER DEFAULT 1,
        grid_size INTEGER DEFAULT 4,
        target_count INTEGER DEFAULT 5,
        exposure_sec REAL DEFAULT 3.0,
        reaction_time_ms REAL DEFAULT 0,
        is_success INTEGER DEFAULT 0,
        cleared_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)

    # 4. [신규] 두뇌 활성 스도쿠(Sudoku) 세션 테이블
    cur.execute("""
    CREATE TABLE IF NOT EXISTS sudoku_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER DEFAULT 1,
        difficulty TEXT DEFAULT 'normal',
        clear_time_sec INTEGER DEFAULT 0,
        hints_used INTEGER DEFAULT 0,
        is_cleared INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)
    
    # 5. 기존 DB 마이그레이션
    try:
        cur.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE trainings ADD COLUMN user_id INTEGER DEFAULT 1")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE training_sessions ADD COLUMN user_id INTEGER DEFAULT 1")
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute("ALTER TABLE spatial_memory_sessions ADD COLUMN user_id INTEGER DEFAULT 1")
    except sqlite3.OperationalError:
        pass

    # 👑 마스터(Admin) 오너 계정 기본 보장 (아이디: admin / 비밀번호: admin1234)
    cur.execute("SELECT id FROM users WHERE username = 'admin'")
    if not cur.fetchone():
        cur.execute("""
            INSERT INTO users (username, password_hash, display_name, role, is_approved)
            VALUES ('admin', ?, '👑 마스터 오너', 'admin', 1)
        """, (hash_password('admin1234'),))
    else:
        # 기존 admin이 있으면 마스터 권한 및 승인 강제 부여
        cur.execute("UPDATE users SET role = 'admin', is_approved = 1 WHERE username = 'admin'")
    
    conn.commit()
    conn.close()

# 모듈 로드 시 DB 자동 초기화
init_db()

# =================================================================
# 💾 사용자 인증 및 마스터 계정 관리 함수
# =================================================================
def create_user_by_admin(username, password, display_name=None, role='user'):
    """마스터 관리자가 직접 승인된 새 계정 발급"""
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    pw_hash = hash_password(password)
    display = display_name or username
    try:
        cur.execute("""
            INSERT INTO users (username, password_hash, display_name, role, is_approved)
            VALUES (?, ?, ?, ?, 1)
        """, (username, pw_hash, display, role))
        user_id = cur.lastrowid
        conn.commit()
        return {"success": True, "user_id": user_id, "username": username, "display_name": display}
    except sqlite3.IntegrityError:
        return {"error": "이미 존재하는 아이디입니다."}
    finally:
        conn.close()

def login_user(username, password):
    """마스터 및 승인된 사용자 전용 로그인"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    pw_hash = hash_password(password)
    cur.execute("""
        SELECT * FROM users WHERE username = ? AND password_hash = ?
    """, (username, pw_hash))
    user = cur.fetchone()
    conn.close()
    
    if not user:
        return {"error": "아이디 또는 비밀번호가 올바르지 않습니다."}
    
    # 🚨 마스터 승인 여부 검증 (미승인 외부인 차단)
    if user["role"] != "admin" and not user["is_approved"]:
        return {"error": "마스터 관리자의 승인이 필요한 계정입니다."}

    return {
        "success": True,
        "user_id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"] or user["username"],
        "role": user["role"]
    }

def save_or_update_training(title, quiz_data, user_story="", source_type="topic", user_id=1):
    """단어 세트 영구 저장/업데이트"""
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    quiz_json = json.dumps(quiz_data, ensure_ascii=False)
    
    cur.execute("SELECT id FROM trainings WHERE title = ? AND user_id = ?", (title, user_id))
    row = cur.fetchone()
    if row:
        training_id = row[0]
        cur.execute("""
            UPDATE trainings 
            SET quiz_data_json = ?, user_story = ?, word_count = ?
            WHERE id = ? AND user_id = ?
        """, (quiz_json, user_story, len(quiz_data), training_id, user_id))
    else:
        cur.execute("""
            INSERT INTO trainings (user_id, title, source_type, word_count, quiz_data_json, user_story)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, title, source_type, len(quiz_data), quiz_json, user_story))
        training_id = cur.lastrowid
    
    conn.commit()
    conn.close()
    return training_id

def auto_save_session(session_data, user_id=1):
    """시험 종료 즉시 SQLite 세션 자동 영구 저장"""
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    
    title = session_data.get("title", "단어 훈련")
    quiz_data = session_data.get("quiz_data", [])
    user_story = session_data.get("user_story", "")
    
    training_id = save_or_update_training(title, quiz_data, user_story, user_id=user_id)
    
    total = len(quiz_data)
    correct = session_data.get("correct_words", 0)
    acc = session_data.get("accuracy", 0.0)
    mem_sec = float(session_data.get("memorize_sec", 0.0))
    test_sec = float(session_data.get("test_sec", 0.0))
    sec_per_word = round(test_sec / total, 2) if total > 0 else 0.0
    
    cur.execute("""
        INSERT INTO training_sessions (
            user_id, training_id, title, difficulty, memorize_sec, test_sec, sec_per_word,
            total_words, correct_words, accuracy, hints_used, user_story,
            technique_score, ai_summary, ai_weak_points, ai_tip, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        training_id,
        title,
        session_data.get("difficulty", "normal"),
        mem_sec,
        test_sec,
        sec_per_word,
        total,
        correct,
        acc,
        1 if session_data.get("hints_used") else 0,
        user_story,
        session_data.get("technique_score", 0),
        session_data.get("ai_summary", ""),
        session_data.get("ai_weak_points", ""),
        session_data.get("ai_tip", ""),
        json.dumps(session_data.get("details", []), ensure_ascii=False)
    ))
    
    session_id = cur.lastrowid
    conn.commit()
    conn.close()
    return session_id

def auto_save_spatial_session(user_id, grid_size, target_count, exposure_sec, reaction_time_ms, is_success, cleared_count):
    """순간 공간 기억력 훈련 기록 SQLite 자동 저장"""
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO spatial_memory_sessions (
            user_id, grid_size, target_count, exposure_sec, reaction_time_ms, is_success, cleared_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (user_id, grid_size, target_count, exposure_sec, reaction_time_ms, 1 if is_success else 0, cleared_count))
    session_id = cur.lastrowid
    conn.commit()
    conn.close()
    return session_id

def get_spatial_dashboard(user_id=1):
    """사용자의 공간 순간 기억력 통계 및 최고 기록 조회 (마스터 및 통합 기록 연동)"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    cur.execute("""
        SELECT * FROM spatial_memory_sessions 
        WHERE user_id = ? OR user_id = 1
        ORDER BY created_at DESC 
        LIMIT 40
    """, (user_id,))
    rows = cur.fetchall()
    
    history = [dict(r) for r in rows]
    
    # 최고 기억 용량 (최대 성공 숫자 수)
    cur.execute("""
        SELECT MAX(target_count) as max_span, AVG(reaction_time_ms) as avg_rt,
               SUM(is_success) as total_wins, COUNT(*) as total_plays
        FROM spatial_memory_sessions 
        WHERE user_id = ? OR user_id = 1
    """, (user_id,))
    stats = dict(cur.fetchone() or {})
    
    conn.close()
    return {
        "history": history,
        "max_span": stats.get("max_span") or 0,
        "avg_rt": round(stats.get("avg_rt") or 0, 1),
        "total_wins": stats.get("total_wins") or 0,
        "total_plays": stats.get("total_plays") or 0
    }

def get_dashboard_data(user_id=1):
    """특정 user_id의 훈련 기록 및 단어 세트 조회 (이전 기록 통합 연동)"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    cur.execute("""
        SELECT * FROM training_sessions 
        WHERE user_id = ? OR user_id = 1
        ORDER BY created_at DESC 
        LIMIT 40
    """, (user_id,))
    session_rows = cur.fetchall()
    
    sessions = []
    for r in session_rows:
        sessions.append({
            "id": r["id"],
            "title": r["title"],
            "difficulty": r["difficulty"],
            "memorize_sec": r["memorize_sec"],
            "test_sec": r["test_sec"],
            "sec_per_word": r["sec_per_word"],
            "total_words": r["total_words"],
            "correct_words": r["correct_words"],
            "accuracy": r["accuracy"],
            "user_story": r["user_story"],
            "technique_score": r["technique_score"],
            "created_at": r["created_at"]
        })
    
    cur.execute("SELECT * FROM trainings WHERE user_id = ? OR user_id = 1 ORDER BY created_at DESC", (user_id,))
    training_rows = cur.fetchall()
    trainings = {}
    for t in training_rows:
        trainings[t["title"]] = {
            "id": t["id"],
            "title": t["title"],
            "word_count": t["word_count"],
            "quiz_data": json.loads(t["quiz_data_json"]),
            "user_story": t["user_story"],
            "created_at": t["created_at"]
        }
    
    conn.close()
    return {
        "sessions": sessions,
        "trainings": trainings
    }

def auto_save_sudoku_session(user_id, difficulty, clear_time_sec, hints_used=0, is_cleared=1):
    """두뇌 스도쿠 훈련 기록 SQLite 자동 저장"""
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO sudoku_sessions (
            user_id, difficulty, clear_time_sec, hints_used, is_cleared
        ) VALUES (?, ?, ?, ?, ?)
    """, (user_id, difficulty, clear_time_sec, hints_used, is_cleared))
    session_id = cur.lastrowid
    conn.commit()
    conn.close()
    return session_id

def get_sudoku_dashboard(user_id=1):
    """사용자의 스도쿠 통계 및 최단 클리어 기록 조회"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    cur.execute("""
        SELECT * FROM sudoku_sessions 
        WHERE user_id = ? OR user_id = 1
        ORDER BY created_at DESC 
        LIMIT 40
    """, (user_id,))
    rows = cur.fetchall()
    history = [dict(r) for r in rows]
    
    cur.execute("""
        SELECT MIN(clear_time_sec) as best_time, AVG(clear_time_sec) as avg_time,
               COUNT(*) as total_clears
        FROM sudoku_sessions 
        WHERE (user_id = ? OR user_id = 1) AND is_cleared = 1
    """, (user_id,))
    stats = dict(cur.fetchone() or {})
    
    conn.close()
    return {
        "history": history,
        "best_time": stats.get("best_time") or 0,
        "avg_time": round(stats.get("avg_time") or 0, 1),
        "total_clears": stats.get("total_clears") or 0
    }
