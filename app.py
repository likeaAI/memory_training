import os
import sys
import json
import base64
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import urllib.request

# Windows 콘솔 UTF-8 출력 강제 (이모지 충돌 방지)
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

# 기능별 모듈 Import
import database as db
import ai_service as ai
import pdf_service as pdf_svc

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR) # IDE에서 Run 버튼 클릭 시 작업 디렉토리 강제 고정
STATIC_DIR = os.path.join(BASE_DIR, "static")
PORT = int(os.environ.get("PORT", 10000))

# =================================================================
# 🌐 초경량 멀티스레드 HTTP 핸들러 및 라우터
# =================================================================
class MemoryAppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        try:
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
        except (ConnectionAbortedError, BrokenPipeError):
            pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        data = json.loads(body) if body else {}

        # 1. 회원가입 API
        if path == "/api/register":
            username = data.get("username", "").strip()
            password = data.get("password", "").strip()
            display_name = data.get("display_name", "").strip()
            if not username or not password:
                return self._send_json({"error": "아이디와 비밀번호를 모두 입력해주세요."}, status=400)
            res = db.register_user(username, password, display_name)
            return self._send_json(res, status=200 if res.get("success") else 400)

        # 2. 로그인 API
        elif path == "/api/login":
            username = data.get("username", "").strip()
            password = data.get("password", "").strip()
            res = db.login_user(username, password)
            return self._send_json(res, status=200 if res.get("success") else 401)

        # 3. PDF 기반 단어 추출 API
        elif path == "/api/generate-from-pdf":
            pdf_base64 = data.get("pdf_base64", "")
            start_page = int(data.get("start_page", 1))
            end_page = int(data.get("end_page", 0)) or None
            word_count = int(data.get("count", 5))
            pdf_name = data.get("pdf_name", "교재_PDF")
            exclude_words = data.get("exclude_words", [])

            if not pdf_base64:
                return self._send_json({"error": "PDF 파일 데이터가 없습니다."}, status=400)
            try:
                pdf_bytes = base64.b64decode(pdf_base64.split(",")[-1])
                extracted = pdf_svc.extract_text_from_pdf_bytes(pdf_bytes, start_page, end_page)
                if not extracted.strip():
                    return self._send_json({"error": "선택한 페이지에서 텍스트를 추출할 수 없습니다."}, status=400)
                result = ai.generate_words_from_pdf(extracted, pdf_name, word_count, exclude_words=exclude_words)
                return self._send_json(result)
            except Exception as e:
                return self._send_json({"error": f"PDF 단어 생성 실패: {e}"}, status=500)

        # 4. 단어 생성 API (단일 / 다중 믹스 / 텍스트)
        elif path == "/api/generate":
            mode = data.get("mode", "topic")
            user_input = data.get("input", "").strip() or "전기기사 전자기학"
            word_count = int(data.get("count", 10 if mode == "multi" else 5))
            exclude_words = data.get("exclude_words", [])
            difficulty = data.get("difficulty", "normal")
            provider = data.get("provider", "gemini")
            model = data.get("model")
            try:
                result = ai.generate_words(mode, user_input, word_count, exclude_words=exclude_words, difficulty=difficulty, provider=provider, model=model)
                return self._send_json(result)
            except Exception as e:
                return self._send_json({"error": f"단어 생성 실패: {e}"}, status=500)

        # 5. 답안 채점 API
        elif path == "/api/verify":
            quiz_words = data.get("quiz_words", [])
            user_inputs = data.get("user_inputs", [])
            difficulty = data.get("difficulty", "normal")
            result = ai.verify_answers(quiz_words, user_inputs, difficulty)
            return self._send_json(result)

        # 6. AI 연상 스토리 코칭 분석 API
        elif path == "/api/evaluate-story":
            result = ai.evaluate_story(
                user_story=data.get("user_story", "").strip(),
                quiz_words=data.get("quiz_words", []),
                results=data.get("results", []),
                memorize_sec=data.get("memorize_sec", 0),
                test_sec=data.get("test_sec", 0),
                accuracy=data.get("accuracy", 0)
            )
            return self._send_json(result)

        # 7. SQLite 단어 세션 자동 저장 API
        elif path == "/api/auto-save":
            user_id = int(data.get("user_id", 1))
            try:
                session_id = db.auto_save_session(data, user_id=user_id)
                return self._send_json({"success": True, "session_id": session_id})
            except Exception as e:
                return self._send_json({"error": f"DB 자동저장 실패: {e}"}, status=500)

        # [신규] 7-2. 공간 순간 기억력 훈련 자동 저장 API
        elif path == "/api/save-spatial":
            user_id = int(data.get("user_id", 1))
            try:
                session_id = db.auto_save_spatial_session(
                    user_id=user_id,
                    grid_size=int(data.get("grid_size", 4)),
                    target_count=int(data.get("target_count", 5)),
                    exposure_sec=float(data.get("exposure_sec", 3.0)),
                    reaction_time_ms=float(data.get("reaction_time_ms", 0)),
                    is_success=bool(data.get("is_success", False)),
                    cleared_count=int(data.get("cleared_count", 0))
                )
                return self._send_json({"success": True, "session_id": session_id})
            except Exception as e:
                return self._send_json({"error": f"공간기억 저장 실패: {e}"}, status=500)

        # 8. 두뇌 스도쿠 훈련 자동 저장 API
        elif path == "/api/save-sudoku":
            user_id = int(data.get("user_id", 1))
            try:
                session_id = db.auto_save_sudoku_session(
                    user_id=user_id,
                    difficulty=data.get("difficulty", "normal"),
                    clear_time_sec=int(data.get("clear_time_sec", 0)),
                    hints_used=int(data.get("hints_used", 0)),
                    is_cleared=int(data.get("is_cleared", 1))
                )
                return self._send_json({"success": True, "session_id": session_id})
            except Exception as e:
                return self._send_json({"error": f"스도쿠 저장 실패: {e}"}, status=500)

        # 9. 🗑️ 단어장 영구 삭제 API
        elif path == "/api/delete-training":
            title = data.get("title", "").strip()
            user_id = int(data.get("user_id", 1))
            if not title:
                return self._send_json({"error": "삭제할 단어장 제목이 없습니다."}, status=400)
            db.delete_training(title, user_id=user_id)
            return self._send_json({"success": True, "deleted_title": title})

        # 10. 🧹 전체 훈련 로그 초기화 API
        elif path == "/api/clear-logs":
            user_id = int(data.get("user_id", 1))
            db.clear_all_logs(user_id=user_id)
            return self._send_json({"success": True, "message": "모든 훈련 로그가 초기화되었습니다."})

        # 11. 🔗 구글 시트 웹훅 연결 핑(Ping) 테스트 API
        elif path == "/api/test-sheet-webhook":
            test_url = data.get("url", "").strip() or db.get_google_sheet_url()
            if not test_url:
                return self._send_json({"success": False, "error": "웹훅 URL이 입력되지 않았습니다."}, status=400)
            import time
            start_t = time.time()
            try:
                req = urllib.request.Request(
                    test_url,
                    data=json.dumps({"type": "ping"}).encode("utf-8"),
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=8) as res:
                    latency = round((time.time() - start_t) * 1000)
                    resp_json = json.loads(res.read().decode("utf-8"))
                    return self._send_json({
                        "success": True,
                        "latency_ms": latency,
                        "server_response": resp_json
                    })
            except Exception as e:
                return self._send_json({
                    "success": False,
                    "error": f"웹훅 연결 실패: {e}"
                }, status=500)

        # 12. ⚙️ 구글 시트 URL 저장/업데이트 API
        elif path == "/api/set-sheet-url":
            new_url = data.get("url", "").strip()
            env_path = os.path.join(BASE_DIR, ".env")
            lines = []
            if os.path.exists(env_path):
                with open(env_path, "r", encoding="utf-8") as f:
                    lines = [l for l in f if not l.startswith("GOOGLE_SHEET_URL=")]
            lines.append(f"GOOGLE_SHEET_URL={new_url}\n")
            with open(env_path, "w", encoding="utf-8") as f:
                f.writelines(lines)
            os.environ["GOOGLE_SHEET_URL"] = new_url
            return self._send_json({"success": True, "url": new_url})

        # 8. 수동 세트 저장 API
        elif path == "/api/save":
            user_id = int(data.get("user_id", 1))
            title = data.get("title", "").strip()
            session_data = data.get("session_data", {})
            if not title:
                return self._send_json({"error": "제목이 비어 있습니다."}, status=400)
            try:
                training_id = db.save_or_update_training(
                    title=title,
                    quiz_data=session_data.get("quiz_data", []),
                    user_story=session_data.get("user_story", ""),
                    user_id=user_id
                )
                return self._send_json({"success": True, "training_id": training_id})
            except Exception as e:
                return self._send_json({"error": f"저장 실패: {e}"}, status=500)

        # 9. 🤖 [신규] LLM 파인튜닝 데이터셋 샘플 저장 API
        elif path == "/api/save-finetune-sample":
            user_id = int(data.get("user_id", 1))
            sample = data.get("sample", {})
            if not sample or not sample.get("user_story"):
                return self._send_json({"error": "사용자 작성 연상 스토리가 비어 있습니다."}, status=400)
            try:
                sample_id = db.save_finetune_sample(sample, user_id=user_id)
                return self._send_json({"success": True, "sample_id": sample_id})
            except Exception as e:
                return self._send_json({"error": f"파인튜닝 샘플 저장 실패: {e}"}, status=500)

        # 10. 파인튜닝 샘플 삭제 API
        elif path == "/api/delete-finetune-sample":
            user_id = int(data.get("user_id", 1))
            sample_id = data.get("sample_id", "").strip()
            if not sample_id:
                return self._send_json({"error": "sample_id가 필요합니다."}, status=400)
            db.delete_finetune_sample(sample_id, user_id=user_id)
            return self._send_json({"success": True})

        # 11. 파인튜닝 데이터셋 전체 초기화 API
        elif path == "/api/clear-finetune-dataset":
            user_id = int(data.get("user_id", 1))
            db.clear_finetune_dataset(user_id=user_id)
            return self._send_json({"success": True})

        # 12. 🦙 Ollama 로컬 모델 생성 API (원서번역 Gemma4 12B 최적화 프리셋)
        elif path == "/api/ollama-generate":
            ollama_url = (data.get("url") or "http://localhost:11434").rstrip("/")
            model = data.get("model", "batiai/gemma4-12b:iq4")
            prompt = data.get("prompt", "")
            system = data.get("system", "")
            temperature = float(data.get("temperature", 0.05))
            format_type = data.get("format", "json")

            target_url = f"{ollama_url}/api/generate"
            payload = {
                "model": model,
                "prompt": prompt,
                "stream": False,
                "think": False,
                "keep_alive": -1,
                "options": {
                    "temperature": temperature,
                    "num_ctx": 4096,
                    "num_predict": 2048,
                    "repeat_penalty": 1.15,
                    "num_gpu": 45
                }
            }
            if system:
                payload["system"] = system
            if format_type:
                payload["format"] = format_type

            try:
                req = urllib.request.Request(
                    target_url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=120) as res:
                    resp_json = json.loads(res.read().decode("utf-8"))
                    return self._send_json({"success": True, "response": resp_json.get("response", "")})
            except Exception as e:
                return self._send_json({"success": False, "error": f"Ollama 생성 오류: {e}"}, status=500)

        # 13. ⚙️ AI 공급자 및 모델 설정 저장 API (서버 메모리 동기화)
        elif path == "/api/set-ai-config":
            provider = data.get("provider", "gemini")
            gemini_model = data.get("gemini_model", "gemini-2.5-flash")
            gemini_key = data.get("gemini_key", "").strip()
            ollama_url = data.get("ollama_url", "http://localhost:11434").strip()
            ollama_model = data.get("ollama_model", "batiai/gemma4-12b:iq4").strip()

            ai.OLLAMA_BASE_URL = ollama_url
            ai.OLLAMA_MODEL = ollama_model
            ai.DEFAULT_GEMINI_MODEL = gemini_model
            if gemini_key:
                ai.GEMINI_API_KEY = gemini_key

            return self._send_json({
                "success": True,
                "provider": provider,
                "gemini_model": gemini_model,
                "ollama_model": ollama_model,
                "ollama_url": ollama_url
            })


        return self._send_json({"error": "Not Found"}, status=404)

    def do_GET(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        query = parse_qs(parsed_url.query)
        user_id = int(query.get("user_id", [1])[0])


        # 14. 🦙 Ollama 로컬 모델 태그 목록 조회 API (CORS 방지 프록시)
        if path == "/api/ollama-tags":
            ollama_url = query.get("url", ["http://localhost:11434"])[0].rstrip("/")
            try:
                tags_url = f"{ollama_url}/api/tags"
                req = urllib.request.Request(tags_url, headers={"User-Agent": "BrainLock-Web/1.0"})
                with urllib.request.urlopen(req, timeout=4) as res:
                    data = json.loads(res.read().decode("utf-8"))
                    return self._send_json({"success": True, "models": data.get("models", [])})
            except Exception as e:
                return self._send_json({"success": False, "error": f"Ollama 연결 실패: {e}", "models": []})

        # 🤖 [신규] LLM 파인튜닝 데이터셋 조회 API
        elif path == "/api/finetune-dataset":
            data = db.get_finetune_dataset(user_id=user_id)
            return self._send_json(data)

        # 공간 순간 기억력 대시보드 API
        if path == "/api/spatial-dashboard":
            data = db.get_spatial_dashboard(user_id=user_id)
            return self._send_json(data)

        # [신규] 스도쿠 대시보드 API
        if path == "/api/sudoku-dashboard":
            data = db.get_sudoku_dashboard(user_id=user_id)
            return self._send_json(data)

        # SQLite 대시보드 및 전체 훈련 기록 API (사용자별 격리)
        if path in ["/api/dashboard", "/api/saved-list"]:
            data = db.get_dashboard_data(user_id=user_id)
            return self._send_json(data)
        
        # 정적 파일 서빙
        super().do_GET()


# =================================================================
# 🚀 멀티스레드 서버 실행
# =================================================================
def run_server():
    server_address = ('0.0.0.0', PORT)
    httpd = ThreadingHTTPServer(server_address, MemoryAppHandler)
    url = f"http://localhost:{PORT}"
    print("=" * 60)
    print(f"🧠 BrainLock 기억술 웹 앱 (모듈화 & 멀티스레드 가속) 실행 중!")
    print(f"👉 브라우저 주소: {url}")
    print("=" * 60)
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
