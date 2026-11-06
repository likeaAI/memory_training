# -*- coding: utf-8 -*-
"""
🧠 NeuroRL Engine (rl_engine.py)
단어 연상 기법(Mnemonic Action Space) + 밀리초(ms) 반응속도(TTFK) + 회상 정확도 기반
강화학습(Contextual Bandit & Direct Preference Optimization) 핵심 엔진
"""

import math
import random
import json
from typing import Dict, List, Any, Optional

# 5대 표준 연상 기술 행동 공간 (Action Space)
MNEMONIC_ACTIONS = {
    "ACT_COLLISION": {
        "code": "ACT_COLLISION",
        "name": "💥 물리적 충돌·동작",
        "short": "충돌·동작",
        "desc": "두 대상이 격렬하게 부딪히거나 폭발·파괴되는 역동적 물리 인과관계로 연결",
        "prompt_guide": "두 개념의 시각 사물이 물리적으로 충돌하거나 역동적으로 움직이는 1문장 장면으로 묘사하세요."
    },
    "ACT_PHONETIC": {
        "code": "ACT_PHONETIC",
        "name": "🔊 발음·음운 유사 변환",
        "short": "발음 변환",
        "desc": "어려운 전문용어를 발음이 비슷한 친숙한 일상 단어나 사물로 치환하여 연결",
        "prompt_guide": "용어의 발음(음운)과 소리가 비슷한 일상 단어로 재미있게 치환하여 뜻과 연결하세요."
    },
    "ACT_LOCI": {
        "code": "ACT_LOCI",
        "name": "🏛️ 공간·장소 배치 (기억의 궁전)",
        "short": "공간 배치",
        "desc": "친숙한 공간(방문, 책상, 현관 등)의 특정 위치에 대상이 놓여 있는 시공간 장면",
        "prompt_guide": "친숙한 일상 공간(현관문, 책상 위, 냉장고 안 등)의 특정 위치에 핵심 사물을 배치하세요."
    },
    "ACT_BIZARRE": {
        "code": "ACT_BIZARRE",
        "name": "🎭 기괴·감각 극대화",
        "short": "감각 과장",
        "desc": "크기를 거대하게 키우거나 색채·소리·촉감을 비현실적이고 기괴하게 과장",
        "prompt_guide": "사물의 크기나 색깔, 소리, 촉감을 비현실적이고 기괴하게 과장하여 강렬한 인상을 만드세요."
    },
    "ACT_ACRONYM": {
        "code": "ACT_ACRONYM",
        "name": "🔤 초성·핵심운율 압축",
        "short": "초성·운율",
        "desc": "핵심 음절이나 초성을 리듬감 있는 짧은 키워드 사슬로 압축",
        "prompt_guide": "핵심 키워드의 앞글자나 초성을 따서 리듬감 있게 한 줄로 압축 연상하세요."
    }
}

ACTION_CODES = list(MNEMONIC_ACTIONS.keys())


def compute_rl_reward(
    is_correct: bool,
    ttfk_ms: float,
    encode_duration_ms: float,
    hint_level: int = 0,
    retention_stage: int = 0
) -> Dict[str, float]:
    """
    단어 1개의 인출 프로브 결과로부터 강화학습 보상 점수 R in [-1.0, +1.0] 산출
    - ttfk_ms: 자극(단서) 제시 후 첫 번째 키보드를 누르기까지 걸린 순수 뇌 반응속도(ms)
    - encode_duration_ms: 각인 단계에서 해당 단어 연상에 소요한 시간(ms)
    - hint_level: 0(무힌트), 1(초성 힌트), 2(첫글자 힌트)
    """
    ttfk_ms = max(100.0, float(ttfk_ms or 3000.0))
    encode_duration_ms = max(500.0, float(encode_duration_ms or 3000.0))
    hint_level = int(hint_level or 0)
    retention_stage = int(retention_stage or 0)

    if not is_correct:
        # 오답 패널티: 힌트를 썼는데도 틀리면 더 큰 음의 보상
        penalty = -0.60 - (0.20 * min(hint_level, 2))
        return {
            "reward": round(max(-1.0, penalty), 4),
            "speed_score": 0.0,
            "encode_score": 0.0,
            "grade": "REJECTED"
        }

    # 1. 순수 신경 반응속도 점수 (400ms 이하면 1.0, 1800ms 스케일로 지수 감쇠)
    effective_ttfk = max(0.0, ttfk_ms - 400.0)
    speed_score = math.exp(-effective_ttfk / 1800.0)

    # 2. 각인 효율성 점수 (1500ms 이하면 1.0, 7000ms 스케일로 완만 감쇠)
    effective_encode = max(0.0, encode_duration_ms - 1500.0)
    encode_score = math.exp(-effective_encode / 7000.0)

    # 3. 힌트 감점 계수
    if hint_level == 0:
        hint_mult = 1.0
    elif hint_level == 1:
        hint_mult = 0.65
    else:
        hint_mult = 0.35

    # 4. 지연 회상(장기기억) 보너스
    retention_bonus = min(0.20, retention_stage * 0.07)

    raw_reward = ((0.60 * speed_score) + (0.25 * encode_score) + 0.15) * hint_mult + retention_bonus
    final_reward = round(min(1.0, max(-1.0, raw_reward)), 4)

    if final_reward >= 0.65:
        grade = "CHOSEN"      # 고보상 (DPO 선호 샘플)
    elif final_reward >= 0.35:
        grade = "NEUTRAL"     # 보통 보상
    else:
        grade = "LOW_REWARD"  # 정답이나 반응속도가 너무 느림 (연상 개선 필요)

    return {
        "reward": final_reward,
        "speed_score": round(speed_score, 4),
        "encode_score": round(encode_score, 4),
        "grade": grade
    }


def select_bandit_action(policy_rows: List[Dict[str, Any]], explore_rate: float = 0.15) -> Dict[str, Any]:
    """
    Thompson Sampling + UCB 하이브리드 Contextual Bandit 정책
    사용자의 과거 반응속도 및 보상 이력을 바탕으로 최적의 연상 기법(Action)을 선택합니다.
    """
    stats_map = {row["action_type"]: row for row in (policy_rows or [])}

    sampled_scores = {}
    action_Analytics = []

    for code, meta in MNEMONIC_ACTIONS.items():
        row = stats_map.get(code, {})
        alpha = float(row.get("alpha_success", 1.0))
        beta = float(row.get("beta_failure", 1.0))
        avg_ttfk = float(row.get("avg_ttfk_ms", 2000.0))
        mean_reward = float(row.get("mean_reward", 0.0))
        cnt = int(row.get("sample_count", 0))

        # Beta 분포에서 Thompson Sampling 추출
        theta = random.betavariate(max(0.5, alpha), max(0.5, beta))
        # 반응속도 가산점 결합
        speed_bonus = math.exp(-max(0.0, avg_ttfk - 500.0) / 2500.0) * 0.25
        score = (0.75 * theta) + speed_bonus
        sampled_scores[code] = score

        expected_win_rate = round((alpha / (alpha + beta)) * 100, 1)
        action_Analytics.append({
            "action_type": code,
            "name": meta["name"],
            "short": meta["short"],
            "desc": meta["desc"],
            "sample_count": cnt,
            "avg_ttfk_ms": round(avg_ttfk, 1),
            "mean_reward": round(mean_reward, 3),
            "expected_win_rate": expected_win_rate,
            "bandit_score": round(score, 4)
        })

    # 정렬 (점수 높은 순)
    action_Analytics.sort(key=lambda x: x["bandit_score"], reverse=True)

    # 일정 확률(explore_rate)로 탐색(Exploration), 그 외에는 최고 기법 활용(Exploitation)
    if random.random() < explore_rate:
        chosen_code = random.choice(ACTION_CODES)
        mode = "EXPLORE (탐색)"
    else:
        chosen_code = action_Analytics[0]["action_type"]
        mode = "EXPLOIT (최적 기법 활용)"

    return {
        "recommended_action": chosen_code,
        "recommended_meta": MNEMONIC_ACTIONS[chosen_code],
        "selection_mode": mode,
        "policy_ranking": action_Analytics
    }


def generate_rule_based_mnemonic_candidates(word: str, definition: str, base_anchor: str = "") -> Dict[str, str]:
    """
    AI 호출 없이도 0.001초 만에 5대 연상 기법별 가이드/초안을 즉시 생성하는 폴백 생성기
    """
    clean_anchor = (base_anchor or f"💡 {word}").strip()
    chosung_hint = "".join([ ch for ch in word[:2] ])
    return {
        "ACT_COLLISION": f"[충돌] {clean_anchor}이(가) 날아가 '{definition[:15]}' 표지판을 정면으로 박살내는 장면",
        "ACT_PHONETIC": f"[발음] '{word}'의 발음과 비슷한 사물이 '{definition[:15]}' 동작을 하는 장면",
        "ACT_LOCI": f"[장소] 내 방 책상 한가운데에 {clean_anchor}을(를) 올려두고 '{definition[:15]}' 작동시키는 장면",
        "ACT_BIZARRE": f"[과장] 집채만 하게 거대해진 {clean_anchor}에서 번개가 치며 '{definition[:15]}' 현상이 일어나는 장면",
        "ACT_ACRONYM": f"[압축] '{chosung_hint}' -> {clean_anchor} = {definition[:18]}"
    }
