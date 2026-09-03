import os
import json
import urllib.request
import urllib.error
from utils import extract_chosung

# .env 파일 또는 시스템 환경변수에서 안전하게 API Key 로드
def get_gemini_api_key():
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key.strip()
    
    # .env 파일 수동 파싱 폴백
    base_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(base_dir, ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("GEMINI_API_KEY="):
                        return line.split("=", 1)[1].strip()
        except Exception:
            pass
    return ""

GEMINI_API_KEY = get_gemini_api_key()
USE_LOCAL_FALLBACK = True
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "mistral"

# =================================================================
# 🌐 AI LLM 통신 기반 레이어 (Gemini REST / Ollama)
# =================================================================

DEFAULT_GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

def call_gemini_rest(prompt: str, model: str = None, temperature: float = 0.9) -> dict:
    """순수 HTTP REST API로 Gemini 호출 (초고속 JSON 응답)"""
    target_model = model or DEFAULT_GEMINI_MODEL
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": temperature
        }
    }
    headers = {"Content-Type": "application/json"}
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
    
    with urllib.request.urlopen(req, timeout=30) as response:
        res_data = json.loads(response.read().decode("utf-8"))
        text_content = res_data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text_content)

def call_ollama(prompt: str, system_instruction: str = "") -> dict:
    """로컬 Ollama LLM 폴백 호출"""
    url = f"{OLLAMA_BASE_URL}/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "system": system_instruction,
        "format": "json",
        "stream": False
    }
    headers = {"Content-Type": "application/json"}
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
    with urllib.request.urlopen(req, timeout=60) as response:
        res_data = json.loads(response.read().decode("utf-8"))
        return json.loads(res_data["response"])

# =================================================================
# 🎯 비즈니스 AI 기능: 단어 생성 / 채점 / 연상법 코칭
# =================================================================

import random
import time

# =================================================================
# 🎲 주제별 대용량 단어 풀 캐시 (무작위 셔플링 & 중복 방지)
# =================================================================
WORD_POOL_CACHE = {}

def get_or_create_word_pool(mode: str, user_input: str, difficulty: str = "normal") -> list:
    """주제에 대한 25~30개의 방대한 단어 풀을 생성하거나 캐시에서 반환"""
    cache_key = f"{mode}:{difficulty}:{user_input.strip()}"
    
    # 캐시에 10개 이상 남아있으면 그대로 사용
    if cache_key in WORD_POOL_CACHE and len(WORD_POOL_CACHE[cache_key]) >= 10:
        return WORD_POOL_CACHE[cache_key]

    # 엔트로피를 극대화하기 위한 랜덤 서브 도메인 앵커 생성
    random_seed = random.randint(10000, 99999)
    current_time_entropy = int(time.time() * 1000) % 10000

    diff_instruction = ""
    if difficulty == "hard":
        diff_instruction = "\n[난이도 지침: 🔥 어려움 / 고난도 정밀 모드]\n- 기사 2차 실기, 전문직 및 대학원 수준의 변별력 높은 심화 학술 용어와 고난도 메커니즘 위주로 엄선하세요.\n- 누구나 아는 단순 기초 상식 단어는 철저히 배제하세요."
    elif difficulty == "easy":
        diff_instruction = "\n[난이도 지침: 🌱 쉬움 / 입문 웜업 모드]\n- 해당 분야의 가장 직관적이고 친숙한 대표 기초 용어 위주로 구성하세요.\n- 시각 앵커는 일상에서 바로 떠올릴 수 있는 친근한 사물로 연결하세요."
    else:
        diff_instruction = "\n[난이도 지침: ⚡ 보통 / 표준 훈련 모드]\n- 시험 및 실무에서 가장 빈출되는 표준 핵심 전문 용어로 균형 있게 엄선하세요."

    if mode == "multi":
        target_desc = f"""
[역할]: 다학제 융합 지식 엄선관
[주제 목록]: "{user_input}"
[랜덤 시드: {random_seed}-{current_time_entropy}]
{diff_instruction}
위 주제들에서 가장 대표적인 핵심 전문 용어 총 25개를 기초/중급/심화 스펙트럼에서 골고루 다채롭게 엄선하세요.
절대로 뻔하거나 상위 5개에 국한되지 말고, 서로 다른 세부 영역에서 다채롭게 추출하세요.
"""
    elif mode == "topic":
        target_desc = f"""
[역할]: '{user_input}' 분야 전공 교수
[랜덤 시드: {random_seed}-{current_time_entropy}]
{diff_instruction}
주제 '{user_input}'에 관련된 핵심 전문 용어 총 25개를 다양하게 엄선하세요.
⚠️ [다양성 필수 지침]:
- 매번 뻔한 1~2개 대표 단어만 뽑지 말고,
- 고대/중세/근대/현대, 기초 이론부터 심화 학파, 실무 및 핵심 개념까지 **매우 폭넓고 다채로운 25개 단어**를 선정하세요.
- 정의와 출제 포인트는 20자 이내로 명쾌하게 압축하세요.
"""
    else:
        target_desc = f"다음 원문에서 핵심 전공 용어 20개를 추출하세요. [시드: {random_seed}]\n[원문]:\n{user_input}"

    prompt = f"""
{target_desc}

[규칙]
1. `word`: 실제 표준 전문 용어 (중복 없이 다채롭게).
2. `definition`: 핵심만 20자 이내 정의.
3. `importance_reason`: 핵심 출제 포인트 (20자 이내).
4. `visual_anchor`: 이모지 1개 + 연상 사물.
5. `category`: 해당 단어의 세부 분야명.

반드시 아래 순수 JSON 포맷으로만 응답하세요:
{{
  "quiz_data": [
    {{
      "word": "핵심용어",
      "category": "세부분야",
      "definition": "핵심 정의 (20자 이내)",
      "importance_reason": "출제 포인트 (20자 이내)",
      "visual_anchor": "💡 연상 사물"
    }}
  ]
}}
- 20~25개의 다양한 용어 목록
- 한국어로 작성
"""
    try:
        result = call_gemini_rest(prompt, temperature=0.95)
    except Exception as e:
        print(f"Gemini API 풀 생성 오류({e}), 로컬 Ollama 폴백")
        result = call_ollama(prompt, "JSON Format")

    pool = result.get("quiz_data", [])
    for item in pool:
        item["chosung"] = extract_chosung(item["word"])

    # 셔플 후 캐시에 저장
    random.shuffle(pool)
    WORD_POOL_CACHE[cache_key] = pool
    return pool

def generate_words(mode: str, user_input: str, word_count: int = 5, exclude_words: list = None, difficulty: str = "normal") -> dict:
    """단어 풀에서 무작위 셔플링(Random Sampling)하여 신선한 단어 조합 반환 (난이도/정밀도 적용)"""
    cache_key = f"{mode}:{difficulty}:{user_input.strip()}"
    pool = get_or_create_word_pool(mode, user_input, difficulty=difficulty)
    exclude_set = set(exclude_words or [])

    # 1. 이미 학습한 단어 제외
    available_candidates = [item for item in pool if item.get("word") not in exclude_set]

    # 만약 남은 단어가 부족하면 캐시를 비우고 완전히 새로운 단어 풀을 생성
    if len(available_candidates) < word_count:
        WORD_POOL_CACHE.pop(cache_key, None)
        pool = get_or_create_word_pool(mode, user_input, difficulty=difficulty)
        available_candidates = [item for item in pool if item.get("word") not in exclude_set]

    # 2. 🎲 무작위 셔플링 후 추출
    random.shuffle(available_candidates)
    selected_words = available_candidates[:word_count]

    # 사용된 단어는 풀에서 소진 처리하여 다음 요청 시 절대 중복되지 않도록 방지
    remaining = [item for item in pool if item not in selected_words]
    WORD_POOL_CACHE[cache_key] = remaining

    return {
        "source_name": user_input,
        "quiz_data": selected_words
    }

def generate_words_from_pdf(extracted_text: str, pdf_name: str, word_count: int = 5, exclude_words: list = None) -> dict:
    """PDF 교재 텍스트에서 핵심 전공 용어 분류 (맞힌 단어 제외 지원)"""
    truncated_text = extracted_text[:15000]
    exclude_clause = ""
    if exclude_words and len(exclude_words) > 0:
        exclude_clause = f"\n[🚨 절대 제외 단어 (이미 마스터함)]: 다음 단어들은 제외하고 다른 핵심 용어를 뽑으세요: {exclude_words}\n"

    prompt = f"""
당신은 국가기술자격증 및 전공 교재 전문 교수입니다.
아래 제공된 [교재 PDF 텍스트]를 철저히 분석하여, 시험에 출제되거나 반드시 알아야 할 가장 중요한 공식 핵심 전공 용어 {word_count}개를 중요도 순으로 엄선하여 분류하세요.{exclude_clause}

[교재 텍스트]:
{truncated_text}

[필수 규칙]
1. `word`: 실제 교재에 등장하는 정확한 공식 표준 전문 용어.
2. `definition`: 명쾌하고 정확한 1문장 정의.
3. `importance_reason`: 이 단어가 왜 중요한지 / 시험 및 실무 출제 핵심 포인트 설명 (1문장).
4. `visual_anchor`: 연상 보조 사물 (이모지 1개 + 구체적 연상 사물/장면 1개).

반드시 아래 순수 JSON 포맷으로만 응답하세요:
{{
  "source_name": "{pdf_name}",
  "quiz_data": [
    {{
      "word": "공식 표준 전공 용어",
      "definition": "명쾌한 1문장 정의",
      "importance_reason": "출제 포인트 설명",
      "visual_anchor": "이모지 1개 + 연상 사물/장면"
    }}
  ]
}}
- 정확히 {word_count}개 선정
- 한국어로 작성
"""
    try:
        result = call_gemini_rest(prompt)
    except Exception as e:
        print(f"Gemini API 오류({e}), 로컬 Ollama 시도")
        result = call_ollama(prompt, "JSON Format")

    for item in result.get("quiz_data", []):
        item["chosung"] = extract_chosung(item["word"])

    return result

def verify_answers(quiz_words: list, user_inputs: list, difficulty: str = "normal") -> dict:
    """인출 답안 채점 (난이도별 정밀도 반영)"""
    if difficulty == "hard":
        grading_instruction = """당신은 단 1글자의 오타나 오류도 허용하지 않는 엄격한 정밀 시험 채점관입니다.
정답 단어와 100% 완벽히 일치해야만 is_correct: true로 판정하며, 사소한 오타, 철자 탈락, 유사어도 절대 인정하지 말고 is_correct: false 처리하세요."""
    elif difficulty == "easy":
        grading_instruction = """당신은 매우 유연하고 자비로운 시험 채점관입니다.
사소한 오타나 자모 분리, 띄어쓰기 차이, 음절 누락은 적극적으로 정답(is_correct: true)으로 관대하게 인정하세요."""
    else:
        grading_instruction = """당신은 표준 시험 채점관입니다.
핵심 단어가 통하면 가벼운 띄어쓰기나 단순 오타는 유연하게 정답으로 인정하되, 다른 단어로 오인될 수 있는 오타는 오답 처리하세요."""

    prompt = f"""
{grading_instruction}
기억력 훈련자가 나열한 답안 목록과 정답 단어 목록을 대조하여 채점하세요.

- 정답 단어 목록: {quiz_words}
- 사용자 입력 목록: {user_inputs}

반드시 아래 JSON 형식으로 응답하세요:
{{
  "results": [
    {{
      "original": "정답단어",
      "is_correct": true,
      "matched_input": "매칭된 단어 또는 빈 문자열",
      "feedback": "짧고 친절한 판정 사유 (1문장)"
    }}
  ]
}}
results 배열은 정답 목록과 같은 개수({len(quiz_words)}개)와 순서여야 합니다.
"""
    try:
        res = call_gemini_rest(prompt)
        return res
    except Exception:
        results = []
        copied_inputs = [u.strip() for u in user_inputs]
        for orig in quiz_words:
            if orig.strip() in copied_inputs:
                copied_inputs.remove(orig.strip())
                results.append({"original": orig, "is_correct": True, "matched_input": orig, "feedback": "정답입니다!"})
            else:
                results.append({"original": orig, "is_correct": False, "matched_input": "", "feedback": "미인출되었습니다."})
        return {"results": results}

def evaluate_story(user_story: str, quiz_words: list, results: list, memorize_sec: float, test_sec: float, accuracy: float) -> dict:
    """기억술 핵심 헌장 기반 연상 스토리 정밀 코칭 (동일 기술단어 vs 이질 단어 원리)"""
    if not user_story:
        return {
            "technique_score": 0,
            "analysis_summary": "작성된 연상 스토리가 없어 분석할 수 없습니다. 다음에는 단어들을 엮은 스토리를 적어보세요!",
            "weak_points": "연상 스토리 부재",
            "actionable_tip": "단어 2~3개씩 원인-결과로 이어지는 황당한 장면을 1문장으로 적어보세요."
        }

    prompt = f"""
당신은 20년 경력의 세계 기억력 스포츠(기억술) 국가대표 수석 코치입니다.
훈련자가 작성한 [연상 스토리]와 [실제 인출 시험 결과 및 시간]을 아래 [기억술 핵심 평가 헌장]에 따라 정밀 분석하세요.

[🚨 기억술 핵심 평가 헌장]
1. [주제 판별에 따른 스토리 법칙]:
   - A. [서로 다른 이질적 다중 주제일 때]: (예: 피자 + 전자기학 + 변호사)
     -> 서로 다른 분야는 단순한 상호작용 연결만으로도 뇌에 강렬한 각인이 됨. 인과 연결의 선명도를 평가.
   - B. [동일한 기술/전공 주제일 때]: (예: 자계, 전계, 유전율, 변위전류)
     -> ⚠️ **동일 기술 단어는 설명문처럼 나열만 하면 뇌가 간섭을 일으켜 무조건 인출에 실패함**.
     -> **해결 기준 충족 여부 점검**:
        ① [극단적 의인화]: 추상적 개념을 '살아있는 캐릭터/괴물'로 바꿨는가?
        ② [격렬한 동적 액션]: 설명이 아니라 '폭발, 파괴, 삼키기' 등 물리적 동작으로 충돌시켰는가?
        ③ [이질적 매개체 투입]: 기술 용어 사이에 엉뚱하고 친숙한 사물을 닻으로 활용했는가?
        (만약 기술 단어를 설명식으로 나열했다면 이 3가지 해결법을 활용한 모범 스토리 교정안을 제시할 것!)

[훈련 데이터]
- 목표 단어 목록: {quiz_words}
- 연상 스토리: "{user_story}"
- 채점 결과: {results} (정답률: {accuracy}%)
- 소요 시간: [연상 구상: {memorize_sec}초] / [인출: {test_sec}초]

반드시 아래 순수 JSON 포맷으로만 응답하세요:
{{
  "technique_score": 85,
  "analysis_summary": "연상법 적용 종합 평가 2~3문장 (동일기술 나열인지, 이질단어 결합인지 분석 포함)",
  "weak_points": "약했던 연결고리 및 단어 나열의 한계점 (1~2문장)",
  "actionable_tip": "위 해결 기준(의인화/격렬한 액션/이질적 매개체)을 적용한 즉시 실전 적용 팁 1문장"
}}
- 모든 텍스트는 한국어로 작성
"""
    try:
        return call_gemini_rest(prompt)
    except Exception as e:
        return {
            "technique_score": accuracy,
            "analysis_summary": f"암기 시간 {memorize_sec}초 동안 스토리를 구성하여 {accuracy}%의 정답률을 기록했습니다.",
            "weak_points": "동일 분야 기술 단어는 설명식으로 나열하면 쉽게 잊혀집니다.",
            "actionable_tip": "추상적인 전공 용어를 '성격 있는 캐릭터'로 의인화하고 서로 부딪히는 동작을 넣어보세요."
        }
