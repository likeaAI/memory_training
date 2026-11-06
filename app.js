/**
 * 🧠 BrainLock NeuroRL v2 — Core Frontend Application (app.js)
 * ---------------------------------------------------------------------------
 * 1. Zero-Latency Word Feeder (106 Topics + Prioritized Experience Replay)
 * 2. 5 Mnemonic Action Space + Per-Card Encoding Duration Tracker (ms)
 * 3. 1-by-1 Millisecond Recall Probe (TTFK: Time-to-First-Keystroke via performance.now())
 * 4. Online RL (Contextual Bandit Thompson Sampling) & Offline RL (DPO Preference Pairs)
 * 5. Chimpanzee Spatial Working Memory Game (Preserved)
 */

(function () {
  "use strict";

  // =========================================================================
  // 1. 5대 표준 연상 기법 행동 공간 (Action Space) 정의
  // =========================================================================
  const MNEMONIC_ACTIONS = {
    ACT_COLLISION: {
      code: "ACT_COLLISION",
      name: "💥 물리적 충돌·동작",
      short: "💥 충돌·동작",
      desc: "두 대상이 격렬하게 부딪히거나 폭발·파괴되는 역동적 물리 인과관계로 연결"
    },
    ACT_PHONETIC: {
      code: "ACT_PHONETIC",
      name: "🔊 발음·음운 유사 변환",
      short: "🔊 발음 변환",
      desc: "어려운 전문용어를 발음이 비슷한 친숙한 일상 단어나 사물로 치환하여 연결"
    },
    ACT_LOCI: {
      code: "ACT_LOCI",
      name: "🏛️ 공간·장소 배치",
      short: "🏛️ 공간 배치",
      desc: "친숙한 공간(책상, 방문, 현관 등)의 특정 위치에 핵심 사물을 배치하는 기억의 궁전"
    },
    ACT_BIZARRE: {
      code: "ACT_BIZARRE",
      name: "🎭 기괴·감각 극대화",
      short: "🎭 감각 과장",
      desc: "크기를 거대하게 키우거나 색채·소리·촉감을 비현실적이고 기괴하게 과장"
    },
    ACT_ACRONYM: {
      code: "ACT_ACRONYM",
      name: "🔤 초성·핵심운율 압축",
      short: "🔤 초성·운율",
      desc: "핵심 음절이나 초성을 리듬감 있는 짧은 키워드 사슬로 압축"
    }
  };

  const ACTION_CODES = Object.keys(MNEMONIC_ACTIONS);

  // 오프라인/독립실행용 기본 시드 단어 사전
  const OFFLINE_SEED_WORDS = {
    "전기기사 전자기학": [
      { word: "쿨롱의 법칙", definition: "두 점전하 사이에 작용하는 정전기력은 전하량의 곱에 비례하고 거리 제곱에 반비례함", visual_anchor: "🧲 불꽃 튀는 두 구슬" },
      { word: "가우스 법칙", definition: "폐곡면을 통과하는 총 전속은 폐곡면 내부의 총 전하량과 같다는 법칙", visual_anchor: "🎈 빛이 뿜어져 나오는 풍선" },
      { word: "패러데이 법칙", definition: "자기선속의 시간적 변화율에 비례하여 유도기전력이 발생하는 현상", visual_anchor: "🌀 회전하는 자석과 코일 번개" },
      { word: "렌츠의 법칙", definition: "유도전류는 자속의 변화를 방해하는 방향으로 흐른다는 법칙", visual_anchor: "🛡️ 자석을 밀어내는 방패" },
      { word: "비오-사바르 법칙", definition: "미소 전류소편이 공간의 한 점에 만드는 미소 자계의 세기를 구하는 법칙", visual_anchor: "🧭 전선 주위를 도는 나침반" },
      { word: "전속밀도", definition: "단위 면적을 수직으로 통과하는 전속의 수 (D = εE)", visual_anchor: "🌧️ 촘촘히 꽂히는 번개 화살" },
      { word: "유전분극", definition: "유전체에 외부 전계를 가할 때 양전하와 음전하가 미세하게 변위되어 쌍극자가 정렬되는 현상", visual_anchor: "🔋 양극으로 줄 서는 알갱이" },
      { word: "맥스웰 방정식", definition: "전기장과 자기장의 발생 및 상호 유도 관계를 통합 기술한 4대 편미분 방정식", visual_anchor: "📜 전자기 우주를 지배하는 4개의 비석" },
      { word: "경계조건", definition: "서로 다른 두 매질의 경계면에서 전계 접선성분과 전속밀도 법선성분이 만족하는 조건", visual_anchor: "🌊 물과 유리를 통과하며 꺾이는 광선" },
      { word: "포인팅 벡터", definition: "전자기파가 단위 시간에 단위 면적을 통해 전달하는 에너지 흐름 밀도 (P = E × H)", visual_anchor: "🚀 전계와 자계가 합쳐져 발사되는 레이저" }
    ],
    "전기기사 회로이론": [
      { word: "키르히호프 전류법칙", definition: "회로의 임의의 접속점(Node)에 흘러들어오는 전류의 합과 나가는 전류의 합은 같다", visual_anchor: "🚦 교차로에서 합류하는 물줄기" },
      { word: "테브난 정리", definition: "복잡한 선형 2단자 회로망을 하나의 등가전압원과 직렬 등가임피던스로 치환하는 정리", visual_anchor: "📦 복잡한 기계를 배터리 1개로 압축한 상자" },
      { word: "공진 주파수", definition: "RLC 회로에서 유도성 리액턴스와 용량성 리액턴스가 같아져 허수부가 0이 되는 주파수", visual_anchor: "🔔 소리굽쇠가 공명하며 유리가 깨지는 순간" },
      { word: "과도현상", definition: "스위치 개폐 직후 회로가 정상상태에 도달하기 전까지 전류·전압이 시간에 따라 변하는 현상", visual_anchor: "🌊 수문을 열자마자 출렁이는 파도" },
      { word: "라플라스 변환", definition: "시간 영역의 미분방정식을 복소주파수(s) 영역의 대수방정식으로 변환하는 기법", visual_anchor: "⏳ 시계를 부수고 알파벳 S 마법진으로 바꾸기" }
    ],
    "정보처리기사 운영체제": [
      { word: "데드락", definition: "두 개 이상의 프로세스가 서로 상대방이 점유한 자원을 무한정 기다리며 멈추는 교착 상태", visual_anchor: "🚗 외나무다리에서 마주보고 멈춘 두 트럭" },
      { word: "세마포어", definition: "공유 자원에 대한 복수 프로세스의 접근을 정수형 변수(P/V 연산)로 제어하는 동기화 기법", visual_anchor: "🚦 화장실 열쇠 개수를 세는 신호등 관리인" },
      { word: "컨텍스트 스위칭", definition: "CPU가 현재 실행 중인 프로세스 상태를 PCB에 저장하고 다음 프로세스 상태를 적재하는 과정", visual_anchor: "🎭 배우가 무대 뒤에서 0.1초 만에 의상을 갈아입기" },
      { word: "페이지 폴트", definition: "프로세스가 참조하려는 페이지가 물리 메모리(RAM)에 없어 보조기억장치에서 가져와야 하는 인터럽트", visual_anchor: "📖 책장을 넘겼는데 백지여서 창고로 뛰어가는 사서" },
      { word: "스래싱", definition: "과도한 페이지 교체로 인해 CPU가 실제 작업보다 페이지 교체에 더 많은 시간을 쓰는 현상", visual_anchor: "🏃 제자리에서 짐만 옮기다 지쳐 쓰러진 일꾼" }
    ]
  };

  // =========================================================================
  // 2. 한글 초성 추출 및 클라이언트 측 RL 수식 유틸리티
  // =========================================================================
  const CHOSUNG_LIST = [
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
    "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
  ];

  function extractChosung(str) {
    if (!str) return "";
    let result = "";
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i) - 44032;
      if (code > -1 && code < 11172) {
        result += CHOSUNG_LIST[Math.floor(code / 588)];
      } else {
        result += str.charAt(i);
      }
    }
    return result;
  }

  function normalizeAnswer(str) {
    return (str || "")
      .toLowerCase()
      .replace(/[\s\-_·.,()[\]]/g, "")
      .trim();
  }

  function checkAnswerMatch(targetWord, userAnswer) {
    const normTarget = normalizeAnswer(targetWord);
    const normUser = normalizeAnswer(userAnswer);
    if (!normTarget || !normUser) return false;
    if (normTarget === normUser) return true;
    // '의', '법칙' 등 조사 생략 허용 (핵심 키워드 2글자 이상 일치 시)
    const strippedTarget = normTarget.replace(/의법칙|법칙|정리|현상/g, "");
    const strippedUser = normUser.replace(/의법칙|법칙|정리|현상/g, "");
    if (strippedTarget.length >= 2 && strippedTarget === strippedUser) return true;
    return false;
  }

  function maskWordInCue(cueText, targetWord) {
    if (!cueText) return "연상 단서를 떠올려 단어를 인출하세요";
    if (!targetWord) return cueText;
    let masked = cueText;
    const cleanWord = targetWord.trim();
    if (cleanWord.length >= 2) {
      masked = masked.split(cleanWord).join("[ ❓ ]");
      // 띄어쓰기 전 앞 어절도 마스킹
      const parts = cleanWord.split(/\s+/);
      parts.forEach((p) => {
        if (p.length >= 2) {
          masked = masked.split(p).join("[ ❓ ]");
        }
      });
    }
    return masked;
  }

  function buildCandidateMnemonics(word, definition, visualAnchor) {
    const anchor = (visualAnchor || `💡 ${word}`).trim();
    const shortDef = (definition || "").slice(0, 18);
    const chosung = extractChosung(word);
    return {
      ACT_COLLISION: `[충돌] ${anchor}이(가) 날아가 '${shortDef}' 표지판을 정면으로 박살내는 장면`,
      ACT_PHONETIC: `[발음] '${word}' 발음과 비슷한 사물이 '${shortDef}' 동작을 일으키는 장면`,
      ACT_LOCI: `[장소] 내 방 책상 정중앙에 ${anchor}을(를) 올려두고 '${shortDef}' 작동시키는 장면`,
      ACT_BIZARRE: `[과장] 집채만 하게 거대해진 ${anchor}에서 번개가 치며 '${shortDef}' 현상이 폭발하는 장면`,
      ACT_ACRONYM: `[압축] 초성 '${chosung}' ➔ ${anchor} = ${shortDef}`
    };
  }

  function computeClientRLReward(isCorrect, ttfkMs, encodeDurationMs, hintLevel) {
    const ttfk = Math.max(100, Number(ttfkMs) || 3000);
    const enc = Math.max(500, Number(encodeDurationMs) || 3000);
    const hint = Number(hintLevel) || 0;

    if (!isCorrect) {
      const penalty = Math.max(-1.0, -0.60 - 0.20 * Math.min(hint, 2));
      return {
        reward: Number(penalty.toFixed(4)),
        speed_score: 0.0,
        encode_score: 0.0,
        grade: "REJECTED"
      };
    }

    const effTtfk = Math.max(0, ttfk - 400);
    const speedScore = Math.exp(-effTtfk / 1800.0);

    const effEnc = Math.max(0, enc - 1500);
    const encodeScore = Math.exp(-effEnc / 7000.0);

    const hintMult = hint === 0 ? 1.0 : hint === 1 ? 0.65 : 0.35;
    const raw = (0.60 * speedScore + 0.25 * encodeScore + 0.15) * hintMult;
    const reward = Number(Math.min(1.0, Math.max(-1.0, raw)).toFixed(4));

    let grade = "LOW_REWARD";
    if (reward >= 0.65) grade = "CHOSEN";
    else if (reward >= 0.35) grade = "NEUTRAL";

    return {
      reward,
      speed_score: Number(speedScore.toFixed(4)),
      encode_score: Number(encodeScore.toFixed(4)),
      grade
    };
  }

  // =========================================================================
  // 3. 효과음 합성기 (Web Audio API)
  // =========================================================================
  const SoundFX = {
    enabled: true,
    ctx: null,
    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
    },
    playTone(freq, durationMs, type = "sine", gainVal = 0.08) {
      if (!this.enabled) return;
      try {
        this.init();
        if (this.ctx.state === "suspended") this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + durationMs / 1000);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + durationMs / 1000);
      } catch (_) {}
    },
    tick() {
      this.playTone(880, 45, "triangle", 0.05);
    },
    success() {
      this.playTone(587.33, 90, "sine", 0.08);
      setTimeout(() => this.playTone(880, 140, "sine", 0.09), 70);
    },
    fail() {
      this.playTone(220, 180, "sawtooth", 0.06);
    }
  };

  // =========================================================================
  // 4. 로컬 오프라인/독립실행 RL 스토리지 (LocalRLStore)
  // =========================================================================
  const LocalRLStore = {
    TRAJ_KEY: "brainlock_rl_trajectories_v2",
    BANDIT_KEY: "brainlock_rl_bandit_v2",
    DPO_KEY: "brainlock_rl_dpo_v2",

    getTrajectories() {
      try {
        return JSON.parse(localStorage.getItem(this.TRAJ_KEY) || "[]");
      } catch (_) {
        return [];
      }
    },
    saveTrajectories(list) {
      try {
        localStorage.setItem(this.TRAJ_KEY, JSON.stringify(list.slice(0, 500)));
      } catch (_) {}
    },
    getBanditMap() {
      try {
        return JSON.parse(localStorage.getItem(this.BANDIT_KEY) || "{}");
      } catch (_) {
        return {};
      }
    },
    saveBanditMap(map) {
      try {
        localStorage.setItem(this.BANDIT_KEY, JSON.stringify(map));
      } catch (_) {}
    },
    getDpoPairs() {
      try {
        return JSON.parse(localStorage.getItem(this.DPO_KEY) || "[]");
      } catch (_) {
        return [];
      }
    },
    saveDpoPairs(pairs) {
      try {
        localStorage.setItem(this.DPO_KEY, JSON.stringify(pairs.slice(0, 300)));
      } catch (_) {}
    },

    getBanditPolicy() {
      const map = this.getBanditMap();
      const ranking = ACTION_CODES.map((code) => {
        const meta = MNEMONIC_ACTIONS[code];
        const st = map[code] || { alpha: 1.0, beta: 1.0, avg_ttfk_ms: 1800.0, mean_reward: 0.0, sample_count: 0 };
        const winRate = Number(((st.alpha / (st.alpha + st.beta)) * 100).toFixed(1));
        const speedBonus = Math.exp(-Math.max(0, st.avg_ttfk_ms - 500) / 2500.0) * 0.25;
        const score = Number((0.75 * (st.alpha / (st.alpha + st.beta)) + speedBonus).toFixed(4));
        return {
          action_type: code,
          name: meta.name,
          short: meta.short,
          desc: meta.desc,
          sample_count: st.sample_count,
          avg_ttfk_ms: Number(st.avg_ttfk_ms.toFixed(1)),
          mean_reward: Number(st.mean_reward.toFixed(3)),
          expected_win_rate: winRate,
          bandit_score: score
        };
      });
      ranking.sort((a, b) => b.bandit_score - a.bandit_score);
      const best = ranking[0].action_type;
      return {
        recommended_action: best,
        recommended_meta: MNEMONIC_ACTIONS[best],
        selection_mode: "EXPLOIT (최적 기법 활용)",
        policy_ranking: ranking
      };
    },

    recordSession(topic, topicCategory, items) {
      const trajs = this.getTrajectories();
      const banditMap = this.getBanditMap();
      const dpoPairs = this.getDpoPairs();

      const processed = [];
      const chosenPool = [];
      const rejectedPool = [];

      items.forEach((it) => {
        const rw = computeClientRLReward(it.is_correct, it.ttfk_ms, it.encode_duration_ms, it.hint_level);
        const rec = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          topic,
          topic_category: topicCategory || "ALL",
          word: it.word,
          definition: it.definition,
          visual_anchor: it.visual_anchor || "",
          action_type: it.action_type || "ACT_COLLISION",
          action_name: (MNEMONIC_ACTIONS[it.action_type] || MNEMONIC_ACTIONS.ACT_COLLISION).name,
          user_mnemonic_text: it.user_mnemonic_text || it.visual_anchor || it.word,
          encode_duration_ms: Math.round(it.encode_duration_ms || 2500),
          ttfk_ms: Math.round(it.ttfk_ms || 2000),
          typing_duration_ms: Math.round(it.typing_duration_ms || 600),
          is_correct: Boolean(it.is_correct),
          user_answer: it.user_answer || "",
          hint_level: it.hint_level || 0,
          reward_score: rw.reward,
          speed_score: rw.speed_score,
          grade: rw.grade,
          created_at: new Date().toISOString().replace("T", " ").slice(0, 19)
        };
        processed.push(rec);
        trajs.unshift(rec);

        if (rw.grade === "CHOSEN") chosenPool.push(rec);
        else if (rw.grade === "REJECTED" || rw.grade === "LOW_REWARD") rejectedPool.push(rec);

        const code = rec.action_type;
        const prev = banditMap[code] || { alpha: 1.0, beta: 1.0, avg_ttfk_ms: 1800.0, mean_reward: 0.0, sample_count: 0 };
        const n = prev.sample_count + 1;
        if (rw.reward >= 0.45) prev.alpha += rw.reward;
        else prev.beta += rw.reward < 0 ? Math.abs(rw.reward) : 0.5;
        if (rec.is_correct) {
          prev.avg_ttfk_ms = (prev.avg_ttfk_ms * prev.sample_count + rec.ttfk_ms) / n;
        }
        prev.mean_reward = (prev.mean_reward * prev.sample_count + rw.reward) / n;
        prev.sample_count = n;
        banditMap[code] = prev;
      });

      let dpoCreated = 0;
      chosenPool.forEach((ch) => {
        rejectedPool.forEach((rj) => {
          dpoPairs.unshift({
            topic,
            word: ch.word,
            definition: ch.definition,
            prompt: `[주제: ${topic}] 단어 '${ch.word}'(${ch.definition})를 뇌에 즉각 각인시키는 고효율 연상 문장을 작성하세요.`,
            chosen_action: ch.action_type,
            chosen_mnemonic: ch.user_mnemonic_text,
            chosen_ttfk_ms: ch.ttfk_ms,
            chosen_reward: ch.reward_score,
            rejected_action: rj.action_type,
            rejected_mnemonic: `[비효율 연상 - ${rj.word}] ${rj.user_mnemonic_text}`,
            rejected_ttfk_ms: rj.ttfk_ms,
            rejected_reward: rj.reward_score,
            created_at: new Date().toISOString()
          });
          dpoCreated++;
        });
      });

      this.saveTrajectories(trajs);
      this.saveBanditMap(banditMap);
      this.saveDpoPairs(dpoPairs);

      return {
        trajectories: processed,
        dpo_pairs_created: dpoCreated,
        updated_bandit_policy: this.getBanditPolicy()
      };
    },

    fetchFallbackWords(topic, count) {
      let pool = OFFLINE_SEED_WORDS[topic] || [];
      if (pool.length === 0) {
        // 카탈로그 메타에서 즉석 생성
        const catList = window.TOPICS_CATALOG_106 || [];
        const found = catList.find((t) => t.name === topic);
        if (found && Array.isArray(found.sub_domains)) {
          pool = found.sub_domains.map((sub, idx) => ({
            word: sub.split(/[/()]/)[0].trim(),
            definition: `${topic} 핵심 영역 (${found.desc || sub})`,
            visual_anchor: `${found.icon || "⚡"} ${sub}`
          }));
        } else {
          pool = OFFLINE_SEED_WORDS["전기기사 전자기학"];
        }
      }
      const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
      return shuffled.map((w) => ({
        word: w.word,
        definition: w.definition,
        visual_anchor: w.visual_anchor || `💡 ${w.word}`,
        rl_tag: "✨ 신규/표준 인출",
        mnemonic_candidates: buildCandidateMnemonics(w.word, w.definition, w.visual_anchor)
      }));
    }
  };

  // =========================================================================
  // 5. 애플리케이션 전역 상태 (AppState)
  // =========================================================================
  const AppState = {
    selectedTopic: "전기기사 전자기학",
    selectedCategory: "전기/전자/제어",
    wordCount: 5,
    topicWordCounts: {},
    totalBankWords: 0,
    banditPolicy: LocalRLStore.getBanditPolicy(),

    // 현재 RL 세션 데이터
    sessionId: "",
    sessionWords: [], // [{ word, definition, visual_anchor, rl_tag, mnemonic_candidates, selected_action, user_mnemonic_text, is_user_modified, encode_duration_ms }]
    encodeStartTime: 0,
    encodeTimerInterval: null,
    activeCardIdx: 0,
    activeCardFocusStamp: 0,

    // Stage 3: 1:1 Recall Probe 상태
    probeQueue: [],
    probeIdx: 0,
    probeStimulusOnset: 0,
    probeFirstKeystroke: 0,
    probeTtfkLocked: false,
    probeHintLevel: 0,
    probeRafId: null,
    probeResults: [],

    // 대시보드 캐시
    lastDashboardData: null,

    // 마이닝 폴링
    minerInterval: null,
    minerTargetCount: 100
  };

  // =========================================================================
  // 6. 상단 네비게이션 및 뷰 전환
  // =========================================================================
  function switchView(viewId) {
    document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
    const target = document.getElementById(viewId);
    if (target) target.classList.add("active");

    document.querySelectorAll(".nav-mode-switcher .mode-nav-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    if (viewId === "viewRLTrain") {
      document.getElementById("btnNavRLTrain")?.classList.add("active");
    } else if (viewId === "viewRLDashboard") {
      document.getElementById("btnNavRLDash")?.classList.add("active");
      loadRLDashboard();
    } else if (viewId === "viewSpatial") {
      document.getElementById("btnNavSpatial")?.classList.add("active");
      SpatialGame.renderIdleGrid();
    }
  }

  function setRLStage(stageNum) {
    const stages = {
      1: "rlStageSetup",
      2: "rlStageEncode",
      3: "rlStageProbe",
      4: "rlStageReport"
    };
    Object.entries(stages).forEach(([num, id]) => {
      const el = document.getElementById(id);
      if (el) el.style.display = Number(num) === stageNum ? "block" : "none";
    });

    for (let i = 1; i <= 4; i++) {
      const stepEl = document.getElementById(`stepInd${i}`);
      if (!stepEl) continue;
      stepEl.classList.remove("active", "done");
      if (i < stageNum) stepEl.classList.add("done");
      else if (i === stageNum) stepEl.classList.add("active");
    }
  }

  // =========================================================================
  // 7. [STAGE 1] 주제 카탈로그 초기화 & Bandit 추천 배너 업데이트
  // =========================================================================
  async function initTopicCatalogAndCounts() {
    const catalog = window.TOPICS_CATALOG_106 || [];
    try {
      const res = await fetch("/api/word-bank/topics");
      if (res.ok) {
        const data = await res.json();
        AppState.topicWordCounts = data.topic_counts || {};
        AppState.totalBankWords = data.total_words || 0;
      }
    } catch (_) {
      // 오프라인 모드일 경우 기본 시드 카운트 계산
      let sum = 0;
      Object.entries(OFFLINE_SEED_WORDS).forEach(([k, arr]) => {
        AppState.topicWordCounts[k] = arr.length;
        sum += arr.length;
      });
      AppState.totalBankWords = sum;
    }

    const navBankBadge = document.getElementById("navBankWordCount");
    if (navBankBadge) navBankBadge.textContent = AppState.totalBankWords.toLocaleString();

    populateTopicSelectDropdown("inputTopic", catalog);
    populateTopicSelectDropdown("minerTopicSelect", catalog);
    updateSelectedTopicCard();
    refreshSetupBanditBanner();
  }

  function populateTopicSelectDropdown(selectId, catalog) {
    const selectEl = document.getElementById(selectId);
    if (!selectEl) return;
    selectEl.innerHTML = "";

    const grouped = {};
    catalog.forEach((t) => {
      const cat = t.category || "기타";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(t);
    });

    Object.entries(grouped).forEach(([catName, topics]) => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = `📂 ${catName} (${topics.length}개 주제)`;
      topics.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.name;
        const cnt = AppState.topicWordCounts[t.name] || 0;
        opt.textContent = `${t.icon || "📘"} ${t.name} ${cnt > 0 ? `[보유 ${cnt}단어]` : ""}`;
        if (t.name === AppState.selectedTopic) opt.selected = true;
        optgroup.appendChild(opt);
      });
      selectEl.appendChild(optgroup);
    });
  }

  function updateSelectedTopicCard() {
    const catalog = window.TOPICS_CATALOG_106 || [];
    const selectEl = document.getElementById("inputTopic");
    const topicName = selectEl ? selectEl.value : AppState.selectedTopic;
    AppState.selectedTopic = topicName;

    const meta = catalog.find((t) => t.name === topicName) || {
      name: topicName,
      category: "전공/자격",
      icon: "⚡",
      desc: "핵심 개념 정의 및 시각 연상 훈련",
      sub_domains: []
    };
    AppState.selectedCategory = meta.category || "ALL";

    const iconEl = document.getElementById("conceptTopicIcon");
    const nameEl = document.getElementById("conceptTopicName");
    const catEl = document.getElementById("conceptTopicCategory");
    const countEl = document.getElementById("conceptTopicWordCountBadge");
    const descEl = document.getElementById("conceptTopicDesc");
    const subEl = document.getElementById("conceptTopicSubDomains");

    if (iconEl) iconEl.textContent = meta.icon || "⚡";
    if (nameEl) nameEl.textContent = meta.name;
    if (catEl) catEl.textContent = meta.category;
    const cnt = AppState.topicWordCounts[meta.name] || 0;
    if (countEl) {
      countEl.textContent = cnt > 0 ? `⚡ 단어 은행 ${cnt.toLocaleString()}단어 즉시 인출 가능` : `✨ 기본 시드/즉시 생성 인출 준비 완료`;
    }
    if (descEl) descEl.textContent = meta.desc || "";
    if (subEl) {
      subEl.innerHTML = (meta.sub_domains || [])
        .map((s) => `<span class="sub-chip"># ${s}</span>`)
        .join("");
    }
  }

  function refreshSetupBanditBanner(policyObj) {
    const policy = policyObj || AppState.banditPolicy || LocalRLStore.getBanditPolicy();
    AppState.banditPolicy = policy;
    const recMeta = policy.recommended_meta || MNEMONIC_ACTIONS.ACT_COLLISION;
    const ranking = policy.policy_ranking || [];
    const topStat = ranking.find((r) => r.action_type === policy.recommended_action) || ranking[0] || {};

    const nameEl = document.getElementById("setupBanditActionName");
    const descEl = document.getElementById("setupBanditActionDesc");
    const winEl = document.getElementById("setupBanditWinRate");
    const ttfkEl = document.getElementById("setupBanditAvgTtfk");

    if (nameEl) nameEl.textContent = recMeta.name;
    if (descEl) descEl.textContent = recMeta.desc;
    if (winEl) winEl.textContent = `${topStat.expected_win_rate != null ? topStat.expected_win_rate : 50.0}%`;
    if (ttfkEl) {
      ttfkEl.textContent = topStat.sample_count > 0 ? `${Math.round(topStat.avg_ttfk_ms)} ms` : "데이터 수집 중";
    }
  }

  // =========================================================================
  // 8. [STAGE 2] 단어 인출 & 연상 기법(Action) 각인 단계
  // =========================================================================
  async function startEncodeStage() {
    const btn = document.getElementById("btnStartEncodeStage");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "⚡ 단어 인출 및 Bandit 정책 로드 중...";
    }

    let words = [];
    let banditPolicy = null;

    try {
      const res = await fetch("/api/rl/fetch-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: AppState.selectedTopic,
          topic_category: AppState.selectedCategory,
          count: AppState.wordCount
        })
      });
      if (res.ok) {
        const data = await res.json();
        words = data.words || [];
        banditPolicy = data.bandit_policy || null;
      }
    } catch (_) {}

    if (!words || words.length === 0) {
      words = LocalRLStore.fetchFallbackWords(AppState.selectedTopic, AppState.wordCount);
    }
    if (banditPolicy) {
      refreshSetupBanditBanner(banditPolicy);
    }

    const recommendedAction = (AppState.banditPolicy && AppState.banditPolicy.recommended_action) || "ACT_COLLISION";

    AppState.sessionId = `rl_${Date.now()}`;
    AppState.sessionWords = words.map((w) => {
      const cands = w.mnemonic_candidates || buildCandidateMnemonics(w.word, w.definition, w.visual_anchor);
      return {
        word: w.word,
        definition: w.definition,
        visual_anchor: w.visual_anchor || `💡 ${w.word}`,
        rl_tag: w.rl_tag || "✨ 신규/표준 인출",
        mnemonic_candidates: cands,
        selected_action: recommendedAction,
        user_mnemonic_text: cands[recommendedAction] || w.visual_anchor || w.word,
        is_user_modified: false,
        encode_duration_ms: 1200 // 기본 최소 노출 시간
      };
    });

    if (btn) {
      btn.disabled = false;
      btn.textContent = "⚡ 0.001초 단어 인출 & 연상 각인(Encoding) 시작 ➔";
    }

    renderEncodeCards();
    setRLStage(2);
    startEncodeTimers();
  }

  function renderEncodeCards() {
    const container = document.getElementById("encodeCardsContainer");
    if (!container) return;
    container.innerHTML = "";

    AppState.sessionWords.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "encode-word-card";
      card.dataset.idx = idx;

      const isWeak = (item.rl_tag || "").includes("취약");
      const tagClass = isWeak ? "rl-tag-weak" : "rl-tag-fresh";

      const actionChipsHtml = ACTION_CODES.map((code) => {
        const meta = MNEMONIC_ACTIONS[code];
        const isActive = item.selected_action === code ? "active" : "";
        return `<button type="button" class="action-chip ${isActive}" data-idx="${idx}" data-action="${code}">${meta.short}</button>`;
      }).join("");

      card.innerHTML = `
        <div class="encode-card-top">
          <div class="encode-word-title">
            <span class="word-idx-badge">${idx + 1}</span>
            <strong class="target-word-text">${item.word}</strong>
            <span class="${tagClass}">${item.rl_tag}</span>
          </div>
          <div class="encode-time-badge" id="encodeCardTime_${idx}">⏱️ 각인: ${(item.encode_duration_ms / 1000).toFixed(1)}s</div>
        </div>
        <div class="encode-word-def">${item.definition}</div>
        <div class="encode-anchor-pill">시각 앵커: <strong>${item.visual_anchor}</strong></div>
        <div class="action-chips-row">${actionChipsHtml}</div>
        <div class="encode-input-wrap">
          <input type="text" class="encode-mnemonic-input" data-idx="${idx}" value="${item.user_mnemonic_text.replace(/"/g, "&quot;")}" placeholder="나만의 강렬한 연상 문장을 입력하거나 위 기법 버튼을 클릭하세요">
        </div>
      `;

      // 포커스/마우스 진입 시 해당 카드의 각인 시간 누적
      card.addEventListener("mouseenter", () => switchActiveEncodeCard(idx));
      card.addEventListener("focusin", () => switchActiveEncodeCard(idx));

      container.appendChild(card);
    });

    // 기법 칩 클릭 이벤트
    container.querySelectorAll(".action-chip").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        const actionCode = e.currentTarget.dataset.action;
        const item = AppState.sessionWords[idx];
        if (!item) return;

        item.selected_action = actionCode;
        const candText = item.mnemonic_candidates[actionCode] || item.user_mnemonic_text;
        item.user_mnemonic_text = candText;

        const parentCard = e.currentTarget.closest(".encode-word-card");
        if (parentCard) {
          parentCard.querySelectorAll(".action-chip").forEach((c) => c.classList.remove("active"));
          e.currentTarget.classList.add("active");
          const inp = parentCard.querySelector(".encode-mnemonic-input");
          if (inp) inp.value = candText;
        }
        SoundFX.tick();
      });
    });

    // 연상 문장 직접 수정 이벤트
    container.querySelectorAll(".encode-mnemonic-input").forEach((inp) => {
      inp.addEventListener("input", (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        const item = AppState.sessionWords[idx];
        if (!item) return;
        item.user_mnemonic_text = e.currentTarget.value;
        item.is_user_modified = true;
      });
    });
  }

  function switchActiveEncodeCard(newIdx) {
    const now = performance.now();
    if (AppState.activeCardFocusStamp > 0 && AppState.sessionWords[AppState.activeCardIdx]) {
      const delta = now - AppState.activeCardFocusStamp;
      AppState.sessionWords[AppState.activeCardIdx].encode_duration_ms += Math.min(delta, 15000);
    }
    AppState.activeCardIdx = newIdx;
    AppState.activeCardFocusStamp = now;
  }

  function startEncodeTimers() {
    stopEncodeTimers();
    AppState.encodeStartTime = performance.now();
    AppState.activeCardIdx = 0;
    AppState.activeCardFocusStamp = performance.now();

    AppState.encodeTimerInterval = setInterval(() => {
      const now = performance.now();
      const totalSec = ((now - AppState.encodeStartTime) / 1000).toFixed(1);
      const totalEl = document.getElementById("encodeTotalTimer");
      if (totalEl) totalEl.textContent = `${totalSec}s`;

      // 현재 포커스된 카드의 각인 시간 실시간 반영
      const activeItem = AppState.sessionWords[AppState.activeCardIdx];
      if (activeItem && AppState.activeCardFocusStamp > 0) {
        const delta = now - AppState.activeCardFocusStamp;
        activeItem.encode_duration_ms += delta;
        AppState.activeCardFocusStamp = now;
        const badge = document.getElementById(`encodeCardTime_${AppState.activeCardIdx}`);
        if (badge) badge.textContent = `⏱️ 각인: ${(activeItem.encode_duration_ms / 1000).toFixed(1)}s`;
      }
    }, 100);
  }

  function stopEncodeTimers() {
    if (AppState.encodeTimerInterval) {
      clearInterval(AppState.encodeTimerInterval);
      AppState.encodeTimerInterval = null;
    }
    AppState.activeCardFocusStamp = 0;
  }

  // =========================================================================
  // 9. [STAGE 3] 1:1 밀리초(ms) 정밀 반응속도 인출 프로브 (Recall Probe)
  // =========================================================================
  function startRecallProbeStage() {
    stopEncodeTimers();
    if (!AppState.sessionWords || AppState.sessionWords.length === 0) return;

    // 순서 기억 효과를 배제하기 위해 프로브 순서를 무작위 셔플
    AppState.probeQueue = [...AppState.sessionWords].sort(() => Math.random() - 0.5);
    AppState.probeIdx = 0;
    AppState.probeResults = [];

    setRLStage(3);
    presentNextProbeStimulus();
  }

  function presentNextProbeStimulus() {
    if (AppState.probeRafId) {
      cancelAnimationFrame(AppState.probeRafId);
      AppState.probeRafId = null;
    }

    if (AppState.probeIdx >= AppState.probeQueue.length) {
      finishProbeAndSubmitRL();
      return;
    }

    const currentItem = AppState.probeQueue[AppState.probeIdx];
    const total = AppState.probeQueue.length;

    document.getElementById("probeCurrentIdx").textContent = AppState.probeIdx + 1;
    document.getElementById("probeTotalCount").textContent = total;
    const pct = Math.round(((AppState.probeIdx + 1) / total) * 100);
    document.getElementById("probeProgressFill").style.width = `${pct}%`;

    const actionMeta = MNEMONIC_ACTIONS[currentItem.selected_action] || MNEMONIC_ACTIONS.ACT_COLLISION;
    document.getElementById("probeActionBadge").textContent = actionMeta.name;
    document.getElementById("probeMnemonicCue").textContent = maskWordInCue(currentItem.user_mnemonic_text, currentItem.word);
    document.getElementById("probeDefinition").textContent = currentItem.definition;

    const hintBox = document.getElementById("probeHintDisplay");
    if (hintBox) {
      hintBox.style.display = "none";
      hintBox.textContent = "";
    }

    const feedbackBanner = document.getElementById("probeInstantFeedback");
    if (feedbackBanner) {
      feedbackBanner.style.display = "none";
    }

    const ttfkPill = document.getElementById("probeTtfkPill");
    if (ttfkPill) ttfkPill.classList.remove("locked");

    const inputEl = document.getElementById("probeAnswerInput");
    if (inputEl) {
      inputEl.value = "";
      inputEl.disabled = false;
      inputEl.focus();
    }

    // 고정밀 performance.now() 타이머 초기화
    AppState.probeStimulusOnset = performance.now();
    AppState.probeFirstKeystroke = 0;
    AppState.probeTtfkLocked = false;
    AppState.probeHintLevel = 0;

    const liveTtfkEl = document.getElementById("probeLiveTtfk");
    function updateLiveTtfkTicker() {
      if (AppState.probeTtfkLocked) return;
      const elapsed = Math.round(performance.now() - AppState.probeStimulusOnset);
      if (liveTtfkEl) liveTtfkEl.textContent = `${elapsed} ms`;
      AppState.probeRafId = requestAnimationFrame(updateLiveTtfkTicker);
    }
    AppState.probeRafId = requestAnimationFrame(updateLiveTtfkTicker);
  }

  function handleProbeKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitCurrentProbeWord(false);
      return;
    }

    // 제어키 제외, 첫 문자 타건 순간 순수 뇌 인출 시간(TTFK) 락인
    if (
      !AppState.probeTtfkLocked &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      e.key.length === 1
    ) {
      AppState.probeFirstKeystroke = performance.now();
      AppState.probeTtfkLocked = true;
      const ttfkMs = Math.round(AppState.probeFirstKeystroke - AppState.probeStimulusOnset);
      const liveTtfkEl = document.getElementById("probeLiveTtfk");
      const ttfkPill = document.getElementById("probeTtfkPill");
      if (liveTtfkEl) liveTtfkEl.textContent = `⚡ ${ttfkMs} ms (포착 완료)`;
      if (ttfkPill) ttfkPill.classList.add("locked");
      SoundFX.tick();
    }
  }

  function showProbeHint() {
    const currentItem = AppState.probeQueue[AppState.probeIdx];
    if (!currentItem) return;

    AppState.probeHintLevel = Math.min(2, AppState.probeHintLevel + 1);
    const hintBox = document.getElementById("probeHintDisplay");
    if (!hintBox) return;

    hintBox.style.display = "block";
    const chosung = extractChosung(currentItem.word);
    if (AppState.probeHintLevel === 1) {
      hintBox.textContent = `💡 초성 힌트 (Lv.1): ${chosung} (${currentItem.word.length}글자)`;
    } else {
      hintBox.textContent = `💡 첫 글자 힌트 (Lv.2): '${currentItem.word.charAt(0)}' 로 시작 (초성: ${chosung})`;
    }
  }

  function submitCurrentProbeWord(isSkipped = false) {
    const currentItem = AppState.probeQueue[AppState.probeIdx];
    if (!currentItem) return;

    const inputEl = document.getElementById("probeAnswerInput");
    if (inputEl && inputEl.disabled) return; // 중복 제출 방지
    if (inputEl) inputEl.disabled = true;

    if (AppState.probeRafId) {
      cancelAnimationFrame(AppState.probeRafId);
      AppState.probeRafId = null;
    }

    const now = performance.now();
    const userAnswer = isSkipped ? "(기억 안남)" : (inputEl ? inputEl.value.trim() : "");
    const isCorrect = !isSkipped && checkAnswerMatch(currentItem.word, userAnswer);

    const ttfkMs = AppState.probeFirstKeystroke > 0
      ? AppState.probeFirstKeystroke - AppState.probeStimulusOnset
      : now - AppState.probeStimulusOnset;

    const typingDurationMs = AppState.probeFirstKeystroke > 0
      ? Math.max(50, now - AppState.probeFirstKeystroke)
      : 0;

    const rw = computeClientRLReward(isCorrect, ttfkMs, currentItem.encode_duration_ms, AppState.probeHintLevel);

    if (isCorrect) SoundFX.success();
    else SoundFX.fail();

    AppState.probeResults.push({
      word: currentItem.word,
      definition: currentItem.definition,
      visual_anchor: currentItem.visual_anchor,
      action_type: currentItem.selected_action,
      user_mnemonic_text: currentItem.user_mnemonic_text,
      is_user_modified: currentItem.is_user_modified,
      encode_duration_ms: Math.round(currentItem.encode_duration_ms),
      ttfk_ms: Math.round(ttfkMs),
      typing_duration_ms: Math.round(typingDurationMs),
      is_correct: isCorrect,
      user_answer: userAnswer,
      hint_level: AppState.probeHintLevel,
      reward_score: rw.reward,
      grade: rw.grade
    });

    // 즉각 보상 피드백 배너 표시
    const feedbackBanner = document.getElementById("probeInstantFeedback");
    if (feedbackBanner) {
      feedbackBanner.style.display = "flex";
      feedbackBanner.className = `probe-feedback-banner ${isCorrect ? "fb-correct" : "fb-wrong"}`;
      const sign = rw.reward >= 0 ? "+" : "";
      feedbackBanner.innerHTML = isCorrect
        ? `<span>✅ <strong>정답! (${currentItem.word})</strong> — 반응속도 TTFK <strong>${Math.round(ttfkMs)}ms</strong></span>
           <span>보상 R = <strong>${sign}${rw.reward.toFixed(2)}</strong> [${rw.grade}]</span>`
        : `<span>❌ <strong>오답 (정답: ${currentItem.word})</strong> — 입력: ${userAnswer || "없음"}</span>
           <span>보상 R = <strong>${rw.reward.toFixed(2)}</strong> [REJECTED · 우선 복습 등록]</span>`;
    }

    setTimeout(() => {
      AppState.probeIdx++;
      presentNextProbeStimulus();
    }, 680);
  }

  // =========================================================================
  // 10. [STAGE 4] 강화학습(RL) 결과 제출 & 보상/Bandit 리포트 렌더링
  // =========================================================================
  async function finishProbeAndSubmitRL() {
    setRLStage(4);

    // 1. 로컬 스토어 즉시 기록 (오프라인 호환)
    const localRes = LocalRLStore.recordSession(
      AppState.selectedTopic,
      AppState.selectedCategory,
      AppState.probeResults
    );

    let finalTrajectories = localRes.trajectories;
    let updatedPolicy = localRes.updated_bandit_policy;

    // 2. 서버 API 동기화
    try {
      const res = await fetch("/api/rl/submit-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: AppState.sessionId,
          topic: AppState.selectedTopic,
          topic_category: AppState.selectedCategory,
          items: AppState.probeResults
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result) {
          finalTrajectories = data.result.trajectories || finalTrajectories;
          updatedPolicy = data.result.updated_bandit_policy || updatedPolicy;
        }
      }
    } catch (_) {}

    refreshSetupBanditBanner(updatedPolicy);
    renderStage4Report(finalTrajectories, updatedPolicy);
    updateHeaderTrajBadge();
  }

  function renderStage4Report(trajectories, banditPolicy) {
    const total = trajectories.length || 1;
    const correctItems = trajectories.filter((t) => t.is_correct);
    const accuracy = Math.round((correctItems.length / total) * 100);

    const avgTtfk = correctItems.length > 0
      ? Math.round(correctItems.reduce((acc, c) => acc + Number(c.ttfk_ms || 0), 0) / correctItems.length)
      : 0;

    const meanReward = (
      trajectories.reduce((acc, t) => acc + Number(t.reward_score || 0), 0) / total
    ).toFixed(2);

    const chosenCnt = trajectories.filter((t) => t.grade === "CHOSEN").length;
    const rejectedCnt = trajectories.filter((t) => t.grade === "REJECTED" || t.grade === "LOW_REWARD").length;

    document.getElementById("repAvgTtfk").textContent = avgTtfk > 0 ? `${avgTtfk} ms` : "- ms";
    const speedCommentEl = document.getElementById("repSpeedComment");
    if (speedCommentEl) {
      if (avgTtfk === 0) speedCommentEl.textContent = "정답 인출 샘플 없음";
      else if (avgTtfk <= 950) speedCommentEl.textContent = "⚡ 초고속 신경 인출 (장기기억 고착)";
      else if (avgTtfk <= 1800) speedCommentEl.textContent = "✅ 안정적 연상 인출 속도";
      else speedCommentEl.textContent = "🐢 인출 지연 발생 (연상 압축 권장)";
    }

    document.getElementById("repAccuracy").textContent = `${accuracy}%`;
    document.getElementById("repCorrectCount").textContent = `${correctItems.length} / ${trajectories.length} 단어 성공`;
    const sign = Number(meanReward) >= 0 ? "+" : "";
    document.getElementById("repMeanReward").textContent = `${sign}${meanReward}`;
    document.getElementById("repChosenRejected").textContent = `${chosenCnt} / ${rejectedCnt}`;

    // 상세 궤적 테이블 렌더링
    const tbody = document.getElementById("repTrajectoryTableBody");
    if (tbody) {
      tbody.innerHTML = trajectories
        .map((t) => {
          const rSign = Number(t.reward_score) >= 0 ? "+" : "";
          const gradeClass = `grade-${(t.grade || "NEUTRAL").toLowerCase()}`;
          const actMeta = MNEMONIC_ACTIONS[t.action_type] || MNEMONIC_ACTIONS.ACT_COLLISION;
          return `
            <tr>
              <td><strong>${t.word}</strong></td>
              <td><span class="action-tag-mini">${actMeta.short}</span></td>
              <td class="td-mnemonic">${t.user_mnemonic_text}</td>
              <td>${(Number(t.encode_duration_ms) / 1000).toFixed(1)}s</td>
              <td><strong>${Math.round(t.ttfk_ms)} ms</strong></td>
              <td>${t.is_correct ? `✅ ${t.user_answer}` : `❌ ${t.user_answer || "미입력"}`}</td>
              <td><strong style="color:${t.reward_score >= 0 ? "#10b981" : "#ef4444"};">${rSign}${Number(t.reward_score).toFixed(2)}</strong></td>
              <td><span class="grade-pill ${gradeClass}">${t.grade}</span></td>
            </tr>
          `;
        })
        .join("");
    }

    renderBanditPolicyGrid("repBanditPolicyGrid", banditPolicy);
  }

  function renderBanditPolicyGrid(containerId, banditPolicy) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const policy = banditPolicy || AppState.banditPolicy || LocalRLStore.getBanditPolicy();
    const ranking = policy.policy_ranking || [];

    container.innerHTML = ranking
      .map((item, idx) => {
        const isTop = idx === 0;
        const rSign = item.mean_reward >= 0 ? "+" : "";
        return `
          <div class="bandit-policy-card ${isTop ? "bandit-top-choice" : ""}">
            <div class="bandit-card-head">
              <span class="bandit-rank-badge">${isTop ? "👑 최적 정책 #1" : `#${idx + 1}`}</span>
              <span class="bandit-sample-cnt">${item.sample_count}회 실험</span>
            </div>
            <h4 class="bandit-card-title">${item.name}</h4>
            <p class="bandit-card-desc">${item.desc}</p>
            <div class="bandit-metrics-row">
              <div>
                <span>기대 승률</span>
                <strong>${item.expected_win_rate}%</strong>
              </div>
              <div>
                <span>평균 TTFK</span>
                <strong>${item.sample_count > 0 ? `${Math.round(item.avg_ttfk_ms)}ms` : "-"}</strong>
              </div>
              <div>
                <span>평균 보상 R</span>
                <strong>${rSign}${Number(item.mean_reward).toFixed(2)}</strong>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // =========================================================================
  // 11. [VIEW 2] 강화학습 텔레메트리 & DPO 데이터셋 대시보드
  // =========================================================================
  async function loadRLDashboard() {
    let dash = null;
    try {
      const res = await fetch("/api/rl/dashboard");
      if (res.ok) {
        const data = await res.json();
        dash = data.dashboard;
      }
    } catch (_) {}

    if (!dash) {
      // 오프라인 로컬 스토어 집계
      const trajs = LocalRLStore.getTrajectories();
      const dpoPairs = LocalRLStore.getDpoPairs();
      const correctList = trajs.filter((t) => t.is_correct);
      const avgTtfk = correctList.length > 0
        ? correctList.reduce((a, b) => a + b.ttfk_ms, 0) / correctList.length
        : 0;
      const bestTtfk = correctList.length > 0
        ? Math.min(...correctList.map((t) => t.ttfk_ms))
        : 0;
      const meanRw = trajs.length > 0
        ? trajs.reduce((a, b) => a + b.reward_score, 0) / trajs.length
        : 0;

      dash = {
        total_trajectories: trajs.length,
        accuracy: trajs.length > 0 ? Number(((correctList.length / trajs.length) * 100).toFixed(1)) : 0,
        avg_ttfk_ms: Number(avgTtfk.toFixed(1)),
        best_ttfk_ms: Number(bestTtfk.toFixed(1)),
        mean_reward: Number(meanRw.toFixed(3)),
        chosen_count: trajs.filter((t) => t.grade === "CHOSEN").length,
        rejected_count: trajs.filter((t) => t.grade === "REJECTED").length,
        dpo_pairs_count: dpoPairs.length,
        bandit_policy: LocalRLStore.getBanditPolicy(),
        recent_trajectories: trajs.slice(0, 40),
        dpo_pairs: dpoPairs.slice(0, 50)
      };
    }

    AppState.lastDashboardData = dash;

    const navTraj = document.getElementById("navTrajCount");
    if (navTraj) navTraj.textContent = dash.total_trajectories || 0;

    document.getElementById("dashTotalTraj").textContent = `${dash.total_trajectories || 0}건`;
    document.getElementById("dashOverallAcc").textContent = `전체 회상 정답률: ${dash.accuracy || 0}%`;
    document.getElementById("dashAvgTtfk").textContent = `${Math.round(dash.avg_ttfk_ms || 0)} ms`;
    document.getElementById("dashBestTtfk").textContent = `최고 반응 기록: ${Math.round(dash.best_ttfk_ms || 0)} ms`;
    const rSign = (dash.mean_reward || 0) >= 0 ? "+" : "";
    document.getElementById("dashMeanReward").textContent = `${rSign}${Number(dash.mean_reward || 0).toFixed(3)}`;
    document.getElementById("dashChosenRatio").textContent = `고보상(Chosen): ${dash.chosen_count || 0}건 / 교정(Rejected): ${dash.rejected_count || 0}건`;
    document.getElementById("dashDpoPairsCount").textContent = `${dash.dpo_pairs_count || 0} 쌍`;

    renderBanditPolicyGrid("dashBanditPolicyGrid", dash.bandit_policy);

    const tbody = document.getElementById("dashRecentTrajBody");
    if (tbody) {
      const list = dash.recent_trajectories || [];
      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--text-muted);">아직 기록된 강화학습 인출 프로브 궤적이 없습니다. [⚡ RL 연상·반응속도 훈련]을 1라운드 진행해 보세요!</td></tr>`;
      } else {
        tbody.innerHTML = list
          .map((t) => {
            const sign = Number(t.reward_score) >= 0 ? "+" : "";
            const actMeta = MNEMONIC_ACTIONS[t.action_type] || MNEMONIC_ACTIONS.ACT_COLLISION;
            const gradeClass = `grade-${(t.grade || "NEUTRAL").toLowerCase()}`;
            const timeStr = (t.created_at || "").slice(5, 16);
            return `
              <tr>
                <td style="font-size:12px; color:var(--text-muted);">${timeStr}</td>
                <td>${t.topic || "-"}</td>
                <td><strong>${t.word}</strong></td>
                <td><span class="action-tag-mini">${actMeta.short}</span></td>
                <td class="td-mnemonic">${t.user_mnemonic_text || ""}</td>
                <td>${Math.round(t.encode_duration_ms || 0)}ms</td>
                <td><strong>${Math.round(t.ttfk_ms || 0)}ms</strong></td>
                <td><strong style="color:${t.reward_score >= 0 ? "#10b981" : "#ef4444"};">${sign}${Number(t.reward_score).toFixed(2)}</strong></td>
                <td><span class="grade-pill ${gradeClass}">${t.grade}</span></td>
              </tr>
            `;
          })
          .join("");
      }
    }
  }

  async function updateHeaderTrajBadge() {
    try {
      const res = await fetch("/api/rl/dashboard");
      if (res.ok) {
        const data = await res.json();
        const cnt = data.dashboard?.total_trajectories || 0;
        const el = document.getElementById("navTrajCount");
        if (el) el.textContent = cnt;
        return;
      }
    } catch (_) {}
    const localCnt = LocalRLStore.getTrajectories().length;
    const el = document.getElementById("navTrajCount");
    if (el) el.textContent = localCnt;
  }

  // 데이터셋 내보내기 (DPO JSONL / Chosen SFT JSONL / Trajectory CSV)
  function downloadBlobFile(filename, content, mimeType = "application/jsonl;charset=utf-8") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportDpoJsonl() {
    const dash = AppState.lastDashboardData;
    const pairs = (dash && dash.dpo_pairs && dash.dpo_pairs.length > 0)
      ? dash.dpo_pairs
      : LocalRLStore.getDpoPairs();

    if (!pairs || pairs.length === 0) {
      alert("아직 생성된 DPO 선호도 쌍(Chosen vs Rejected)이 없습니다.\n훈련 라운드에서 고속 정답(Chosen)과 오답/지연(Rejected)이 발생하면 자동 생성됩니다.");
      return;
    }

    const lines = pairs.map((p) =>
      JSON.stringify({
        prompt: p.prompt,
        chosen: p.chosen_mnemonic,
        rejected: p.rejected_mnemonic,
        metadata: {
          topic: p.topic,
          word: p.word,
          chosen_action: p.chosen_action,
          chosen_ttfk_ms: p.chosen_ttfk_ms,
          chosen_reward: p.chosen_reward,
          rejected_action: p.rejected_action,
          rejected_ttfk_ms: p.rejected_ttfk_ms,
          rejected_reward: p.rejected_reward
        }
      })
    );
    downloadBlobFile(`brainlock_dpo_pairs_${Date.now()}.jsonl`, lines.join("\n"));
  }

  function exportChosenSftJsonl() {
    const dash = AppState.lastDashboardData;
    const trajs = (dash && dash.recent_trajectories && dash.recent_trajectories.length > 0)
      ? dash.recent_trajectories
      : LocalRLStore.getTrajectories();

    const chosenList = trajs.filter((t) => t.grade === "CHOSEN" || t.reward_score >= 0.5);
    if (chosenList.length === 0) {
      alert("아직 고보상(Chosen, R >= 0.50)으로 검증된 연상 궤적이 없습니다.");
      return;
    }

    const lines = chosenList.map((t) =>
      JSON.stringify({
        instruction: `주제 '${t.topic}'의 핵심 용어 '${t.word}'(${t.definition})를 즉시 떠올릴 수 있는 고효율 연상 문장을 작성하세요.`,
        input: `적용 연상 기법: ${(MNEMONIC_ACTIONS[t.action_type] || MNEMONIC_ACTIONS.ACT_COLLISION).name}`,
        output: t.user_mnemonic_text,
        rl_metrics: {
          ttfk_ms: t.ttfk_ms,
          encode_duration_ms: t.encode_duration_ms,
          reward_score: t.reward_score,
          grade: t.grade
        }
      })
    );
    downloadBlobFile(`brainlock_chosen_sft_${Date.now()}.jsonl`, lines.join("\n"));
  }

  function exportTrajectoriesCsv() {
    const dash = AppState.lastDashboardData;
    const trajs = (dash && dash.recent_trajectories && dash.recent_trajectories.length > 0)
      ? dash.recent_trajectories
      : LocalRLStore.getTrajectories();

    if (!trajs || trajs.length === 0) {
      alert("내보낼 강화학습 궤적 데이터가 없습니다.");
      return;
    }

    const headers = ["created_at", "topic", "word", "action_type", "user_mnemonic_text", "encode_duration_ms", "ttfk_ms", "is_correct", "reward_score", "grade"];
    const rows = trajs.map((t) =>
      headers
        .map((h) => `"${String(t[h] != null ? t[h] : "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
    downloadBlobFile(`brainlock_rl_trajectories_${Date.now()}.csv`, csvContent, "text/csv;charset=utf-8");
  }

  // =========================================================================
  // 12. [VIEW 3] 🐒 침팬지 공간 순간 기억력 게임 (기존 보존)
  // =========================================================================
  const SpatialGame = {
    gridSize: 4,
    mode: "adaptive",
    exposureSec: 3.0,
    targetCount: 5,
    maxSpan: 5,
    streak: 0,
    state: "IDLE", // IDLE | MEMORIZE | RECALL
    targets: {}, // { cellIndex: numberOrder }
    expectedNext: 1,
    recallStartTime: 0,
    timerId: null,

    init() {
      document.getElementById("btnStartSpatial")?.addEventListener("click", () => this.startRound());
      document.getElementById("btnResetSpatial")?.addEventListener("click", () => this.resetGame());
      document.getElementById("spatialGridSelect")?.addEventListener("change", (e) => {
        this.gridSize = Number(e.target.value) || 4;
        this.renderIdleGrid();
      });
      this.renderIdleGrid();
    },

    renderIdleGrid() {
      const gridEl = document.getElementById("spatialGridArea");
      if (!gridEl) return;
      this.gridSize = Number(document.getElementById("spatialGridSelect")?.value) || 4;
      gridEl.style.gridTemplateColumns = `repeat(${this.gridSize}, 1fr)`;
      gridEl.innerHTML = "";
      const totalCells = this.gridSize * this.gridSize;
      for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement("div");
        cell.className = "spatial-cell";
        gridEl.appendChild(cell);
      }
    },

    resetGame() {
      if (this.timerId) clearTimeout(this.timerId);
      this.state = "IDLE";
      this.targetCount = 5;
      this.streak = 0;
      document.getElementById("displayTargetCount").textContent = this.targetCount;
      document.getElementById("spatialStatusText").textContent = "훈련 설정 후 [시작] 버튼을 누르세요.";
      document.getElementById("spatialProgressBar").style.width = "0%";
      this.renderIdleGrid();
    },

    startRound() {
      if (this.timerId) clearTimeout(this.timerId);
      this.gridSize = Number(document.getElementById("spatialGridSelect")?.value) || 4;
      this.mode = document.getElementById("spatialModeSelect")?.value || "adaptive";
      this.exposureSec = Number(document.getElementById("spatialTimeSelect")?.value) || 3.0;

      const totalCells = this.gridSize * this.gridSize;
      if (this.targetCount > totalCells - 1) {
        this.targetCount = totalCells - 1;
      }
      document.getElementById("displayTargetCount").textContent = this.targetCount;

      // 무작위 위치 선정
      const indices = Array.from({ length: totalCells }, (_, i) => i).sort(() => Math.random() - 0.5);
      this.targets = {};
      for (let n = 1; n <= this.targetCount; n++) {
        this.targets[indices[n - 1]] = n;
      }

      this.expectedNext = 1;
      this.state = "MEMORIZE";

      const gridEl = document.getElementById("spatialGridArea");
      gridEl.style.gridTemplateColumns = `repeat(${this.gridSize}, 1fr)`;
      gridEl.innerHTML = "";

      for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement("div");
        cell.className = "spatial-cell";
        cell.dataset.idx = i;
        if (this.targets[i]) {
          cell.classList.add("has-target");
          cell.textContent = this.targets[i];
        }
        cell.addEventListener("click", () => this.handleCellClick(i, cell));
        gridEl.appendChild(cell);
      }

      const statusEl = document.getElementById("spatialStatusText");
      const barEl = document.getElementById("spatialProgressBar");

      if (this.mode === "chimp") {
        statusEl.textContent = "🐒 [침팬지 룰] 위치를 기억한 뒤 숫자 1을 터치하면 즉시 가려집니다!";
        barEl.style.transition = "none";
        barEl.style.width = "100%";
      } else {
        statusEl.textContent = `👀 ${this.exposureSec}초 동안 숫자의 공간 위치를 각인하세요!`;
        barEl.style.transition = "none";
        barEl.style.width = "100%";
        requestAnimationFrame(() => {
          barEl.style.transition = `width ${this.exposureSec}s linear`;
          barEl.style.width = "0%";
        });
        this.timerId = setTimeout(() => {
          this.maskTargets();
        }, this.exposureSec * 1000);
      }
    },

    maskTargets() {
      if (this.state !== "MEMORIZE") return;
      this.state = "RECALL";
      this.recallStartTime = performance.now();
      document.getElementById("spatialStatusText").textContent = `🎯 1번부터 ${this.targetCount}번까지 순서대로 터치하세요!`;

      document.querySelectorAll("#spatialGridArea .spatial-cell.has-target").forEach((cell) => {
        if (!cell.classList.contains("cleared")) {
          cell.classList.add("masked");
          cell.textContent = "";
        }
      });
    },

    handleCellClick(idx, cellEl) {
      if (this.state === "IDLE") return;
      const num = this.targets[idx];
      if (!num) return;

      // 침팬지 룰에서 1번 클릭 시 즉시 나머지 마스킹
      if (this.state === "MEMORIZE") {
        if (this.mode === "chimp" && num === 1) {
          cellEl.classList.remove("has-target", "masked");
          cellEl.classList.add("cleared");
          cellEl.textContent = "1";
          SoundFX.tick();
          this.expectedNext = 2;
          this.maskTargets();
          if (this.expectedNext > this.targetCount) {
            this.finishSpatialRound(true);
          }
          return;
        }
        return; // 타이머 노출 중에는 클릭 무시
      }

      if (this.state !== "RECALL") return;
      if (cellEl.classList.contains("cleared")) return;

      if (num === this.expectedNext) {
        cellEl.classList.remove("masked");
        cellEl.classList.add("cleared");
        cellEl.textContent = num;
        SoundFX.tick();
        this.expectedNext++;

        if (this.expectedNext > this.targetCount) {
          this.finishSpatialRound(true);
        }
      } else {
        cellEl.classList.remove("masked");
        cellEl.classList.add("wrong");
        cellEl.textContent = num;
        SoundFX.fail();
        this.finishSpatialRound(false);
      }
    },

    async finishSpatialRound(isSuccess) {
      this.state = "IDLE";
      const rtMs = Math.max(100, Math.round(performance.now() - (this.recallStartTime || performance.now())));

      // 모든 숨겨진 타겟 공개
      document.querySelectorAll("#spatialGridArea .spatial-cell").forEach((c) => {
        const idx = Number(c.dataset.idx);
        if (this.targets[idx] && !c.classList.contains("cleared")) {
          c.classList.remove("masked");
          c.textContent = this.targets[idx];
        }
      });

      if (isSuccess) {
        SoundFX.success();
        this.streak++;
        if (this.targetCount > this.maxSpan) this.maxSpan = this.targetCount;
        document.getElementById("spatialStatusText").textContent = `🎉 완벽합니다! (${this.targetCount}개 클리어 · 반응속도 ${rtMs}ms)`;
        if (this.mode === "adaptive") this.targetCount++;
      } else {
        this.streak = 0;
        document.getElementById("spatialStatusText").textContent = `💥 순서 오류! (${this.expectedNext}번 대신 다른 칸을 터치함)`;
        if (this.mode === "adaptive" && this.targetCount > 4) this.targetCount--;
      }

      document.getElementById("displayTargetCount").textContent = this.targetCount;
      document.getElementById("statSpatialMaxSpan").textContent = `${this.maxSpan}개`;
      document.getElementById("statSpatialAvgRt").textContent = `${rtMs}ms`;
      document.getElementById("statSpatialStreak").textContent = `${this.streak}연승`;

      const noSave = document.getElementById("spatialNoSaveCheck")?.checked;
      if (!noSave) {
        try {
          await fetch("/api/save-spatial", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              grid_size: this.gridSize,
              target_count: this.targetCount,
              exposure_sec: this.exposureSec,
              reaction_time_ms: rtMs,
              is_success: isSuccess,
              cleared_count: this.expectedNext - 1
            })
          });
        } catch (_) {}
      }
    }
  };

  // =========================================================================
  // 13. 모달 제어 (106대 주제 카탈로그 / 1,000단어 마이닝 / 설정)
  // =========================================================================
  function openTopicCatalogModal() {
    const modal = document.getElementById("modalTopicCatalog");
    if (!modal) return;
    modal.style.display = "flex";
    renderTopicCatalogModal("ALL", "");
  }

  function renderTopicCatalogModal(selectedCategory = "ALL", searchQuery = "") {
    const catalog = window.TOPICS_CATALOG_106 || [];
    const chipsBox = document.getElementById("catalogCategoryChips");
    const gridBox = document.getElementById("catalogCardsGrid");
    if (!chipsBox || !gridBox) return;

    const categories = ["ALL", ...new Set(catalog.map((t) => t.category || "기타"))];
    chipsBox.innerHTML = categories
      .map((cat) => {
        const active = cat === selectedCategory ? "active" : "";
        const label = cat === "ALL" ? `전체 (${catalog.length})` : cat;
        return `<button type="button" class="cat-filter-chip ${active}" data-cat="${cat}">${label}</button>`;
      })
      .join("");

    chipsBox.querySelectorAll(".cat-filter-chip").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const cat = e.currentTarget.dataset.cat;
        const q = document.getElementById("catalogSearchInput")?.value || "";
        renderTopicCatalogModal(cat, q);
      });
    });

    const qNorm = searchQuery.trim().toLowerCase();
    const filtered = catalog.filter((t) => {
      const matchCat = selectedCategory === "ALL" || t.category === selectedCategory;
      if (!matchCat) return false;
      if (!qNorm) return true;
      const hay = `${t.name} ${t.category} ${t.desc} ${(t.sub_domains || []).join(" ")}`.toLowerCase();
      return hay.includes(qNorm);
    });

    gridBox.innerHTML = filtered
      .map((t) => {
        const cnt = AppState.topicWordCounts[t.name] || 0;
        return `
          <div class="catalog-topic-card" data-topic="${t.name}">
            <div class="catalog-card-top">
              <span class="catalog-icon">${t.icon || "📘"}</span>
              <span class="cat-pill">${t.category}</span>
            </div>
            <strong class="catalog-title">${t.name}</strong>
            <p class="catalog-desc">${t.desc || ""}</p>
            <div class="catalog-footer">
              <span class="bank-count-pill">⛏️ ${cnt}단어</span>
              <span style="font-size:12px; color:#60a5fa; font-weight:600;">선택하기 ➔</span>
            </div>
          </div>
        `;
      })
      .join("");

    gridBox.querySelectorAll(".catalog-topic-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        const chosenTopic = e.currentTarget.dataset.topic;
        const selectEl = document.getElementById("inputTopic");
        if (selectEl) selectEl.value = chosenTopic;
        updateSelectedTopicCard();
        document.getElementById("modalTopicCatalog").style.display = "none";
      });
    });
  }

  // 1,000단어 대량 마이닝 모달 제어
  function openWordBankMinerModal() {
    const modal = document.getElementById("modalWordBankMiner");
    if (!modal) return;
    const minerSelect = document.getElementById("minerTopicSelect");
    if (minerSelect) minerSelect.value = AppState.selectedTopic;
    modal.style.display = "flex";
    pollMinerStatusOnce();
  }

  async function startWordBankMining() {
    const topic = document.getElementById("minerTopicSelect")?.value || AppState.selectedTopic;
    const provider = document.getElementById("selectAiProvider")?.value || "ollama";
    const model = provider === "ollama"
      ? document.getElementById("inputOllamaModel")?.value || "gemma4:e4b"
      : "gemini-2.5-flash";

    try {
      const res = await fetch("/api/word-bank/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          target: AppState.minerTargetCount,
          provider,
          model
        })
      });
      if (res.ok) {
        document.getElementById("btnStartMining").style.display = "none";
        document.getElementById("btnStopMining").style.display = "inline-block";
        if (AppState.minerInterval) clearInterval(AppState.minerInterval);
        AppState.minerInterval = setInterval(pollMinerStatusOnce, 1500);
      }
    } catch (err) {
      alert("마이닝 서버 연결 실패: 로컬 파이썬 서버(app.py)가 실행 중인지 확인하세요.");
    }
  }

  async function stopWordBankMining() {
    const topic = document.getElementById("minerTopicSelect")?.value || AppState.selectedTopic;
    try {
      await fetch("/api/word-bank/mine-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic })
      });
    } catch (_) {}
    if (AppState.minerInterval) {
      clearInterval(AppState.minerInterval);
      AppState.minerInterval = null;
    }
    document.getElementById("btnStartMining").style.display = "inline-block";
    document.getElementById("btnStopMining").style.display = "none";
  }

  async function pollMinerStatusOnce() {
    const topic = document.getElementById("minerTopicSelect")?.value || AppState.selectedTopic;
    try {
      const res = await fetch(`/api/word-bank/mine-status?topic=${encodeURIComponent(topic)}`);
      if (!res.ok) return;
      const data = await res.json();
      const st = data.status || {};
      const current = st.current_count || AppState.topicWordCounts[topic] || 0;
      const target = st.target_count || AppState.minerTargetCount;

      document.getElementById("minerCollectedCount").textContent = current;
      document.getElementById("minerTargetCount").textContent = target;
      const pct = Math.min(100, Math.round((current / Math.max(1, target)) * 100));
      document.getElementById("minerProgressBar").style.width = `${pct}%`;
      document.getElementById("minerCurrentSub").textContent = st.current_sub || "-";
      document.getElementById("minerLastWord").textContent = st.last_word || "-";

      const statusBadge = document.getElementById("minerStatusBadge");
      if (statusBadge) {
        statusBadge.textContent = st.is_running ? "⛏️ 고속 마이닝 중..." : "대기 중 (Idle)";
      }

      if (Array.isArray(st.recent_words) && st.recent_words.length > 0) {
        const chipsBox = document.getElementById("minerHarvestedChips");
        if (chipsBox) {
          chipsBox.innerHTML = st.recent_words
            .slice(-18)
            .map((w) => `<span class="sub-chip">${w}</span>`)
            .join("");
        }
      }

      if (!st.is_running && AppState.minerInterval) {
        clearInterval(AppState.minerInterval);
        AppState.minerInterval = null;
        document.getElementById("btnStartMining").style.display = "inline-block";
        document.getElementById("btnStopMining").style.display = "none";
        initTopicCatalogAndCounts();
      }
    } catch (_) {}
  }

  // =========================================================================
  // 14. 이벤트 바인딩 및 초기화
  // =========================================================================
  function bindAllEvents() {
    // 상단 네비게이션
    document.getElementById("logoHomeBtn")?.addEventListener("click", () => {
      switchView("viewRLTrain");
      setRLStage(1);
    });
    document.getElementById("btnNavRLTrain")?.addEventListener("click", () => switchView("viewRLTrain"));
    document.getElementById("btnNavRLDash")?.addEventListener("click", () => switchView("viewRLDashboard"));
    document.getElementById("btnNavSpatial")?.addEventListener("click", () => switchView("viewSpatial"));
    document.getElementById("btnModeWordBank")?.addEventListener("click", openWordBankMinerModal);

    // 사운드 & 테마 & 설정
    document.getElementById("btnToggleSound")?.addEventListener("click", (e) => {
      SoundFX.enabled = !SoundFX.enabled;
      e.currentTarget.textContent = SoundFX.enabled ? "🔊" : "🔇";
    });
    document.getElementById("btnToggleTheme")?.addEventListener("click", (e) => {
      const root = document.documentElement;
      const cur = root.getAttribute("data-theme") || "dark";
      const next = cur === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      e.currentTarget.textContent = next === "dark" ? "🌙" : "☀️";
    });
    document.getElementById("btnOpenSettings")?.addEventListener("click", () => {
      document.getElementById("settingsModal").style.display = "flex";
    });
    document.getElementById("btnCloseSettings")?.addEventListener("click", () => {
      document.getElementById("settingsModal").style.display = "none";
    });

    // Stage 1: 주제 선택 및 단어 수 선택
    document.getElementById("inputTopic")?.addEventListener("change", updateSelectedTopicCard);
    document.querySelectorAll("#rlWordCountPills .count-pill").forEach((pill) => {
      pill.addEventListener("click", (e) => {
        document.querySelectorAll("#rlWordCountPills .count-pill").forEach((p) => p.classList.remove("active"));
        e.currentTarget.classList.add("active");
        AppState.wordCount = Number(e.currentTarget.dataset.count) || 5;
      });
    });
    document.getElementById("btnStartEncodeStage")?.addEventListener("click", startEncodeStage);

    // Stage 2: 연상 각인 완료 ➔ 프로브 진입
    document.getElementById("btnStartProbeStageTop")?.addEventListener("click", startRecallProbeStage);
    document.getElementById("btnStartProbeStageBottom")?.addEventListener("click", startRecallProbeStage);
    document.getElementById("btnBackToSetup")?.addEventListener("click", () => {
      stopEncodeTimers();
      setRLStage(1);
    });

    // 전역 단축키 (Stage 2에서 Ctrl+Enter 시 즉시 Stage 3 돌입)
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "Enter") {
        const st2 = document.getElementById("rlStageEncode");
        if (st2 && st2.style.display !== "none") {
          e.preventDefault();
          startRecallProbeStage();
        }
      }
    });

    // Stage 3: 1:1 반응속도 프로브 이벤트
    document.getElementById("probeAnswerInput")?.addEventListener("keydown", handleProbeKeydown);
    document.getElementById("btnProbeHintChosung")?.addEventListener("click", showProbeHint);
    document.getElementById("btnProbeSkipWord")?.addEventListener("click", () => submitCurrentProbeWord(true));
    document.getElementById("btnProbeSubmitWord")?.addEventListener("click", () => submitCurrentProbeWord(false));

    // Stage 4: 다음 라운드 즉시 시작
    document.getElementById("btnNextRLRound")?.addEventListener("click", startEncodeStage);

    // 대시보드 내보내기 버튼
    document.getElementById("btnExportDpoJsonl")?.addEventListener("click", exportDpoJsonl);
    document.getElementById("btnExportSftJsonl")?.addEventListener("click", exportChosenSftJsonl);
    document.getElementById("btnExportTrajCsv")?.addEventListener("click", exportTrajectoriesCsv);
    document.getElementById("btnOpenDpoCodeModal")?.addEventListener("click", () => {
      document.getElementById("modalDpoGuide").style.display = "flex";
    });
    document.getElementById("btnCloseDpoGuide")?.addEventListener("click", () => {
      document.getElementById("modalDpoGuide").style.display = "none";
    });
    document.getElementById("btnCopyDpoCode")?.addEventListener("click", () => {
      const code = document.getElementById("dpoCodePre")?.textContent || "";
      navigator.clipboard?.writeText(code);
      alert("Unsloth DPO 강화학습 파이썬 코드가 클립보드에 복사되었습니다!");
    });

    // 카탈로그 모달
    document.getElementById("btnOpenTopicCatalog")?.addEventListener("click", openTopicCatalogModal);
    document.getElementById("btnCloseTopicCatalog")?.addEventListener("click", () => {
      document.getElementById("modalTopicCatalog").style.display = "none";
    });
    document.getElementById("catalogSearchInput")?.addEventListener("input", (e) => {
      renderTopicCatalogModal("ALL", e.target.value);
    });
    document.getElementById("btnOpenMinerFromCatalog")?.addEventListener("click", () => {
      document.getElementById("modalTopicCatalog").style.display = "none";
      openWordBankMinerModal();
    });

    // 1,000단어 마이닝 모달
    document.getElementById("btnCloseWordBankMiner")?.addEventListener("click", () => {
      document.getElementById("modalWordBankMiner").style.display = "none";
    });
    document.querySelectorAll(".miner-target-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".miner-target-btn").forEach((b) => b.classList.remove("active"));
        e.currentTarget.classList.add("active");
        AppState.minerTargetCount = Number(e.currentTarget.dataset.target) || 100;
        document.getElementById("minerTargetCount").textContent = AppState.minerTargetCount;
      });
    });
    document.getElementById("btnStartMining")?.addEventListener("click", startWordBankMining);
    document.getElementById("btnStopMining")?.addEventListener("click", stopWordBankMining);

    // AI 설정 저장 및 VRAM 언로드
    document.getElementById("btnSaveSettings")?.addEventListener("click", async () => {
      const provider = document.getElementById("selectAiProvider")?.value || "ollama";
      const ollama_url = document.getElementById("inputOllamaUrl")?.value || "http://localhost:11434";
      const ollama_model = document.getElementById("inputOllamaModel")?.value || "gemma4:e4b";
      const gemini_key = document.getElementById("inputGeminiKey")?.value || "";
      try {
        await fetch("/api/set-ai-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, ollama_url, ollama_model, gemini_key })
        });
      } catch (_) {}
      document.getElementById("settingsModal").style.display = "none";
    });

    document.getElementById("btnUnloadVram")?.addEventListener("click", async () => {
      const url = document.getElementById("inputOllamaUrl")?.value || "http://localhost:11434";
      try {
        const res = await fetch("/api/ollama-unload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        alert(`Ollama VRAM 모델 언로드 완료: ${(data.unloaded || []).join(", ") || "해제됨"}`);
      } catch (_) {
        alert("Ollama 서버 연결을 확인하세요.");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindAllEvents();
    initTopicCatalogAndCounts();
    updateHeaderTrajBadge();
    SpatialGame.init();
  });
})();
