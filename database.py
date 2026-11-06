import os
import json
import sqlite3
import urllib.request
import threading
import requests
from utils import hash_password

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "memory_app.db")

# .env 및 환경변수에서 구글 시트 웹 앱 URL 자동 로드
def get_google_sheet_url():
    url = os.environ.get("GOOGLE_SHEET_URL", "")
    if url:
        return url.strip()
    env_path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("GOOGLE_SHEET_URL="):
                        return line.split("=", 1)[1].strip()
        except Exception:
            pass
    return ""

GOOGLE_SHEET_URL = get_google_sheet_url()

# 🌐 백그라운드 스레드 비동기 전송 (requests로 302 리다이렉트 완벽 지원)
def async_send_to_google_sheet(payload):
    def _worker():
        sheet_url = get_google_sheet_url()
        if not sheet_url:
            return
        try:
            # Google Apps Script는 302 Redirect를 반환하므로 requests가 필수적임!
            res = requests.post(
                sheet_url,
                json=payload,
                timeout=12,
                allow_redirects=True,
                headers={"Content-Type": "application/json"}
            )
            print(f"[GoogleSheetSync] 전송 완료: {payload.get('type')} (HTTP {res.status_code})")
        except Exception as e:
            print(f"[GoogleSheetSync] 전송 오류: {e}")

    threading.Thread(target=_worker, daemon=True).start()

# 🌐 구글 시트에서 온디맨드 전체 데이터 조회
def fetch_google_sheet_data():
    sheet_url = get_google_sheet_url()
    if not sheet_url:
        return None
    try:
        res = requests.get(sheet_url, params={"action": "get_all"}, timeout=8, allow_redirects=True)
        if res.status_code == 200:
            return res.json()
        return None
    except Exception as e:
        print(f"[GoogleSheetSync] 조회 실패 (SQLite 폴백): {e}")
        return None

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

    # 5. 🤖 [핵심] LLM 파인튜닝 데이터셋 수집 테이블 (Gemma 4 / Qwen 파인튜닝 전용)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS finetune_dataset (
        id TEXT PRIMARY KEY,
        user_id INTEGER DEFAULT 1,
        topic TEXT,
        word_count INTEGER,
        words_json TEXT,
        user_story TEXT,
        alpaca_json TEXT,
        sharegpt_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)
    
    # 6. 기존 DB 마이그레이션
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

    # 7. 📚 [신규] 100+ 주제별 1,000단어 대량 단어 은행 (Word Bank) 테이블
    cur.execute("""
    CREATE TABLE IF NOT EXISTS word_bank (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic TEXT NOT NULL,
        sub_category TEXT,
        word TEXT NOT NULL,
        definition TEXT NOT NULL,
        importance_reason TEXT,
        visual_anchor TEXT,
        chosung TEXT,
        difficulty TEXT DEFAULT 'normal',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(topic, word)
    )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_word_bank_topic ON word_bank(topic)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_word_bank_sub ON word_bank(sub_category)")
    
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

    # 🌐 구글 시트 비동기 영구 저장 (백그라운드 전송)
    async_send_to_google_sheet({
        "type": "save_training",
        "title": title,
        "word_count": len(quiz_data),
        "quiz_data": quiz_data,
        "user_story": user_story
    })

    return training_id

def delete_training(title, user_id=1):
    """단어 세트 삭제 (SQLite + 구글 시트 양방향 삭제)"""
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("DELETE FROM trainings WHERE title = ? AND (user_id = ? OR user_id = 1)", (title, user_id))
    cur.execute("DELETE FROM training_sessions WHERE title = ? AND (user_id = ? OR user_id = 1)", (title, user_id))
    conn.commit()
    conn.close()

    # 🌐 구글 시트에서도 비동기 행 삭제
    async_send_to_google_sheet({
        "type": "delete_training",
        "title": title
    })
    return True

def clear_all_logs(user_id=1):
    """전체 훈련 로그 초기화 (SQLite + 구글 시트 양방향)"""
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("DELETE FROM training_sessions WHERE user_id = ? OR user_id = 1", (user_id,))
    cur.execute("DELETE FROM spatial_memory_sessions WHERE user_id = ? OR user_id = 1", (user_id,))
    cur.execute("DELETE FROM sudoku_sessions WHERE user_id = ? OR user_id = 1", (user_id,))
    conn.commit()
    conn.close()

    # 🌐 구글 시트 로그 시트도 초기화
    async_send_to_google_sheet({
        "type": "clear_all_logs"
    })
    return True

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

    # 🌐 구글 시트 비동기 영구 저장 (백그라운드 전송)
    async_send_to_google_sheet({
        "type": "log_concept",
        "title": title,
        "accuracy": acc,
        "correct_words": correct,
        "total_words": total,
        "memorize_sec": mem_sec,
        "test_sec": test_sec
    })

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

    # 🌐 구글 시트 비동기 영구 저장 (백그라운드 전송)
    async_send_to_google_sheet({
        "type": "log_spatial",
        "grid_size": grid_size,
        "target_count": target_count,
        "is_success": 1 if is_success else 0,
        "reaction_time_ms": reaction_time_ms
    })

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

    # 구글 시트에 원격 데이터가 있으면 병합
    sheet_data = fetch_google_sheet_data()
    if sheet_data and sheet_data.get("spatial_history"):
        remote_history = sheet_data.get("spatial_history", [])
        if len(remote_history) > len(history):
            history = remote_history
            wins = sum(1 for h in history if h.get("is_success") == 1)
            stats["total_plays"] = len(history)
            stats["total_wins"] = wins
            spans = [h.get("target_count", 0) for h in history if h.get("is_success") == 1]
            stats["max_span"] = max(spans) if spans else 0
    
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

    # 🌐 구글 시트 원격 데이터가 있으면 우선 병합
    sheet_data = fetch_google_sheet_data()
    if sheet_data:
        if sheet_data.get("trainings"):
            for k, v in sheet_data["trainings"].items():
                trainings[k] = v
        if sheet_data.get("concept_sessions"):
            remote_sessions = sheet_data["concept_sessions"]
            if len(remote_sessions) > len(sessions):
                sessions = remote_sessions
    
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

    # 🌐 구글 시트 비동기 영구 저장 (백그라운드 전송)
    async_send_to_google_sheet({
        "type": "log_sudoku",
        "difficulty": difficulty,
        "clear_time_sec": clear_time_sec,
        "hints_used": hints_used,
        "is_cleared": is_cleared
    })

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

    # 구글 시트에 원격 데이터가 있으면 병합
    sheet_data = fetch_google_sheet_data()
    if sheet_data and sheet_data.get("sudoku_history"):
        remote_history = sheet_data.get("sudoku_history", [])
        if len(remote_history) > len(history):
            history = remote_history
            cleared_times = [h["clear_time_sec"] for h in history if h.get("is_cleared") == 1]
            stats["total_clears"] = len(cleared_times)
            stats["best_time"] = min(cleared_times) if cleared_times else 0
            stats["avg_time"] = round(sum(cleared_times) / len(cleared_times), 1) if cleared_times else 0
    
    return {
        "history": history,
        "best_time": stats.get("best_time") or 0,
        "avg_time": round(stats.get("avg_time") or 0, 1),
        "total_clears": stats.get("total_clears") or 0
    }

# =================================================================
# 🤖 [신규] LLM 파인튜닝 전용 데이터셋 영구 저장 & 조회 모듈
# =================================================================
def save_finetune_sample(sample_dict, user_id=1):
    """사용자가 직접 입력한 단어와 암기용 연상 스토리를 파인튜닝 샘플로 저장"""
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    
    sample_id = sample_dict.get("id") or f"ft_{int(time.time() * 1000)}"
    topic = sample_dict.get("topic", "단어 훈련")
    words = sample_dict.get("words", [])
    word_count = int(sample_dict.get("word_count") or len(words))
    user_story = (sample_dict.get("user_story") or "").strip()
    alpaca = sample_dict.get("alpaca", {})
    sharegpt = sample_dict.get("sharegpt", {})
    created_at = sample_dict.get("created_at")

    cur.execute("""
        INSERT OR REPLACE INTO finetune_dataset (
            id, user_id, topic, word_count, words_json, user_story, alpaca_json, sharegpt_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    """, (
        sample_id,
        user_id,
        topic,
        word_count,
        json.dumps(words, ensure_ascii=False),
        user_story,
        json.dumps(alpaca, ensure_ascii=False),
        json.dumps(sharegpt, ensure_ascii=False),
        created_at
    ))
    conn.commit()
    conn.close()

    # 🌐 구글 시트 비동기 동기화
    async_send_to_google_sheet({
        "type": "log_finetune",
        "sample_id": sample_id,
        "topic": topic,
        "word_count": word_count,
        "user_story": user_story
    })

    return sample_id

def get_finetune_dataset(user_id=1):
    """저장된 파인튜닝 데이터셋 전체 조회"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT * FROM finetune_dataset
        WHERE user_id = ? OR user_id = 1
        ORDER BY created_at DESC
    """, (user_id,))
    rows = cur.fetchall()
    conn.close()

    samples = []
    for r in rows:
        item = dict(r)
        try:
            item["words"] = json.loads(item.get("words_json") or "[]")
        except Exception:
            item["words"] = []
        try:
            item["alpaca"] = json.loads(item.get("alpaca_json") or "{}")
        except Exception:
            item["alpaca"] = {}
        try:
            item["sharegpt"] = json.loads(item.get("sharegpt_json") or "{}")
        except Exception:
            item["sharegpt"] = {}
        samples.append(item)

    return {
        "samples": samples,
        "total_count": len(samples)
    }

def delete_finetune_sample(sample_id, user_id=1):
    """특정 파인튜닝 샘플 삭제"""
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("DELETE FROM finetune_dataset WHERE id = ? AND (user_id = ? OR user_id = 1)", (sample_id, user_id))
    conn.commit()
    conn.close()
    return True

def clear_finetune_dataset(user_id=1):
    """파인튜닝 데이터셋 전체 초기화"""
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("DELETE FROM finetune_dataset WHERE user_id = ? OR user_id = 1", (user_id,))
    conn.commit()
    conn.close()
    return True



# =================================================================
# 📚 [신규] 100+ 주제별 1,000단어 대용량 단어 은행 (Word Bank) API
# =================================================================
def extract_chosung(text):
    """한글 단어 초성 분리"""
    chosungs = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"]
    res = []
    for ch in text or "":
        code = ord(ch) - 44032
        if 0 <= code <= 11171:
            res.append(chosungs[code // 588])
        else:
            res.append(ch)
    return "".join(res)

def insert_words_to_bank(topic, words_list, sub_category=None):
    """주제별 단어 목록을 SQLite word_bank 테이블에 영구 저장 (중복 단어 자동 무시)"""
    if not words_list or not topic:
        return 0, 0
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    inserted = 0
    for w in words_list:
        word = (w.get("word") or "").strip()
        if not word:
            continue
        definition = (w.get("definition") or "").strip()
        importance = (w.get("importance_reason") or "").strip()
        visual = (w.get("visual_anchor") or "").strip()
        chosung = w.get("chosung") or extract_chosung(word)
        sub_cat = w.get("category") or sub_category or topic
        difficulty = w.get("difficulty") or "normal"
        try:
            cur.execute("""
                INSERT OR IGNORE INTO word_bank 
                (topic, sub_category, word, definition, importance_reason, visual_anchor, chosung, difficulty)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (topic, sub_cat, word, definition, importance, visual, chosung, difficulty))
            if cur.rowcount > 0:
                inserted += 1
        except Exception:
            pass
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM word_bank WHERE topic = ?", (topic,))
    total_for_topic = cur.fetchone()[0]
    conn.close()
    return inserted, total_for_topic

def get_random_words_from_bank(topic, count=10, exclude_words=None):
    """주제별 단어 은행에서 무작위 n개 단어 즉시 인출 (0초 인출 & 중복 배제)"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    exclude_set = set(exclude_words or [])
    clean_topic = (topic or "").strip()
    
    # 1. 완벽 일치 토픽 검색
    query = "SELECT word, definition, importance_reason, visual_anchor, chosung, sub_category, difficulty FROM word_bank WHERE topic = ?"
    params = [clean_topic]
    if exclude_set:
        placeholders = ','.join('?' for _ in exclude_set)
        query += f" AND word NOT IN ({placeholders})"
        params.extend(list(exclude_set))
    query += " ORDER BY RANDOM() LIMIT ?"
    params.append(count)
    
    cur.execute(query, params)
    rows = [dict(r) for r in cur.fetchall()]
    
    # 2. 결과가 부족하면 토픽 부분 검색(LIKE)으로 유연하게 보충
    if len(rows) < count:
        remaining = count - len(rows)
        existing_words = exclude_set.union({r["word"] for r in rows})
        sub_query = "SELECT word, definition, importance_reason, visual_anchor, chosung, sub_category, difficulty FROM word_bank WHERE topic LIKE ?"
        sub_params = [f"%{clean_topic}%"]
        if existing_words:
            placeholders = ','.join('?' for _ in existing_words)
            sub_query += f" AND word NOT IN ({placeholders})"
            sub_params.extend(list(existing_words))
        sub_query += " ORDER BY RANDOM() LIMIT ?"
        sub_params.append(remaining)
        cur.execute(sub_query, sub_params)
        extra = [dict(r) for r in cur.fetchall()]
        rows.extend(extra)
        
    conn.close()
    return rows

def get_word_bank_stats():
    """모든 주제별 저장된 단어 수량 및 총 통계 반환"""
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("SELECT topic, COUNT(*) FROM word_bank GROUP BY topic")
    stats = {row[0]: row[1] for row in cur.fetchall()}
    cur.execute("SELECT COUNT(*) FROM word_bank")
    total_words = cur.fetchone()[0]
    conn.close()
    return {
        "topic_counts": stats,
        "total_words": total_words
    }

def get_topic_word_count(topic):
    """특정 주제의 현재 단어 수 반환"""
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM word_bank WHERE topic = ?", (topic,))
    row = cur.fetchone()
    count = row[0] if row else 0
    conn.close()
    return count

def get_all_words_for_topic(topic):
    """특정 주제의 이미 저장된 단어 텍스트 목록 전체 조회 (마이닝 중복 회피용)"""
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("SELECT word FROM word_bank WHERE topic = ?", (topic,))
    words = [row[0] for row in cur.fetchall()]
    conn.close()
    return words

def clear_topic_words(topic):
    """특정 주제의 단어 은행 초기화"""
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("DELETE FROM word_bank WHERE topic = ?", (topic,))
    deleted = cur.rowcount
    conn.commit()
    conn.close()
    return deleted


# =================================================================
# 🧠 [NeuroRL v2] 강화학습 궤적(Trajectory), Bandit 정책, DPO 데이터셋 레이어
# =================================================================
import rl_engine as rle

def init_rl_tables():
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()

    # 1. 단어별 강화학습 인출 궤적 테이블 (밀리초 반응속도 + 연상기법 + 보상)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS rl_trajectories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        topic_category TEXT DEFAULT 'ALL',
        word TEXT NOT NULL,
        definition TEXT,
        visual_anchor TEXT,
        action_type TEXT NOT NULL,
        user_mnemonic_text TEXT NOT NULL,
        is_user_modified INTEGER DEFAULT 0,
        encode_duration_ms REAL NOT NULL,
        ttfk_ms REAL NOT NULL,
        typing_duration_ms REAL NOT NULL,
        is_correct INTEGER NOT NULL,
        user_answer TEXT,
        hint_level INTEGER DEFAULT 0,
        reward_score REAL NOT NULL,
        speed_score REAL DEFAULT 0.0,
        encode_score REAL DEFAULT 0.0,
        grade TEXT DEFAULT 'NEUTRAL',
        retention_stage INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_rl_traj_topic ON rl_trajectories(topic)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_rl_traj_word ON rl_trajectories(word)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_rl_traj_grade ON rl_trajectories(grade)")

    # 2. Contextual Bandit 정책 가중치 테이블 (주제 카테고리 × 5대 연상기법)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS bandit_policy_state (
        topic_category TEXT NOT NULL,
        action_type TEXT NOT NULL,
        alpha_success REAL DEFAULT 1.0,
        beta_failure REAL DEFAULT 1.0,
        avg_ttfk_ms REAL DEFAULT 1800.0,
        mean_reward REAL DEFAULT 0.0,
        sample_count INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (topic_category, action_type)
    )
    """)

    # 3. DPO (Direct Preference Optimization) 선호도 쌍 테이블 (Chosen vs Rejected)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS dpo_preference_pairs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic TEXT NOT NULL,
        word TEXT NOT NULL,
        definition TEXT,
        prompt TEXT NOT NULL,
        chosen_action TEXT NOT NULL,
        chosen_mnemonic TEXT NOT NULL,
        chosen_ttfk_ms REAL NOT NULL,
        chosen_reward REAL NOT NULL,
        rejected_action TEXT NOT NULL,
        rejected_mnemonic TEXT NOT NULL,
        rejected_ttfk_ms REAL NOT NULL,
        rejected_reward REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    conn.close()

init_rl_tables()


def get_prioritized_words_from_bank(topic: str, count: int = 10, exclude_words=None):
    """
    강화학습 우선순위 경험 재생 (Prioritized Experience Replay):
    1) 과거 이 주제에서 반응속도가 느렸거나(TTFK > 1800ms) 틀렸던 취약 단어 최대 30% 우선 인출
    2) 나머지 70%는 단어 은행(word_bank)에서 미학습 신선 단어로 랜덤 인출
    """
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    exclude_set = set(exclude_words or [])
    clean_topic = (topic or "").strip()
    weak_quota = max(1, int(count * 0.3))
    selected = []

    # 1. 취약 단어(저보상/느린 반응속도) 우선 탐색
    cur.execute("""
        SELECT wb.word, wb.definition, wb.importance_reason, wb.visual_anchor, wb.chosung, wb.sub_category, wb.difficulty,
                MIN(rt.reward_score) as min_reward, MAX(rt.ttfk_ms) as max_ttfk
        FROM rl_trajectories rt
        JOIN word_bank wb ON wb.word = rt.word AND wb.topic = rt.topic
        WHERE rt.topic = ? AND (rt.reward_score < 0.45 OR rt.ttfk_ms > 1800)
        GROUP BY wb.word
        ORDER BY min_reward ASC, max_ttfk DESC
        LIMIT ?
    """, (clean_topic, weak_quota * 2))

    for r in cur.fetchall():
        d = dict(r)
        if d["word"] not in exclude_set and len(selected) < weak_quota:
            d["rl_tag"] = f"🔥 취약복습 (과거 {int(d['max_ttfk'])}ms)"
            selected.append(d)
            exclude_set.add(d["word"])

    conn.close()

    # 2. 나머지 수량을 단어 은행에서 무작위 인출
    remaining = count - len(selected)
    if remaining > 0:
        fresh_words = get_random_words_from_bank(clean_topic, count=remaining, exclude_words=list(exclude_set))
        for fw in fresh_words:
            fw["rl_tag"] = "✨ 신규/표준 인출"
            selected.append(fw)

    # 순서 셔플 후 각 단어별 5대 연상기법 초안 부착
    import random
    random.shuffle(selected)
    for item in selected:
        item["mnemonic_candidates"] = rle.generate_rule_based_mnemonic_candidates(
            item["word"], item.get("definition", ""), item.get("visual_anchor", "")
        )
    return selected


def get_bandit_policy(topic_category: str = "ALL"):
    """특정 카테고리(또는 전체 ALL)의 Bandit 정책 상태 조회 및 추천 기법 반환"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("SELECT * FROM bandit_policy_state WHERE topic_category = ?", (topic_category,))
    rows = [dict(r) for r in cur.fetchall()]
    if not rows and topic_category != "ALL":
        cur.execute("SELECT * FROM bandit_policy_state WHERE topic_category = 'ALL'")
        rows = [dict(r) for r in cur.fetchall()]

    conn.close()
    return rle.select_bandit_action(rows)


def record_rl_session_trajectories(session_id: str, topic: str, topic_category: str, items: list):
    """
    1:1 반응속도 프로브 결과를 받아:
    1) 단어별 RL Reward 계산 및 rl_trajectories 저장
    2) Contextual Bandit (alpha, beta, avg_ttfk, mean_reward) 실시간 업데이트
    3) 고보상(Chosen)과 저보상(Rejected) 샘플 간 DPO 선호도 쌍 자동 생성
    """
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    processed_results = []
    chosen_pool = []
    rejected_pool = []

    for item in items:
        word = (item.get("word") or "").strip()
        if not word:
            continue
        definition = (item.get("definition") or "").strip()
        visual_anchor = (item.get("visual_anchor") or "").strip()
        action_type = item.get("action_type") or "ACT_COLLISION"
        if action_type not in rle.MNEMONIC_ACTIONS:
            action_type = "ACT_COLLISION"

        user_mnemonic = (item.get("user_mnemonic_text") or visual_anchor or word).strip()
        is_modified = 1 if item.get("is_user_modified") else 0
        encode_ms = float(item.get("encode_duration_ms") or 3000.0)
        ttfk_ms = float(item.get("ttfk_ms") or 2500.0)
        typing_ms = float(item.get("typing_duration_ms") or 800.0)
        is_correct = bool(item.get("is_correct"))
        user_answer = (item.get("user_answer") or "").strip()
        hint_level = int(item.get("hint_level") or 0)

        # 보상 계산
        rw = rle.compute_rl_reward(
            is_correct=is_correct,
            ttfk_ms=ttfk_ms,
            encode_duration_ms=encode_ms,
            hint_level=hint_level
        )
        reward_score = rw["reward"]
        grade = rw["grade"]

        cur.execute("""
            INSERT INTO rl_trajectories (
                session_id, topic, topic_category, word, definition, visual_anchor,
                action_type, user_mnemonic_text, is_user_modified,
                encode_duration_ms, ttfk_ms, typing_duration_ms,
                is_correct, user_answer, hint_level,
                reward_score, speed_score, encode_score, grade
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            session_id, topic, topic_category or "ALL", word, definition, visual_anchor,
            action_type, user_mnemonic, is_modified,
            encode_ms, ttfk_ms, typing_ms,
            1 if is_correct else 0, user_answer, hint_level,
            reward_score, rw["speed_score"], rw["encode_score"], grade
        ))

        traj_record = {
            "word": word,
            "definition": definition,
            "action_type": action_type,
            "action_name": rle.MNEMONIC_ACTIONS[action_type]["name"],
            "user_mnemonic_text": user_mnemonic,
            "encode_duration_ms": round(encode_ms, 1),
            "ttfk_ms": round(ttfk_ms, 1),
            "typing_duration_ms": round(typing_ms, 1),
            "is_correct": is_correct,
            "user_answer": user_answer,
            "hint_level": hint_level,
            "reward_score": reward_score,
            "speed_score": rw["speed_score"],
            "grade": grade
        }
        processed_results.append(traj_record)

        if grade == "CHOSEN":
            chosen_pool.append(traj_record)
        elif grade in ("REJECTED", "LOW_REWARD"):
            rejected_pool.append(traj_record)

        # Bandit Policy 업데이트 ('ALL' 및 해당 카테고리 모두 반영)
        for cat_key in set(["ALL", topic_category or "ALL"]):
            cur.execute("""
                SELECT alpha_success, beta_failure, avg_ttfk_ms, mean_reward, sample_count
                FROM bandit_policy_state
                WHERE topic_category = ? AND action_type = ?
            """, (cat_key, action_type))
            row = cur.fetchone()
            if row:
                alpha = float(row["alpha_success"])
                beta = float(row["beta_failure"])
                old_ttfk = float(row["avg_ttfk_ms"])
                old_rw = float(row["mean_reward"])
                cnt = int(row["sample_count"])
            else:
                alpha, beta, old_ttfk, old_rw, cnt = 1.0, 1.0, 1800.0, 0.0, 0

            new_cnt = cnt + 1
            if reward_score >= 0.45:
                alpha += reward_score
            else:
                beta += abs(reward_score) if reward_score < 0 else 0.5

            # 지수 이동 평균(EMA) + 누적 평균 결합
            new_ttfk = ((old_ttfk * cnt) + ttfk_ms) / new_cnt if is_correct else old_ttfk
            new_rw = ((old_rw * cnt) + reward_score) / new_cnt

            cur.execute("""
                INSERT INTO bandit_policy_state (
                    topic_category, action_type, alpha_success, beta_failure, avg_ttfk_ms, mean_reward, sample_count, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(topic_category, action_type) DO UPDATE SET
                    alpha_success = excluded.alpha_success,
                    beta_failure = excluded.beta_failure,
                    avg_ttfk_ms = excluded.avg_ttfk_ms,
                    mean_reward = excluded.mean_reward,
                    sample_count = excluded.sample_count,
                    updated_at = CURRENT_TIMESTAMP
            """, (cat_key, action_type, round(alpha, 4), round(beta, 4), round(new_ttfk, 1), round(new_rw, 4), new_cnt))

    # DPO 선호도 쌍(Chosen vs Rejected) 자동 구축
    dpo_created = 0
    # 1) 동일 단어에 대해 과거 고보상/저보상 이력이 있으면 최우선 매칭
    for ch in chosen_pool:
        for rj in rejected_pool:
            prompt_str = f"[주제: {topic}] 단어 '{ch['word']}'({ch['definition']})를 뇌에 즉각 각인시키는 고효율 연상 문장을 작성하세요."
            cur.execute("""
                INSERT INTO dpo_preference_pairs (
                    topic, word, definition, prompt,
                    chosen_action, chosen_mnemonic, chosen_ttfk_ms, chosen_reward,
                    rejected_action, rejected_mnemonic, rejected_ttfk_ms, rejected_reward
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                topic, ch["word"], ch["definition"], prompt_str,
                ch["action_type"], ch["user_mnemonic_text"], ch["ttfk_ms"], ch["reward_score"],
                rj["action_type"], f"[비효율 연상 - {rj['word']}] {rj['user_mnemonic_text']}", rj["ttfk_ms"], rj["reward_score"]
            ))
            dpo_created += 1

    conn.commit()
    conn.close()

    # 업데이트된 최신 Bandit 정책 조회
    updated_policy = get_bandit_policy(topic_category or "ALL")
    return {
        "session_id": session_id,
        "topic": topic,
        "trajectories": processed_results,
        "dpo_pairs_created": dpo_created,
        "updated_bandit_policy": updated_policy
    }


def get_rl_dashboard_stats(topic_category: str = "ALL"):
    """강화학습 종합 텔레메트리 및 대시보드 통계 반환"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT
            COUNT(*) as total_trajectories,
            AVG(CASE WHEN is_correct = 1 THEN ttfk_ms ELSE NULL END) as avg_ttfk_ms,
            MIN(CASE WHEN is_correct = 1 THEN ttfk_ms ELSE NULL END) as best_ttfk_ms,
            AVG(encode_duration_ms) as avg_encode_ms,
            AVG(reward_score) as mean_reward,
            SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_count,
            SUM(CASE WHEN grade = 'CHOSEN' THEN 1 ELSE 0 END) as chosen_count,
            SUM(CASE WHEN grade = 'REJECTED' THEN 1 ELSE 0 END) as rejected_count
        FROM rl_trajectories
    """)
    agg = dict(cur.fetchone() or {})
    total_traj = int(agg.get("total_trajectories") or 0)
    correct_cnt = int(agg.get("correct_count") or 0)
    accuracy = round((correct_cnt / total_traj) * 100, 1) if total_traj > 0 else 0.0

    # 최근 40개 궤적
    cur.execute("""
        SELECT id, session_id, topic, word, definition, action_type, user_mnemonic_text,
               encode_duration_ms, ttfk_ms, typing_duration_ms, is_correct, hint_level,
               reward_score, grade, created_at
        FROM rl_trajectories
        ORDER BY id DESC LIMIT 40
    """)
    recent_trajectories = []
    for r in cur.fetchall():
        d = dict(r)
        act_code = d.get("action_type", "ACT_COLLISION")
        d["action_name"] = rle.MNEMONIC_ACTIONS.get(act_code, {}).get("short", act_code)
        recent_trajectories.append(d)

    # DPO 쌍 개수 및 최근 목록
    cur.execute("SELECT COUNT(*) FROM dpo_preference_pairs")
    dpo_count = cur.fetchone()[0]

    cur.execute("SELECT * FROM dpo_preference_pairs ORDER BY id DESC LIMIT 20")
    dpo_pairs = [dict(r) for r in cur.fetchall()]

    # 침팬지 공간기억 요약
    cur.execute("""
        SELECT COUNT(*) as total_games,
               MAX(CASE WHEN is_success = 1 THEN target_count ELSE 0 END) as max_span,
               AVG(CASE WHEN is_success = 1 THEN reaction_time_ms ELSE NULL END) as avg_rt_ms
        FROM spatial_memory_sessions
    """)
    spatial_summary = dict(cur.fetchone() or {})

    conn.close()

    bandit_info = get_bandit_policy(topic_category)
    wb_stats = get_word_bank_stats()

    return {
        "total_trajectories": total_traj,
        "accuracy": accuracy,
        "avg_ttfk_ms": round(float(agg.get("avg_ttfk_ms") or 0.0), 1),
        "best_ttfk_ms": round(float(agg.get("best_ttfk_ms") or 0.0), 1),
        "avg_encode_ms": round(float(agg.get("avg_encode_ms") or 0.0), 1),
        "mean_reward": round(float(agg.get("mean_reward") or 0.0), 3),
        "chosen_count": int(agg.get("chosen_count") or 0),
        "rejected_count": int(agg.get("rejected_count") or 0),
        "dpo_pairs_count": dpo_count,
        "bandit_policy": bandit_info,
        "recent_trajectories": recent_trajectories,
        "dpo_pairs": dpo_pairs,
        "spatial_summary": {
            "total_games": int(spatial_summary.get("total_games") or 0),
            "max_span": int(spatial_summary.get("max_span") or 5),
            "avg_rt_ms": round(float(spatial_summary.get("avg_rt_ms") or 0.0), 1)
        },
        "word_bank_total": wb_stats["total_words"]
    }
