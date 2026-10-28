// =================================================================
// 🎵 [상용 유료급] 무지연 Web Audio API 효과음 엔진 (Zero Dependency)
// =================================================================
const SoundEngine = {
  ctx: null,
  enabled: localStorage.getItem('brainlock_sound_enabled') !== 'false',

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },

  playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.15) {
    if (!this.enabled) return;
    try {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  },

  playCorrect() {
    if (!this.enabled) return;
    this.playTone(659.25, 'sine', 0.12, 0.18); // E5
    setTimeout(() => this.playTone(880.00, 'sine', 0.22, 0.22), 80); // A5
  },

  playWrong() {
    if (!this.enabled) return;
    this.playTone(220, 'triangle', 0.15, 0.18);
    setTimeout(() => this.playTone(180, 'triangle', 0.20, 0.16), 90);
  },

  playCombo() {
    if (!this.enabled) return;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 'sine', 0.15, 0.16), idx * 60);
    });
  },

  playClick() {
    if (!this.enabled) return;
    this.playTone(800, 'triangle', 0.04, 0.06);
  },

  playFanfare() {
    if (!this.enabled) return;
    [523.25, 523.25, 523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 'triangle', idx === 5 ? 0.5 : 0.12, 0.2), idx * 80);
    });
  },

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('brainlock_sound_enabled', this.enabled);
    return this.enabled;
  }
};

// 🎊 [상용급] 가벼운 순수 캔버스 축하 콘페티 파티클
function launchCelebrationConfetti() {
  if (document.getElementById('confettiCanvas')) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'confettiCanvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '99999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#ec4899', '#3b82f6'];
  const particles = Array.from({ length: 60 }, () => ({
    x: canvas.width / 2,
    y: canvas.height * 0.4,
    vx: (Math.random() - 0.5) * 14,
    vy: (Math.random() - 0.7) * 16,
    size: Math.random() * 8 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 10
  }));

  let frame = 0;
  function animate() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.4; // 중력
      p.rot += p.rotSpeed;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });

    if (frame < 80) {
      requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  }
  requestAnimationFrame(animate);
}

// 상태 관리 객체
const state = {
  currentView: 'viewDashboard',
  difficulty: 'easy',       // easy, normal, hard
  activeTab: 'topic',       // topic, text
  wordCount: 5,
  
  // 현재 로그인 사용자 (저장된 정보가 없으면 null)
  currentUser: JSON.parse(localStorage.getItem('brainlock_user') || 'null'),
  authMode: 'login', // login, register

  // 현재 세션 데이터
  sessionData: {
    quiz_data: [],
    user_story: '',
    history: []
  },
  
  // PDF 파일 객체 캐싱
  selectedPdfBase64: null,
  selectedPdfName: '',

  // 암기/테스트 진행 상태
  currentCardIdx: 0,
  memorizeStartTime: 0,
  memorizeDuration: 0,
  memorizeTimerId: null,
  isZenMode: false,
  
  testStartTime: 0,
  testDuration: 0,
  testTimerId: null,
  userTags: [],
  hintsOpened: false,

  // [신규] 누적 마스터 단어 및 오답 관리
  learnedWordsList: [],
  lastWrongQuizData: [],

  // [신규] 4지선다 객관식 퀴즈 상태
  mcqIndex: 0,
  mcqScore: 0,
  mcqWordCount: 10, // 퀴즈 최소 10개 단위 시작
  mcqStartTime: 0,
  mcqDuration: 0,
  mcqTimerId: null,
  mcqResults: []
};

// =================================================================
// 🌐 100% 서버리스 클라이언트 엔진 (GitHub Pages + Google Sheets + Gemini)
// =================================================================
const SERVERLESS_CONFIG = {
  getModel: () => localStorage.getItem('brainlock_ai_model') || 'gemini-2.5-flash',
  getGeminiKey: () => localStorage.getItem('brainlock_gemini_key') || '',
  getSheetUrl: () => localStorage.getItem('brainlock_sheet_url') || '',
  // 🌐 로컬 파일(file:) 또는 GitHub Pages(github.io) 접속 시 100% 서버리스 경량 모드로 동작!
  isStandalone: () => window.location.protocol === 'file:' || window.location.origin.includes('github.io')
};

// 한글 초성 분리 유틸
function extractChosung(text) {
  const chosungs = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  let res = "";
  for (let i = 0; i < (text || '').length; i++) {
    const code = text.charCodeAt(i) - 44032;
    if (code >= 0 && code <= 11171) {
      res += chosungs[Math.floor(code / 588)];
    } else {
      res += text[i];
    }
  }
  return res;
}

// 순수 브라우저 Gemini API REST 호출 (동적 모델 & 실시간 키 대응)
async function callGeminiClient(prompt, temperature = 0.9) {
  const key = SERVERLESS_CONFIG.getGeminiKey();
  const model = SERVERLESS_CONFIG.getModel();

  if (!key) {
    console.log('Gemini API Key 미입력 -> 오프라인 내장 단어장 엔진으로 자동 전환');
    throw new Error('API Key 누락 (오프라인 폴백 전환)');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      response_mime_type: "application/json",
      temperature: temperature
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.error?.message || `HTTP ${res.status}`;
    if (res.status === 403) {
      alert(`⚠️ API Key 권한 오류: ${errMsg}\n우측 상단 ⚙️ 설정에서 본인의 올바른 Gemini API Key를 등록해주세요.`);
    } else if (res.status === 404) {
      alert(`⚠️ 선택하신 모델 [${model}]은 현재 사용이 불가능합니다.\n우측 상단 ⚙️ 설정에서 [Gemini 2.5 Flash]로 변경해주세요.`);
    } else {
      alert(`⚠️ Gemini API 오류 (${res.status}): ${errMsg}`);
    }
    throw new Error(`Gemini API Error: ${errMsg}`);
  }

  const json = await res.json();
  const part = json.candidates?.[0]?.content?.parts?.find(p => p.text) || json.candidates?.[0]?.content?.parts?.[0];
  let textContent = (part?.text || '').trim();

  // 마크다운 코드블록(```json ... ```) 안전 제거
  if (textContent.startsWith('```')) {
    textContent = textContent.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }

  return JSON.parse(textContent);
}

// =================================================================
// 📚 오프라인 내장 엄선 단어 라이브러리 (API 불가 / 오프라인 완전 대응)
// =================================================================
const OFFLINE_BUILTIN_SETS = {
  "전자기학": [
    { word: "전계", definition: "전하가 놓였을 때 전기력이 작용하는 공간", importance_reason: "쿨롱의 법칙과 전위 계산의 기초", visual_anchor: "⚡ 뿜어져 나오는 번개 그물" },
    { word: "자계", definition: "자석이나 전류 주변에 자기력이 작용하는 공간", importance_reason: "전자석과 모터의 구동 원리", visual_anchor: "🧲 나침반을 돌리는 거대 자석" },
    { word: "맥스웰방정식", definition: "전기장과 자기장의 상호작용을 통합한 4대 방정식", importance_reason: "빛과 전파의 본질을 설명함", visual_anchor: "📜 전자기의 4대 천왕 비급" },
    { word: "유전율", definition: "물질이 전하를 유도하여 전기장을 축적하는 정도", importance_reason: "커패시터 용량 결정 핵심 계수", visual_anchor: "🧽 전기를 머금는 스펀지" },
    { word: "투자율", definition: "물질이 자기력선을 얼마나 잘 통과시키는지를 나타내는 척도", importance_reason: "변압기 철심 설계의 핵심", visual_anchor: "🚪 자석 통로를 여는 황금문" },
    { word: "패러데이법칙", definition: "자기장의 시간적 변화가 전압을 유도한다는 전자기 유도 법칙", importance_reason: "발전기와 변압기의 기본 원리", visual_anchor: "🌀 코일 안을 통과하는 자석" },
    { word: "렌츠의법칙", definition: "유도 기전력은 자기 선속의 변화를 방해하는 방향으로 발생한다는 법칙", importance_reason: "에너지 보존과 방향 결정", visual_anchor: "🛡️ 밀어내는 반발 방패" },
    { word: "쿨롱의법칙", definition: "두 전하 사이에 작용하는 정전기적 인력과 척도를 나타낸 법칙", importance_reason: "정전기학의 가장 기본이 되는 식", visual_anchor: "⚖️ 전하를 저울질하는 천칭" },
    { word: "가우스법칙", definition: "폐곡면을 통과하는 총 전속은 내부 전하량과 같다는 법칙", importance_reason: "대칭적인 전계 계산의 지름길", visual_anchor: "🔮 전하를 가둔 수정구슬" },
    { word: "포인팅벡터", definition: "전자기파가 단위 시간당 전달하는 에너지 흐름의 방향과 크기", importance_reason: "무선 통신 에너지 전송의 척도", visual_anchor: "➡️ 에너지를 실어나르는 화살" },
    { word: "로렌츠힘", definition: "자기장 속에서 운동하는 하전입자가 받는 전자기력", importance_reason: "모터와 입자 가속기의 기본 원리", visual_anchor: "🥊 궤적을 꺾는 복싱 글러브" },
    { word: "비오사바르법칙", definition: "미소 전류 요소가 생성하는 자기장의 세기를 구하는 법칙", importance_reason: "임의 도선의 자계 계산", visual_anchor: "📏 전류선을 재는 황금 자" },
    { word: "앙페르법칙", definition: "폐곡선을 따라 자기장을 선적분하면 내부 전류와 같다는 법칙", importance_reason: "원형 도선 및 솔레노이드 자계 계산", visual_anchor: "🔄 전선을 감싸는 나선 고리" },
    { word: "인덕턴스", definition: "전류의 변화에 반발하여 유도 기전력을 생성하는 능력", importance_reason: "코일의 에너지 저장 지표", visual_anchor: "🌀 회전하며 버티는 용수철" },
    { word: "커패시턴스", definition: "전압이 인가되었을 때 전하를 축적할 수 있는 능력", importance_reason: "콘덴서의 핵심 사양", visual_anchor: "🔋 전하를 채우는 황금 물탱크" },
    { word: "변위전류", definition: "유전체나 진공에서 전속밀도의 시간적 변화로 흐르는 가상 전류", importance_reason: "맥스웰의 전자기파 예견 핵심", visual_anchor: "🌊 절연체를 뚫는 유령 전류" },
    { word: "와전류", definition: "변화하는 자기장에 의해 도체 내부에 소용돌이 형태로 흐르는 유도전류", importance_reason: "철심 손실 및 인덕션 히팅의 원인", visual_anchor: "🌪️ 쇠판 위의 불꽃 소용돌이" },
    { word: "표피효과", definition: "고주파 교류 전류가 도체의 바깥쪽 표면으로만 쏠려 흐르는 현상", importance_reason: "고주파 케이블 설계의 필수 고려", visual_anchor: "🧅 양파 껍질로 번지는 불꽃" },
    { word: "자화율", definition: "외부 자기장에 의해 물질이 자성을 띠는 정도", importance_reason: "강자성체와 상자성체의 분류 기준", visual_anchor: "🧲 자성을 흡수하는 자석 젤리" },
    { word: "정전용량", definition: "도체가 단위 전위당 보유할 수 있는 전하의 총량", importance_reason: "정전 결합 및 전위 장벽 분석", visual_anchor: "📦 전하를 담는 보관함" }
  ],
  "거시경제학": [
    { word: "인플레이션", definition: "물가가 지속적으로 상승하여 화폐 가치가 하락하는 현상", importance_reason: "중앙은행 금리 정책의 1차 목표", visual_anchor: "🎈 하늘로 솟구치는 거대 풍선" },
    { word: "기준금리", definition: "중앙은행이 시중은행과 거래할 때 기준이 되는 정책 금리", importance_reason: "국가 유동성 공급의 메인 수도꼭지", visual_anchor: "🏦 중앙은행의 거대 수도 밸브" },
    { word: "GDP", definition: "일정 기간 동안 한 나라 안에서 생산된 최종 생산물의 시장가치", importance_reason: "국가 경제 규모와 성장률 측정 척도", visual_anchor: "📈 솟아오르는 황금 피라미드" },
    { word: "필립스곡선", definition: "실업률과 인플레이션율 간의 단기 역(음)의 상관관계", importance_reason: "경기 부양과 물가 안정의 딜레마", visual_anchor: "🎢 급경사 롤러코스터" },
    { word: "양적완화", definition: "중앙은행이 채권을 직접 매입하여 시장에 유동성을 공급하는 정책", importance_reason: "초저금리 한계 극복 비전통 통화정책", visual_anchor: "💸 하늘에서 쏟아지는 지폐비" },
    { word: "스태그플레이션", definition: "경기 침체와 고물가가 동시에 발생하는 최악의 경제 국면", importance_reason: "전통적 통화정책의 딜레마 유발", visual_anchor: "🧊 뜨거운 불길 속의 얼음산" },
    { word: "통화승수", definition: "본원통화 1단위가 공급되었을 때 창출되는 통화량의 배수", importance_reason: "은행 신용창조 능력 측정", visual_anchor: "🪄 돈을 복제하는 마법 지팡이" },
    { word: "유동성함정", definition: "금리를 아무리 낮춰도 소비와 투자가 늘지 않는 경제 상태", importance_reason: "통화정책 무력화 국면", visual_anchor: "🕳️ 동전이 빨려 들어가는 블랙홀" },
    { word: "IS-LM모형", definition: "재화 시장(IS)과 화폐 시장(LM)의 동시 균형을 분석하는 틀", importance_reason: "재정정책과 통화정책 효과 비교", visual_anchor: "⚖️ 교차하는 황금 저울대" },
    { word: "테이퍼링", definition: "중앙은행이 양적완화 자산 매입 규모를 점진적으로 축소하는 것", importance_reason: "긴축 국면 전환의 사전 신호", visual_anchor: "📉 가늘어지는 기름 호스" },
    { word: "총수요", definition: "한 경제 내의 모든 경제주체가 소비·투자하고자 하는 총 재화의 합", importance_reason: "단기 경기 변동의 핵심 동인", visual_anchor: "🛒 전 국민의 거대 장바구니" },
    { word: "총공급", definition: "한 경제의 모든 생산자가 판매하고자 하는 재화와 용역의 총량", importance_reason: "잠재 GDP와 생산성 한계 결정", visual_anchor: "🏭 풀가동되는 거대 공장 굴뚝" },
    { word: "기저효과", definition: "비교 기준 시점의 수치가 너무 낮거나 높아 착시를 일으키는 현상", importance_reason: "경제 지표 해석 오류 방지", visual_anchor: "🪜 발판이 꺼진 사다리" },
    { word: "디플레이션", definition: "물가가 지속적으로 하락하여 경기 침체가 심화되는 현상", importance_reason: "소비 지연과 부채 부담 가중", visual_anchor: "📉 얼어붙어 굳어버린 물가계" },
    { word: "환율", definition: "자국 화폐와 외국 화폐 간의 교환 비율", importance_reason: "수출입 경쟁력과 외환 건전성 결정", visual_anchor: "💱 달러와 원화가 춤추는 시소" },
    { word: "경상수지", definition: "국가 간 상품과 서비스 등의 거래로 발생한 수입과 지출의 차액", importance_reason: "대외 건전성과 통화 가치 지탱", visual_anchor: "🚢 항구에 들어서는 황금 컨테이너" },
    { word: "구매력평가", definition: "동일한 재화는 모든 국가에서 같은 가격이어야 한다는 이론", importance_reason: "빅맥 지수 등 적정 환율 산정", visual_anchor: "🍔 국가별 가격표가 붙은 빅맥" },
    { word: "본원통화", definition: "중앙은행이 발행한 현금통화와 시중은행의 지급준비금의 합계", importance_reason: "시중 통화 공급의 원천", visual_anchor: "🏛️ 한국은행 금고의 황금 주화" },
    { word: "구축효과", definition: "정부 지출 증가가 이자율을 상승시켜 민간 투자를 위축시키는 현상", importance_reason: "재정지출 효과 상쇄 요인", visual_anchor: "🐘 민간 의자를 밀어내는 코끼리" },
    { word: "잠재GDP", definition: "물가 상승 압력 없이 모든 생산 요소를 완전 고용했을 때의 생산량", importance_reason: "경기 과열 및 침체(GDP 갭) 판단", visual_anchor: "🎯 최고 출력 한계선 계기판" }
  ],
  "뇌과학": [
    { word: "해마", definition: "새로운 기억의 형성 및 장기 기억 전환을 총괄하는 기관", importance_reason: "학습과 기억 형성의 관문", visual_anchor: "🌊 푸른 바다의 해마" },
    { word: "시냅스가소성", definition: "학습에 따라 뉴런 간 연결 강도가 변하는 특성", importance_reason: "두뇌 훈련을 통한 뇌 회로 재구성", visual_anchor: "⚡ 번쩍이는 신경 스파크" },
    { word: "전전두엽", definition: "의사결정, 충동 조절, 고차원 계획을 담당하는 뇌 영역", importance_reason: "집중력과 실행기능의 총사령관", visual_anchor: "👑 이마 위의 황금 왕관" },
    { word: "도파민", definition: "성취감과 보상 회로를 자극하는 신경전달물질", importance_reason: "학습 동기부여와 몰입 유지", visual_anchor: "🎯 타오르는 과녁 불꽃" },
    { word: "편도체", definition: "공포, 분노 등 감정적 반응을 처리하는 뇌 중심부", importance_reason: "기억에 감정적 낙인을 찍음", visual_anchor: "🔥 붉게 달아오른 아몬드" },
    { word: "미엘린", definition: "신경 섬유를 감싸 신호 전달 속도를 100배 높이는 절연 물질", importance_reason: "반복 연습을 통해 숙달되는 메커니즘", visual_anchor: "🧈 전선을 감싼 두꺼운 버터" },
    { word: "신경발생", definition: "성인이 된 후에도 해마에서 새로운 뇌세포가 생성되는 현상", importance_reason: "평생 두뇌 발달의 과학적 증거", visual_anchor: "🌿 뇌 속에서 자라나는 새싹" },
    { word: "아세틸콜린", definition: "주의 집중과 각성을 높여 학습을 촉진하는 신경물질", importance_reason: "공부 집중력의 핵심 촉매", visual_anchor: "💡 환하게 켜지는 집중 전구" },
    { word: "디폴트모드", definition: "멍때리거나 쉴 때 활성화되어 정보를 정리하는 뇌 네트워크", importance_reason: "휴식 중 창의적 영감의 원천", visual_anchor: "☁️ 뭉게구름 속 안식처" },
    { word: "코르티솔", definition: "만성 스트레스 시 분비되어 해마를 위축시키는 호르몬", importance_reason: "학습 효율을 떨어뜨리는 주범", visual_anchor: "🧪 부식성 산성 용액" },
    { word: "뉴런", definition: "전기 및 화학 신호를 통해 정보를 전달하는 신경계 기본 단위", importance_reason: "모든 두뇌 사고 활동의 기초 세포", visual_anchor: "💡 반짝이는 은빛 세포 나무" },
    { word: "축삭돌기", definition: "신경세포체에서 다른 뉴런으로 전기 신호를 내보내는 긴 섬유", importance_reason: "정보 고속 송출 전선", visual_anchor: "⚡ 뻗어나가는 고압 송전선" },
    { word: "수상돌기", definition: "다른 뉴런으로부터 신호를 받아들이는 나뭇가지 모양의 돌기", importance_reason: "정보 수신 안테나 역할", visual_anchor: "📡 신호를 받는 나뭇가지 안테나" },
    { word: "세로토닌", definition: "기분 안정, 수면, 행복감을 조절하는 대표 신경전달물질", importance_reason: "정서적 회복탄력성과 평온 유지", visual_anchor: "☀️ 따스하게 비추는 아침 햇살" },
    { word: "글루타메이트", definition: "뇌에서 가장 강력하고 흔한 흥분성 신경전달물질", importance_reason: "장기 기억 강화(LTP)의 주역", visual_anchor: "🚀 엔진을 점화하는 로켓 연료" },
    { word: "GABA", definition: "과도한 신경 흥분을 억제하여 뇌를 진정시키는 억제성 물질", importance_reason: "불안 완화와 뇌 과부하 차단", visual_anchor: "🛑 급제동을 거는 브레이크 패드" },
    { word: "소뇌", definition: "정밀한 근육 운동, 균형감각, 절차 기억을 담당하는 후하부 뇌", importance_reason: "몸으로 익힌 자전거 타기 등 숙달 기억", visual_anchor: "🎪 외줄 타는 곡예사의 균형봉" },
    { word: "시상", definition: "후각을 제외한 모든 감각 신호가 대뇌피질로 가기 전 거치는 중계소", importance_reason: "감각 정보의 종합 교통 관제탑", visual_anchor: "🚦 감각 신호를 분류하는 중앙역" },
    { word: "뇌가소성", definition: "경험과 훈련에 반응하여 뇌 구조와 기능이 끊임없이 재구성되는 성질", importance_reason: "성인 이후에도 학습이 가능한 근거", visual_anchor: "🏺 원하는 대로 빚는 부드러운 점토" },
    { word: "거울뉴런", definition: "타인의 행동을 보기만 해도 자신이 행동할 때처럼 반응하는 신경세포", importance_reason: "모방 학습과 공감 능력의 뿌리", visual_anchor: "🪞 상대방을 똑같이 비추는 거울" }
  ],
  "민법총칙": [
    { word: "법률행위", definition: "의사표시를 요소로 하여 법률효과를 발생시키는 행위", importance_reason: "사적자치의 원칙을 실현하는 핵심 수단", visual_anchor: "📜 도장이 찍힌 정식 계약서" },
    { word: "소멸시효", definition: "권리자가 권리를 행사할 수 있음에도 방치하여 권리가 소멸하는 제도", importance_reason: "법적 안정성과 거래 질서 보호", visual_anchor: "⏳ 모래가 다 떨어진 모래시계" },
    { word: "권리능력", definition: "권리의 주체가 되어 권리를 누리고 의무를 질 수 있는 법적 자격", importance_reason: "자연인과 법인의 법적 지위 기본", visual_anchor: "🛡️ 전신을 감싸는 황금 방패" },
    { word: "의사표시", definition: "일정한 법률효과 발생을 의욕하고 이를 외부에 나타내는 행위", importance_reason: "계약 성립의 핵심 구성요소", visual_anchor: "🗣️ 입에서 나오는 황금 문서" },
    { word: "대리", definition: "타인이 본인의 이름으로 법률행위를 하여 본인에게 효과를 귀속시키는 제도", importance_reason: "사적자치의 확장 및 보충", visual_anchor: "🤝 본인의 위임장을 든 대리인" },
    { word: "무효", definition: "법률행위가 성립 당시부터 당연히 법률상 아무런 효력이 없는 상태", importance_reason: "강행규정 위반 및 반사회질서 행위 차단", visual_anchor: "💨 연기처럼 사라지는 계약서" },
    { word: "취소", definition: "일단 유효하게 성립한 법률행위의 효력을 소급하여 무효로 만드는 것", importance_reason: "제한능력자, 착오, 사기·강박 시 권리 구제", visual_anchor: "↩️ 되돌리기 화살표 버튼" },
    { word: "조건과기한", definition: "법률행위 효력의 발생·소멸을 장래의 불확실한 사실이나 확실한 때에 의존케 함", importance_reason: "계약 내용의 유연한 조율", visual_anchor: "📅 달력과 주사위 상자" },
    { word: "신의성실원칙", definition: "권리의 행사와 의무의 이행은 신의를 좇아 성실히 하여야 한다는 대원칙", importance_reason: "민법 전체를 관통하는 최고 조리", visual_anchor: "⚖️ 공평한 천칭 저울" },
    { word: "통정허위표시", definition: "상대방과 짜고 거짓으로 한 가짜 의사표시(무효)", importance_reason: "가장매매와 채권자 취소권의 쟁점", visual_anchor: "🎭 속삭이며 쓴 가면" },
    { word: "착오", definition: "표시 내용과 진의가 일치하지 않음을 표의자가 알지 못한 상태", importance_reason: "법률행위 중요부분 취소 요건", visual_anchor: "👓 도수가 엉뚱한 안경" },
    { word: "사기강박", definition: "타인의 기망이나 공포심 유발로 인해 불완전한 의사표시를 한 경우", importance_reason: "의사형성의 자유 침해 구제(취소)", visual_anchor: "🐍 거짓을 속삭이는 뱀" },
    { word: "무권대리", definition: "대리권 없는 자가 대리인이라 칭하며 한 법률행위", importance_reason: "본인의 추인권과 상대방 철회권 대립", visual_anchor: "🃏 가짜 신분증 카드" },
    { word: "추인", definition: "불확정한 법률행위를 사후에 인정하여 유효로 확정짓는 단독행위", importance_reason: "무권대리 행위의 유효화", visual_anchor: "✅ 빨간색 합격 승인 도장" },
    { word: "제척기간", definition: "법률이 정한 권리의 존속기간으로, 경과 시 권리가 소멸함", importance_reason: "소멸시효와 달리 중단이 없음", visual_anchor: "⏱️ 멈추지 않고 달리는 스톱워치" },
    { word: "자연인", definition: "살아있는 인간으로서 태어나서 사망할 때까지 권리능력을 가짐", importance_reason: "법률 주체의 근본", visual_anchor: "👤 숨 쉬는 사람의 실루엣" },
    { word: "법인", definition: "자연인은 아니지만 법률에 의해 권리주체성이 인정된 단체나 재단", importance_reason: "주식회사 및 사단법인 활동의 기반", visual_anchor: "🏢 우뚝 솟은 회사 빌딩" },
    { word: "권리남용금지", definition: "권리가 있더라도 사회적 타당성을 잃고 오직 남을 해칠 목적이면 불허함", importance_reason: "형식적 권리 행사의 남용 제어", visual_anchor: "🚫 칼날을 막는 금지 표지판" },
    { word: "물권법정주의", definition: "물권은 법률 또는 관습법에 의하는 외에는 임의로 창설하지 못함", importance_reason: "거래 안전과 공시 원칙 확립", visual_anchor: "🔒 법전에 못 박힌 자물쇠" },
    { word: "원상회복", definition: "계약 해제 등으로 인해 계약 이전의 본래 상태로 되돌려놓는 의무", importance_reason: "해제의 소급효와 부당이득 반환", visual_anchor: "🔄 물건을 제자리로 돌려주는 손" }
  ],
  "컴퓨터네트워크": [
    { word: "TCP/IP", definition: "인터넷 통신을 지탱하는 표준 전송 제어 및 인터넷 프로토콜 스택", importance_reason: "전 세계 인터넷 통신의 공통 규약", visual_anchor: "🌐 촘촘하게 연결된 지구본 그물망" },
    { word: "DNS", definition: "사람이 읽는 도메인 이름을 컴퓨터용 IP 주소로 변환하는 시스템", importance_reason: "웹 브라우징의 전화번호부", visual_anchor: "📖 황금 전화번호부 책" },
    { word: "라우팅", definition: "패킷이 출발지에서 목적지까지 최적의 경로를 찾아 전달되는 과정", importance_reason: "인터넷 트래픽 경로 최적화", visual_anchor: "🧭 갈림길을 가리키는 나침반" },
    { word: "서브넷마스크", definition: "IP 주소에서 네트워크 영역과 호스트 영역을 구분하는 기준 비트열", importance_reason: "네트워크 분할과 브로드캐스트 제어", visual_anchor: "🎭 IP를 잘라내는 마스크" },
    { word: "패킷", definition: "네트워크를 통해 전송되는 데이터의 기본 전송 단위", importance_reason: "분할 전송과 오류 검출의 단위", visual_anchor: "📦 주소 라벨이 붙은 소포 상자" },
    { word: "3-Way핸드셰이크", definition: "TCP 연결 수립 시 SYN, SYN-ACK, ACK 3단계로 확인하는 절차", importance_reason: "신뢰성 있는 양방향 통신 보장", visual_anchor: "🤝 세 번 맞잡는 신뢰의 악수" },
    { word: "HTTP/HTTPS", definition: "웹 브라우저와 서버 간 하이퍼텍스트 통신 프로토콜(암호화 포함)", importance_reason: "현대 모든 웹 서비스의 기반", visual_anchor: "🔒 자물쇠가 달린 브라우저 창" },
    { word: "소켓", definition: "운영체제가 응용 프로그램에게 제공하는 네트워크 통신 끝점(Endpoint)", importance_reason: "실시간 네트워크 프로그래밍의 접점", visual_anchor: "🔌 벽에 꽂히는 2구 전원 플러그" },
    { word: "NAT", definition: "사설 IP 주소를 하나의 공인 IP 주소로 변환하여 통신케 하는 기술", importance_reason: "IPv4 고갈 방지 및 내부 보안", visual_anchor: "🔄 가면을 바꿔 씌우는 관문" },
    { word: "방화벽", definition: "미리 설정된 보안 규칙에 따라 들어오고 나가는 트래픽을 감시·차단", importance_reason: "네트워크 보안의 제1 방어선", visual_anchor: "🧱 불길을 막는 붉은 벽돌벽" },
    { word: "MAC주소", definition: "네트워크 인터페이스 카드(NIC)에 부여된 고유한 물리적 하드웨어 주소", importance_reason: "2계층 데이터 링크 전송의 식별자", visual_anchor: "🏷️ 랜카드에 각인된 시리얼 바코드" },
    { word: "ARP", definition: "논리적 IP 주소를 물리적 MAC 주소로 매핑해주는 프로토콜", importance_reason: "로컬 LAN 내 장비 간 실제 통신 필수", visual_anchor: "📢 주인을 찾는 확성기" },
    { word: "DHCP", definition: "네트워크에 접속한 단말에게 IP 주소와 설정을 자동으로 동적 할당", importance_reason: "네트워크 수동 설정 번거로움 해소", visual_anchor: "🎫 입장 번호표를 뽑아주는 기계" },
    { word: "로드밸런서", definition: "서버로 몰리는 대규모 트래픽을 여러 대의 서버로 분산시키는 장치", importance_reason: "대용량 고가용성 서비스의 필수품", visual_anchor: "⚖️ 무게를 나누는 공평한 분배기" },
    { word: "SSL/TLS", definition: "전송 계층에서 데이터를 암호화하여 도청과 변조를 방지하는 프로토콜", importance_reason: "전자상거래 및 개인정보 보호 필수", visual_anchor: "🛡️ 데이터를 감싸는 방탄 보호막" },
    { word: "포트포워딩", definition: "외부에서 특정 포트로 들어오는 요청을 내부 사설 IP 장비로 넘김", importance_reason: "공유기 내부 서버 호스팅 필수", visual_anchor: "🚪 비밀 통로를 열어주는 문지기" },
    { word: "MTU", definition: "네트워크 인터페이스에서 한 번에 전송할 수 있는 최대 패킷 크기", importance_reason: "패킷 단편화와 전송 효율 결정", visual_anchor: "📏 짐칸의 최대 높이 제한 바" },
    { word: "ICMP", definition: "네트워크 통신 중 발생하는 오류 보고 및 진단(Ping)을 담당", importance_reason: "네트워크 연결성 점검의 핵심", visual_anchor: "📡 핑을 쏘는 레이더 화면" },
    { word: "게이트웨이", definition: "서로 다른 프로토콜이나 네트워크 세그먼트를 연결해주는 출입 관문", importance_reason: "외부 인터넷으로 나가는 유일한 문", visual_anchor: "⛩️ 국경을 넘는 거대 톨게이트" },
    { word: "VPN", definition: "공용 네트워크 상에 암호화된 가상의 전용 터널을 구축하여 통신", importance_reason: "원격 근무 보안 및 사설망 확장", visual_anchor: "🚇 지하로 뚫린 비밀 콘크리트 터널" }
  ],
  "인공지능": [
    { word: "트랜스포머", definition: "어텐션 메커니즘을 기반으로 한 현대 딥러닝 핵심 아키텍처", importance_reason: "LLM 및 생성형 AI의 근간", visual_anchor: "🤖 변신하는 거대 로봇" },
    { word: "어텐션", definition: "입력 데이터 중 중요한 부분에 동적으로 가중치를 두는 기법", importance_reason: "문맥 파악 및 번역 혁신", visual_anchor: "🔍 환하게 비추는 스포트라이트" },
    { word: "역전파", definition: "출력 오차를 역방향으로 전달하여 가중치를 학습시키는 알고리즘", importance_reason: "인공신경망 훈련의 기본 엔진", visual_anchor: "↩️ 되감기는 나선형 태엽" },
    { word: "과적합", definition: "훈련 데이터에만 지나치게 맞춰져 실전 성능이 떨어지는 현상", importance_reason: "AI 모델 일반화의 최대 적", visual_anchor: "👔 몸에 꽉 끼는 작은 정장" },
    { word: "잠재공간", definition: "데이터의 본질적 특성이 압축된 고차원 벡터 공간", importance_reason: "생성 모델의 데이터 생성 원천", visual_anchor: "🌌 은하수가 펼쳐진 우주" },
    { word: "경사하강법", definition: "손실 함수의 기울기를 따라 최적점을 찾아가는 최적화 방법", importance_reason: "AI 파라미터 튜닝의 나침반", visual_anchor: "⛷️ 안개를 뚫고 활강하는 스키" },
    { word: "손실함수", definition: "인공지능의 예측값과 실제 정답 사이의 오차를 수치화한 척도", importance_reason: "모델의 목표이자 채점 기준", visual_anchor: "🎯 과녁에서 빗나간 거리" },
    { word: "토큰화", definition: "문장을 인공지능이 이해할 수 있는 작은 의미 단위로 쪼개는 과정", importance_reason: "자연어 처리의 첫 번째 관문", visual_anchor: "🧩 쪼개지는 레고 블록" },
    { word: "할루시네이션", definition: "AI가 사실이 아닌 그럴듯한 거짓말을 생성해내는 현상", importance_reason: "생성형 AI 신뢰성의 핵심 과제", visual_anchor: "👻 사막의 신기루 유령" },
    { word: "미세조정", definition: "사전 학습된 거대 모델을 특정 도메인에 맞게 추가 학습시키는 기법", importance_reason: "실무 맞춤형 AI 구축 필수 과정", visual_anchor: "🎻 현악기를 조율하는 튜너" },
    { word: "CNN", definition: "합성곱 연산을 통해 이미지의 국소 특징을 효과적으로 추출하는 신경망", importance_reason: "컴퓨터 비전 분야의 황제", visual_anchor: "🖼️ 돋보기로 스캔하는 격자 필터" },
    { word: "RNN", definition: "순차적 시계열 데이터의 이전 정보를 기억하며 처리하는 순환 신경망", importance_reason: "음성 인식 및 초기 자연어 처리", visual_anchor: "🔄 꼬리를 무는 원형 기차 레일" },
    { word: "가중치", definition: "신경망에서 각 입력 신호의 중요도를 조절하는 학습 파라미터", importance_reason: "AI 지능이 저장되는 물리적 실체", visual_anchor: "⚖️ 각도마다 조절되는 미세 추" },
    { word: "편향", definition: "뉴런이 얼마나 쉽게 활성화되는지를 조절하는 고유 민감도 상수", importance_reason: "출력 기준점 이동을 통한 유연성", visual_anchor: "📐 기울어진 각도 조절판" },
    { word: "임베딩", definition: "단어나 개념을 컴퓨터가 계산할 수 있는 실수 벡터로 변환한 표현", importance_reason: "의미적 유사도 측정의 핵심", visual_anchor: "📍 다차원 공간에 꽂힌 핀" },
    { word: "활성화함수", definition: "입력 신호의 총합을 비선형 출력 신호로 변환하는 함수(ReLU 등)", importance_reason: "신경망에 비선형 표현력 부여", visual_anchor: "⚡ 임계값을 넘으면 켜지는 전등" },
    { word: "드롭아웃", definition: "학습 도중 무작위로 일부 뉴런을 꺼서 과적합을 방지하는 정규화", importance_reason: "뉴런 간 공동적응 차단", visual_anchor: "💤 일부 전구를 끄는 스위치" },
    { word: "GAN", definition: "생성자와 판별자가 서로 경쟁하며 진짜 같은 가짜 데이터를 만드는 모델", importance_reason: "초고화질 이미지 합성 혁신", visual_anchor: "🎨 위조범과 감정사의 대결" },
    { word: "강화학습", definition: "보상과 처벌을 통해 환경과 상호작용하며 최적의 행동 정책을 학습", importance_reason: "알파고 및 로봇 제어의 근간", visual_anchor: "🧀 미로 끝의 치즈를 찾는 쥐" },
    { word: "제로샷학습", definition: "한 번도 명시적으로 훈련받지 않은 새로운 작업도 스스로 추론해 수행", importance_reason: "거대 언어 모델 범용 지능의 징표", visual_anchor: "🪄 설명서 없이 마법을 부리는 마법사" }
  ],
  "기억술": [
    { word: "기억의궁전", definition: "친숙한 공간에 정보를 배치하는 고대 기억술", importance_reason: "공간기억과 시각화 결합의 정점", visual_anchor: "🏛️ 웅장한 대리석 궁전" },
    { word: "시각앵커", definition: "추상적 개념을 구체적 사물로 고정하는 연결고리", importance_reason: "망각을 방지하는 강력한 트리거", visual_anchor: "⚓ 거대한 황금 닻" },
    { word: "정교화부호화", definition: "새 정보를 기존 기억과 연결하여 심층 저장하는 기법", importance_reason: "장기기억 전환율을 극대화함", visual_anchor: "🔗 얽혀있는 황금 사슬" },
    { word: "초두효과", definition: "목록의 맨 앞 정보를 가장 쉽게 기억하는 심리", importance_reason: "암기 순서 배치의 핵심 원리", visual_anchor: "🥇 1등 금메달" },
    { word: "최신효과", definition: "가장 마지막에 접한 정보를 단기기억에서 바로 꺼내 잘 회상하는 현상", importance_reason: "직전 복습의 파괴력", visual_anchor: "🕒 방금 울린 따끈한 알람" },
    { word: "작업기억", definition: "의식적 사고와 정보 처리를 담당하는 단기 두뇌 용량", importance_reason: "전두엽 집중력의 척도", visual_anchor: "💻 번쩍이는 두뇌 RAM" },
    { word: "망각곡선", definition: "시간 경과에 따라 기억이 급격히 소실되는 자연 법칙", importance_reason: "복습 주기를 설계하는 과학적 근거", visual_anchor: "📉 가파른 낭떠러지" },
    { word: "페그시스템", definition: "숫자나 순서에 고정된 말뚝 이미지를 거는 기억법", importance_reason: "순서 기억에 탁월한 효과", visual_anchor: "📌 벽에 박힌 황금 못" },
    { word: "인출단서", definition: "잠들어 있는 기억을 깨워 의식으로 끌어올리는 신호", importance_reason: "시험 볼 때 기억을 끄집어내는 열쇠", visual_anchor: "🗝️ 황금 마스터 키" },
    { word: "메타인지", definition: "자신이 아는 것과 모르는 것을 객관적으로 자각하는 능력", importance_reason: "공부 효율을 3배 높이는 최상위 감각", visual_anchor: "🪞 머릿속을 비추는 거울" },
    { word: "분산학습", definition: "벼락치기 대신 시간을 두고 여러 번 나누어 공부하는 방법", importance_reason: "신경망을 단단하게 굳히는 비결", visual_anchor: "🌱 주기적으로 물을 주는 화분" },
    { word: "청킹", definition: "여러 낱개의 정보를 의미 있는 덩어리로 묶어 기억 용량을 늘리는 기법", importance_reason: "작업기억 한계 돌파", visual_anchor: "🧱 벽돌을 묶은 커다란 블록" },
    { word: "이중부호화", definition: "언어 정보와 시각 이미지를 동시에 결합해 두 개의 경로로 저장", importance_reason: "회상 확률을 2배로 상승시킴", visual_anchor: "🖼️ 그림이 그려진 단어 카드" },
    { word: "간섭이론", definition: "이전에 배운 내용이나 새로 배운 내용이 서로 방해하여 망각을 유발", importance_reason: "학습 과목 간 휴식의 필요성", visual_anchor: "📻 찌지직거리는 잡음 라디오" },
    { word: "간격반복", definition: "망각 직전 시점마다 점진적으로 간격을 늘려가며 복습하는 시스템", importance_reason: "에빙하우스 망각곡선 완벽 정복", visual_anchor: "📅 1일-3일-7일 알림 달력" },
    { word: "공간지각", definition: "위치, 방향, 공간적 관계를 파악하고 머릿속에 지도를 그리는 능력", importance_reason: "기억의 궁전 훈련의 엔진", visual_anchor: "🗺️ 입체 홀로그램 지도" },
    { word: "자가시험효과", definition: "단순히 읽는 것보다 스스로 퀴즈를 풀고 틀려보는 것이 기억에 깊게 남음", importance_reason: "최고의 능동 인출 훈련", visual_anchor: "📝 붉은 채점 펜과 모의고사" },
    { word: "심상화", definition: "개념을 생생한 색상, 감촉, 움직임이 있는 마음속 영상으로 재생", importance_reason: "우뇌 시각 피질의 전면 활용", visual_anchor: "🎬 머릿속에서 상영되는 영화" },
    { word: "부호화특수성", definition: "정보를 입력할 때의 주변 맥락과 인출할 때의 맥락이 같을 때 회상이 극대화", importance_reason: "실제 시험장 환경 시뮬레이션", visual_anchor: "🏷️ 장소와 냄새가 적힌 라벨" },
    { word: "능동회상", definition: "책을 덮고 머릿속에서 능동적으로 정답을 끄집어내는 인출 연습", importance_reason: "수동적 읽기와 차별화된 기억 정착", visual_anchor: "🧲 깊은 우물에서 기억을 낚는 낚싯대" }
  ],
  "한국사": [
    { word: "빗살무늬토기", definition: "신석기 시대를 대표하는 빗살 모양 무늬가 새겨진 뾰족한 토기", importance_reason: "정착 생활과 농경의 시작", visual_anchor: "🏺 모래에 꽂힌 빗살무늬 토기" },
    { word: "고조선", definition: "단군왕검이 아사달에 건국한 우리 역사상 최초의 국가", importance_reason: "홍익인간 이념과 8조법", visual_anchor: "👑 청동검을 든 고조선 군장" },
    { word: "광개토대왕릉비", definition: "고구려 장수왕이 아버지 광개토대왕의 정복 업적을 기려 세운 비석", importance_reason: "고구려의 만주 영토 확장과 천하관", visual_anchor: "🗿 6미터 거대 화강암 비석" },
    { word: "살수대첩", definition: "을지문덕 장군이 살수에서 수나라 30만 대군을 수공으로 궤멸시킨 전투", importance_reason: "고구려의 대수 전쟁 승리", visual_anchor: "🌊 둑이 터져 쏟아지는 강물" },
    { word: "삼국통일", definition: "신라가 당나라와 연합하여 백제와 고구려를 멸망시키고 이룬 통일", importance_reason: "한반도 최초의 민족적 통합", visual_anchor: "🗺️ 세 조각이 합쳐진 황금 지도" },
    { word: "훈민정음", definition: "세종대왕이 백성을 가르치기 위해 창제한 28자의 독창적인 문자", importance_reason: "세계에서 가장 과학적인 문자", visual_anchor: "📜 나랏말싸미 적힌 훈민정음 해례본" },
    { word: "임진왜란", definition: "1592년 일본 도요토미 히데요시가 조선을 침략하여 일어난 7년 전쟁", importance_reason: "이순신 해전과 의병의 활약", visual_anchor: "🐢 불을 뿜는 거북선" },
    { word: "대동법", definition: "지방 특산물 공납 대신 토지 결수에 따라 쌀이나 돈으로 통일 납부케 한 제도", importance_reason: "농민 부담 경감 및 상업 발달", visual_anchor: "🌾 수레에 실린 황금 쌀가마니" },
    { word: "탕평책", definition: "영조와 정조가 붕당 정치의 폐해를 막기 위해 인재를 고르게 등용한 정책", importance_reason: "왕권 강화와 사회 개혁 추진", visual_anchor: "⚖️ 균형을 맞춘 탕평비 비석" },
    { word: "강화도조약", definition: "1876년 일본의 운요호 사건을 계기로 체결된 최초의 근대적 불평등 조약", importance_reason: "조선의 개항과 문호 개방", visual_anchor: "⚓ 제물포 앞바다의 일본 군함" },
    { word: "갑신정변", definition: "1884년 김옥균 등 급진개화파가 우정총국 개국 축하연을 틈타 일으킨 정변", importance_reason: "근대 국가 수립을 위한 최초의 정치 개혁", visual_anchor: "📬 불타는 우정총국 편지" },
    { word: "동학농민운동", definition: "1894년 전봉준을 중심으로 보국안민과 제폭구민을 외치며 일어난 농민 항쟁", importance_reason: "반봉건·반외세 민족 운동", visual_anchor: "🌾 죽창을 든 녹두장군" },
    { word: "을사늑약", definition: "1905년 일제가 강제로 체결하여 대한제국의 외교권을 박탈한 조약", importance_reason: "외교권 박탈 및 통감부 설치", visual_anchor: "🔒 외교 문서를 묶은 쇠사슬" },
    { word: "3·1운동", definition: "1919년 3월 1일 일제 식민 지배에 맞서 전 민족이 전개한 평화적 만세 시위", importance_reason: "대한민국 임시정부 수립의 도화선", visual_anchor: "🇰🇷 허공에 펄럭이는 태극기 물결" },
    { word: "임시정부", definition: "3·1운동 직후 중국 상하이에 수립된 대한민국 최초의 민주공화정 정부", importance_reason: "독립운동의 총본산이자 대한민국 법통", visual_anchor: "🏛️ 태극기가 걸린 상하이 청사" },
    { word: "6·25전쟁", definition: "1950년 6월 25일 북한의 기습 남침으로 발발한 동족상잔의 비극", importance_reason: "분단의 고착화와 전후 재건", visual_anchor: "🛡️ 철조망이 쳐진 38선 군사분계선" },
    { word: "4·19혁명", definition: "1960년 이승만 정권의 3·15 부정선거에 맞서 일어난 민주주의 혁명", importance_reason: "한국 현대사 최초의 민주주의 승리", visual_anchor: "📢 거리로 쏟아져 나온 학생들의 함성" },
    { word: "5·18민주화운동", definition: "1980년 광주에서 신군부 세력의 헌정 파괴에 맞서 전개된 민주 항쟁", importance_reason: "한국 민주화 운동의 상징적 이정표", visual_anchor: "🕊️ 금남로를 수놓은 평화의 비둘기" },
    { word: "6월민주항쟁", definition: "1987년 6월 전두환 정권의 호헌 조치에 맞서 대통령 직선제를 쟁취한 항쟁", importance_reason: "현행 5년 단임 직선제 개헌 쟁취", visual_anchor: "🗳️ 국민의 손으로 넣는 투표함" },
    { word: "88서울올림픽", definition: "1988년 서울에서 개최된 제24회 하계 올림픽 경기대회", importance_reason: "한국의 국제적 위상 도약과 동서 화합", visual_anchor: "🐯 상모를 돌리는 호돌이" }
  ]
};


// ⚡ 0초 만에 즉각 단어를 반환하는 오프라인 스마트 라이브러리 엔진
function getInstantOfflineWords(userInput, count = 10, excludeWords = []) {
  const clean = (userInput || '').trim().toLowerCase();
  
  // 1. 유연한 주제 키워드 매칭
  let targetKey = "전자기학";
  if (clean.includes("전기") || clean.includes("전자") || clean.includes("자기") || clean.includes("회로")) targetKey = "전자기학";
  else if (clean.includes("경제") || clean.includes("거시") || clean.includes("금융") || clean.includes("환율")) targetKey = "거시경제학";
  else if (clean.includes("뇌") || clean.includes("신경") || clean.includes("심리") || clean.includes("인지")) targetKey = "뇌과학";
  else if (clean.includes("민법") || clean.includes("법률") || clean.includes("법학") || clean.includes("계약")) targetKey = "민법총칙";
  else if (clean.includes("네트워크") || clean.includes("컴퓨터") || clean.includes("통신") || clean.includes("인터넷")) targetKey = "컴퓨터네트워크";
  else if (clean.includes("인공지능") || clean.includes("ai") || clean.includes("머신러닝") || clean.includes("딥러닝")) targetKey = "인공지능";
  else if (clean.includes("기억") || clean.includes("암기") || clean.includes("메타인지")) targetKey = "기억술";
  else if (clean.includes("역사") || clean.includes("한국사") || clean.includes("조선") || clean.includes("고려")) targetKey = "한국사";
  else {
    // 키워드가 없으면 사전 중 랜덤 1개 선택
    const keys = Object.keys(OFFLINE_BUILTIN_SETS);
    targetKey = keys[Math.floor(Math.random() * keys.length)];
  }

  const pool = [...OFFLINE_BUILTIN_SETS[targetKey]].map(item => ({
    ...item,
    chosung: extractChosung(item.word)
  }));

  // 셔플
  pool.sort(() => Math.random() - 0.5);

  const excludeSet = new Set(excludeWords || []);
  const available = pool.filter(w => !excludeSet.has(w.word));
  const picked = (available.length >= count ? available : pool).slice(0, count);

  return {
    source_name: userInput || targetKey,
    quiz_data: picked
  };
}

// 클라이언트 단어 생성 (영구 로컬 캐시 + Gemini 호출 + 오프라인 폴백 완비)
async function generateWordsClient(mode, userInput, count = 5, excludeWords = []) {
  const cleanInput = (userInput || '').trim();
  const cacheKey = `brainlock_pool_${mode}_${cleanInput}`;
  
  // 1. localStorage 영구 캐시 확인
  let pool = [];
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) pool = JSON.parse(cached);
  } catch (e) {}

  // [핵심] API 키가 없으면 (순수 오프라인/서버리스) 0초 즉시 내장 고품질 단어 풀 반환!
  if (!SERVERLESS_CONFIG.getGeminiKey()) {
    return getInstantOfflineWords(cleanInput, count, excludeWords);
  }

  // 2. 캐시가 부족하면 Gemini API 호출 시도
  if (!pool || pool.length < count) {
    try {
      const diff = state.difficulty || 'normal';
      let diffInstruction = '';
      if (diff === 'hard') {
        diffInstruction = `[난이도 지침: 🔥 어려움 / 고난도 정밀 모드]
- 기사 시험 2차, 전공 심화, 고시 수준의 변별력 높은 전문 학술 용어와 복합 개념 위주로 정밀하게 엄선하세요.
- 누구나 아는 단순 기초 상식 단어는 철저히 배제하고 깊이 있는 전공어로 구성하세요.`;
      } else if (diff === 'easy') {
        diffInstruction = `[난이도 지침: 🌱 쉬움 / 입문 웜업 모드]
- 해당 분야의 가장 직관적이고 친숙한 대표 입문 용어로 구성하세요.
- 시각 앵커는 일상에서 바로 연상되는 친근한 사물로 연결하세요.`;
      } else {
        diffInstruction = `[난이도 지침: ⚡ 보통 / 표준 훈련 모드]
- 시험 및 실무에서 가장 빈출되는 표준 핵심 전문 용어로 균형 있게 엄선하세요.`;
      }

      const prompt = `
[역할]: '${cleanInput}' 분야 전공 교수
${diffInstruction}
주제 '${cleanInput}'에 관련된 핵심 전문 용어 총 25개를 엄선하세요.
[필수 JSON 포맷]:
{
  "quiz_data": [
    {
      "word": "핵심전문용어",
      "definition": "명쾌한 1문장 정의 (25자 이내)",
      "importance_reason": "출제 및 실무 포인트 (25자 이내)",
      "visual_anchor": "💡 연상 사물/이모지"
    }
  ]
}
- 25개 단어, 한국어로 작성.
`;
      console.log(`[AI 프롬프트 생성] 난이도: ${diff} 적용 완료`);
      const res = await callGeminiClient(prompt, 0.95);
      pool = (res.quiz_data || []).map(item => ({
        ...item,
        chosung: extractChosung(item.word)
      }));
      pool.sort(() => Math.random() - 0.5);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(pool));
      } catch (e) {}
    } catch (apiErr) {
      console.warn("Gemini API 미연결 또는 오류 -> 오프라인 내장 단어장으로 자동 폴백:", apiErr);
      
      // 3. 오프라인 폴백: 내장 단어장 매칭 또는 기본 기억술 세트 제공
      let matchedCategory = Object.keys(OFFLINE_BUILTIN_SETS).find(k => cleanInput.includes(k));
      if (!matchedCategory) matchedCategory = "기억술";
      
      pool = OFFLINE_BUILTIN_SETS[matchedCategory].map(item => ({
        ...item,
        chosung: extractChosung(item.word)
      }));
      pool.sort(() => Math.random() - 0.5);
    }
  }

  const excludeSet = new Set(excludeWords || []);
  const available = pool.filter(w => !excludeSet.has(w.word));
  const picked = (available.length >= count ? available : pool).slice(0, count);

  // 남은 단어 풀 업데이트
  const remaining = pool.filter(w => !picked.some(p => p.word === w.word));
  try {
    localStorage.setItem(cacheKey, JSON.stringify(remaining));
  } catch (e) {}

  return {
    source_name: cleanInput || "기억술 훈련",
    quiz_data: picked
  };
}

// 클라이언트 채점
async function verifyAnswersClient(quizWords, userInputs) {
  const diff = state.difficulty || 'normal';
  let gradingRule = '';
  if (diff === 'hard') {
    gradingRule = `[채점 기준: 🔥 엄격한 정밀 채점 모드]
- 단 한 글자의 오타, 자모 탈락, 띄어쓰기 오류도 절대 허용하지 않는 엄격한 정밀 채점관입니다.
- 글자가 100% 완벽히 일치해야만 is_correct: true로 판정하고, 조금이라도 틀리면 즉시 is_correct: false로 채점하세요.`;
  } else if (diff === 'easy') {
    gradingRule = `[채점 기준: 🌱 자비로운 채점 모드]
- 사소한 오타, 자모 분리, 띄어쓰기 차이, 음절 누락은 적극적으로 정답(is_correct: true)으로 관대하게 인정하세요.`;
  } else {
    gradingRule = `[채점 기준: ⚡ 표준 채점 모드]
- 핵심 단어가 통하면 가벼운 오타나 띄어쓰기는 정답으로 인정하되, 다른 단어로 왜곡된 것은 오답(is_correct: false) 처리하세요.`;
  }

  const prompt = `
${gradingRule}
정답 단어 목록: ${JSON.stringify(quizWords)}
사용자 입력 목록: ${JSON.stringify(userInputs)}

반드시 아래 JSON 형식으로 응답:
{
  "results": [
    {
      "original": "정답단어",
      "is_correct": true,
      "matched_input": "매칭된 단어 또는 빈문자열",
      "feedback": "짧은 피드백 (1문장)"
    }
  ]
}
results 개수와 순서는 정답 단어 목록과 동일해야 합니다.
`;
  try {
    return await callGeminiClient(prompt, 0.2);
  } catch (err) {
    // 오프라인 정밀 대조 폴백
    const copied = [...userInputs];
    const results = quizWords.map(orig => {
      const idx = copied.indexOf(orig);
      if (idx !== -1) {
        copied.splice(idx, 1);
        return { original: orig, is_correct: true, matched_input: orig, feedback: '정답입니다!' };
      }
      return { original: orig, is_correct: false, matched_input: '', feedback: '미인출되었습니다.' };
    });
    return { results };
  }
}

// 클라이언트 연상 스토리 코칭
async function evaluateStoryClient(userStory, quizWords, results, memSec, testSec, acc) {
  if (!userStory) return { technique_score: 0, coach_summary: '-', weak_points: '-', tip: '-' };
  const prompt = `
기억술 전문가로서 사용자의 연상 스토리를 평가하고 점수(1~100점)와 코칭을 JSON으로 반환하세요.
사용자 스토리: "${userStory}"
암기 단어: ${JSON.stringify(quizWords)}
소요시간: 암기 ${memSec}초, 인출 ${testSec}초, 정답률: ${acc}%
JSON 응답:
{
  "technique_score": 85,
  "coach_summary": "총평 1문장",
  "weak_points": "취약점 1문장",
  "tip": "기억술 향상 팁 1문장"
}
`;
  try {
    return await callGeminiClient(prompt, 0.5);
  } catch (e) {
    return { technique_score: 80, coach_summary: '훌륭한 연상 스토리입니다.', weak_points: '시간 단축 훈련 권장', tip: '시각적 이미지를 더 과장해보세요.' };
  }
}

// 🌐 구글 시트 + 로컬스토리지 하이브리드 저장
function saveHybrid(type, payload) {
  // 1. localStorage에 즉시 로컬 백업
  try {
    const localDb = JSON.parse(localStorage.getItem('brainlock_local_db') || '{"trainings":{},"concept":[],"spatial":[],"sudoku":[]}');
    if (type === 'save_training') {
      localDb.trainings[payload.title] = {
        ...payload,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 16)
      };
    } else if (type === 'log_concept') {
      localDb.concept.unshift({ ...payload, created_at: new Date().toISOString().replace('T', ' ').substring(0, 16) });
    } else if (type === 'log_spatial') {
      localDb.spatial.unshift({ ...payload, created_at: new Date().toISOString().replace('T', ' ').substring(0, 16) });
    } else if (type === 'log_sudoku') {
      localDb.sudoku.unshift({ ...payload, created_at: new Date().toISOString().replace('T', ' ').substring(0, 16) });
    }
    localStorage.setItem('brainlock_local_db', JSON.stringify(localDb));
  } catch (e) {
    console.error('Local backup err:', e);
  }

  // 2. 구글 시트 웹훅 URL이 있으면 비동기 전송
  const sheetUrl = SERVERLESS_CONFIG.getSheetUrl();
  if (sheetUrl && sheetUrl.includes('script.google.com')) {
    // Google Apps Script는 text/plain으로 전송해야 브라우저 CORS 차단 없이 e.postData.contents로 100% 정상 수신됩니다!
    fetch(sheetUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type, ...payload })
    }).then(() => {
      console.log(`[GoogleSheet] 전송 성공: ${type}`);
    }).catch(e => {
      console.error('[GoogleSheet] 전송 오류:', e);
    });
  }
}

// 뷰 전환 유틸
function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
  });

  const targetView = document.getElementById(viewName);
  if (targetView) {
    targetView.classList.add('active');
    state.currentView = viewName;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 상단 네비게이션 액티브 상태 동기화
  const btnDash = document.getElementById('btnModeDashboard');
  const btnFast = document.getElementById('btnModeFast');
  const btnQuiz = document.getElementById('btnModeQuiz');
  const btnConcept = document.getElementById('btnModeConcept');
  const btnSpatial = document.getElementById('btnModeSpatial');
  
  const navBtns = [btnDash, btnFast, btnQuiz, btnConcept, btnSpatial, btnSudoku].filter(Boolean);
  navBtns.forEach(b => b.classList.remove('active'));

  if (viewName === 'viewDashboard' && btnDash) btnDash.classList.add('active');
  else if (viewName === 'viewFastMode' && btnFast) btnFast.classList.add('active');
  else if (viewName === 'viewQuizMCQ' && btnQuiz) btnQuiz.classList.add('active');
  else if (['viewSetup', 'viewPrepare', 'viewMemorize', 'viewTest', 'viewResult'].includes(viewName) && btnConcept) btnConcept.classList.add('active');
  else if (viewName === 'viewSpatial' && btnSpatial) btnSpatial.classList.add('active');
  else if (viewName === 'viewSudoku' && btnSudoku) btnSudoku.classList.add('active');
}

// =================================================================
// 1. 초기화 및 이벤트 리스너
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupThemeToggle();
  setupSoundToggle();
  setupCustomWordModal();
  setupAuth();
  setupSettingsModal();
  setupModeSwitcher();
  setupSpatialGame();
  setupDifficultySelector();
  setupTabs();
  setupPdfDropzone();
  setupCounter();
  setupDrawer();
  setupTagInput();
  setupKeybindings();
  setupMcqTopicSelector();
  setupFastModeEvents();
  checkAuthAndInit();
});

// 상단 모드 전환기 & 퀵 런처 & 복귀 버튼
function setupModeSwitcher() {
  const btnDash = document.getElementById('btnModeDashboard');
  const btnFast = document.getElementById('btnModeFast');
  const btnQuiz = document.getElementById('btnModeQuiz');
  const btnConcept = document.getElementById('btnModeConcept');
  const btnSpatial = document.getElementById('btnModeSpatial');

  if (btnDash) {
    btnDash.addEventListener('click', () => {
      switchView('viewDashboard');
      loadMainDashboard();
    });
  }

  // [신규] ⚡ FAST 집중 훈련 모드 진입
  if (btnFast) {
    btnFast.addEventListener('click', () => {
      startFastMode();
    });
  }

  const launchFast = document.getElementById('launchFastCard');
  if (launchFast) {
    launchFast.addEventListener('click', () => {
      startFastMode();
    });
  }

  const btnLaunchFast = document.getElementById('btnLaunchFast');
  if (btnLaunchFast) {
    btnLaunchFast.addEventListener('click', (e) => {
      e.stopPropagation();
      startFastMode();
    });
  }

  // [신규] 상단 🎯 4지선다 객관식 퀴즈 탭 클릭 시 즉시 퀴즈 시작!
  if (btnQuiz) {
    btnQuiz.addEventListener('click', () => {
      if (!state.sessionData || !state.sessionData.quiz_data || state.sessionData.quiz_data.length === 0) {
        const defaultList = OFFLINE_BUILTIN_SETS["기억술"] || [];
        state.sessionData = {
          quiz_data: defaultList,
          source_name: "기억술 핵심 개념",
          user_story: ""
        };
      }
      startMcqQuiz();
    });
  }

  if (btnConcept) {
    btnConcept.addEventListener('click', () => {
      switchView('viewSetup');
    });
  }

  if (btnSpatial) {
    btnSpatial.addEventListener('click', () => {
      switchView('viewSpatial');
      loadSpatialStats();
    });
  }

  // 메인 대시보드 내 3대 훈련 퀵 런처 카드
  const launchConcept = document.getElementById('launchConceptCard');
  const launchSpatial = document.getElementById('launchSpatialCard');

  if (launchConcept) {
    launchConcept.addEventListener('click', () => {
      switchView('viewSetup');
    });
  }

  const launchMcq = document.getElementById('launchMcqCard');
  if (launchMcq) {
    launchMcq.addEventListener('click', () => {
      if (!state.sessionData || !state.sessionData.quiz_data || state.sessionData.quiz_data.length === 0) {
        const defaultList = OFFLINE_BUILTIN_SETS["기억술"] || [];
        state.sessionData = {
          quiz_data: defaultList,
          source_name: "기억술 핵심 개념",
          user_story: ""
        };
      }
      startMcqQuiz();
    });
  }

  if (launchSpatial) {
    launchSpatial.addEventListener('click', () => {
      switchView('viewSpatial');
      loadSpatialStats();
    });
  }

  // 하단 메인 대시보드 복귀 버튼들
  document.querySelectorAll('.btn-return-dashboard').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView('viewDashboard');
      loadMainDashboard();
    });
  });
}

// 로그인 장벽 없이 메인 대시보드로 100% 즉시 직행!
function checkAuthAndInit() {
  const mainLayout = document.getElementById('mainAppLayout');
  const viewAuth = document.getElementById('viewAuth');

  // 로그인 모달/화면 완전 숨김
  if (viewAuth) {
    viewAuth.style.display = 'none';
    viewAuth.classList.remove('active');
  }

  // 메인 훈련 레이아웃 즉시 노출
  if (mainLayout) {
    mainLayout.style.display = 'grid';
  }

  // 기본 마스터 프로필 자동 활성화
  if (!state.currentUser) {
    state.currentUser = { user_id: 1, username: 'master', display_name: '마스터' };
  }

  updateUserUI();
  switchView('viewDashboard');
  loadMainDashboard();
  loadSavedList();
}

// =================================================================
// 👑 마스터 인증 게이트웨이 (로그인 / 로그아웃)
// =================================================================
function setupAuth() {
  const authForm = document.getElementById('authForm');
  const btnLogout = document.getElementById('btnLogout');

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value.trim();

    toggleLoading(true, '마스터 권한을 확인하고 있습니다...');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      toggleLoading(false);

      if (data.error) {
        alert('❌ 접속 실패: ' + data.error);
        return;
      }

      state.currentUser = data;
      localStorage.setItem('brainlock_user', JSON.stringify(data));
      authForm.reset();

      // 마스터 인증 성공 -> 즉시 메인 앱으로 진입!
      checkAuthAndInit();
    } catch (err) {
      toggleLoading(false);
      alert('서버 통신 오류: ' + err);
    }
  });

  btnLogout.addEventListener('click', () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      state.currentUser = null;
      localStorage.removeItem('brainlock_user');
      checkAuthAndInit();
    }
  });
}

function updateUserUI() {
  const chip = document.getElementById('userProfileChip');
  const nameElem = document.getElementById('displayUsername');

  if (state.currentUser && state.currentUser.user_id) {
    chip.style.display = 'flex';
    nameElem.innerText = state.currentUser.display_name || state.currentUser.username;
  } else {
    chip.style.display = 'none';
  }
}

// 테마 토글 (다크/라이트)
function setupThemeToggle() {
  const btn = document.getElementById('btnToggleTheme');
  btn.addEventListener('click', () => {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.body.removeAttribute('data-theme');
    } else {
      document.body.setAttribute('data-theme', 'light');
    }
  });
}

// 난이도 선택
function setupDifficultySelector() {
  const options = document.querySelectorAll('.diff-option');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      state.difficulty = opt.getAttribute('data-level');
    });
  });
}

// 탭 전환
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeTab = btn.getAttribute('data-tab');

      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      if (state.activeTab === 'topic') {
        document.getElementById('tabTopic').classList.add('active');
      } else if (state.activeTab === 'multi') {
        document.getElementById('tabMulti').classList.add('active');
        // 다중 주제 믹스 선택 시 단어 개수 10개로 자동 세팅
        const wcInput = document.getElementById('wordCount');
        if (wcInput) {
          wcInput.value = 10;
          state.wordCount = 10;
        }
      } else if (state.activeTab === 'text') {
        document.getElementById('tabText').classList.add('active');
      } else if (state.activeTab === 'pdf') {
        document.getElementById('tabPdf').classList.add('active');
      }
    });
  });

  // 프리셋 칩 클릭 이벤트
  document.querySelectorAll('.chip-preset').forEach(chip => {
    chip.addEventListener('click', () => {
      const presetVal = chip.getAttribute('data-preset');
      const inputMulti = document.getElementById('inputMultiTopics');
      if (inputMulti) {
        inputMulti.value = presetVal;
        inputMulti.focus();
      }
    });
  });
}

// PDF 드롭존 설정
function setupPdfDropzone() {
  const dropzone = document.getElementById('pdfDropzone');
  const fileInput = document.getElementById('inputPdfFile');
  const fileInfo = document.getElementById('pdfFileInfo');
  const dropText = document.getElementById('pdfDropText');

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handlePdfFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handlePdfFile(e.target.files[0]);
    }
  });

  function handlePdfFile(file) {
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      alert('PDF 파일만 업로드할 수 있습니다.');
      return;
    }
    state.selectedPdfName = file.name;
    state.selectedPdfFile = file; // 원본 File 객체 보관 (클라이언트 파싱용)
    const reader = new FileReader();
    reader.onload = () => {
      state.selectedPdfBase64 = reader.result;
      dropText.innerText = '선택된 PDF 파일:';
      fileInfo.innerText = `📄 ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
      fileInfo.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }
}

// 📄 브라우저 순수 PDF 텍스트 추출 (서버 없는 GitHub Pages 완전 대응)
async function extractPdfTextClient(file, startPage = 1, endPage = 0) {
  if (!window.pdfjsLib) {
    throw new Error('PDF.js 라이브러리가 로드되지 않았습니다.');
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const start = Math.max(1, startPage);
  const end = (endPage > 0 && endPage <= totalPages) ? endPage : Math.min(start + 5, totalPages);

  let fullText = '';
  for (let i = start; i <= end; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += `\n--- [Page ${i}] ---\n` + pageText;
  }
  return fullText.trim();
}

// 단어 개수 조절
function setupCounter() {
  const input = document.getElementById('wordCount');
  if (!input) return;
  document.getElementById('btnCountMinus').addEventListener('click', () => {
    let val = parseInt(input.value, 10) || 5;
    if (val > 3) {
      input.value = val - 1;
      state.wordCount = val - 1;
    }
  });
  document.getElementById('btnCountPlus').addEventListener('click', () => {
    let val = parseInt(input.value, 10) || 5;
    if (val < 15) {
      input.value = val + 1;
      state.wordCount = val + 1;
    }
  });
}

// 저장된 단어장 서랍 (Drawer - 안전 처리)
function setupDrawer() {
  const drawer = document.getElementById('savedDrawer');
  const btnOpen = document.getElementById('btnOpenSaved');
  const btnClose = document.getElementById('btnCloseDrawer');

  if (btnOpen && drawer) {
    btnOpen.addEventListener('click', async () => {
      drawer.classList.add('open');
      await loadSavedList();
    });
  }
  if (btnClose && drawer) {
    btnClose.addEventListener('click', () => {
      drawer.classList.remove('open');
    });
  }
}

// 키보드 단축키
function setupKeybindings() {
  window.addEventListener('keydown', (e) => {
    if (state.currentView === 'viewFastMode') {
      if (fastModeState.currentPhase === 'preview') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          startFastQuiz();
        }
      } else if (fastModeState.currentPhase === 'quiz') {
        if (e.key === '1' || e.code === 'Numpad1') {
          e.preventDefault();
          handleFastOptionKey(0);
        } else if (e.key === '2' || e.code === 'Numpad2') {
          e.preventDefault();
          handleFastOptionKey(1);
        } else if (e.key === '3' || e.code === 'Numpad3') {
          e.preventDefault();
          handleFastOptionKey(2);
        } else if (e.key === '4' || e.code === 'Numpad4') {
          e.preventDefault();
          handleFastOptionKey(3);
        }
      } else if (fastModeState.currentPhase === 'summary') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          nextFastRound();
        }
      }
    } else if (state.currentView === 'viewQuizMCQ') {
      const previewStep = document.getElementById('mcqPreviewStep');
      const solveStep = document.getElementById('mcqSolveStep');
      
      // 단어 암기 화면에서 Space 또는 Enter 누르면 즉시 퀴즈 시작!
      if (previewStep && previewStep.style.display !== 'none') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          clearInterval(mcqPreviewTimerId);
          state.memorizeDuration = ((Date.now() - mcqPreviewStartTime) / 1000).toFixed(1);
          startMcqSolving();
        }
      } else if (solveStep && solveStep.style.display !== 'none') {
        // 퀴즈 풀기 화면에서 1, 2, 3, 4 키로 즉시 보기 선택!
        const btns = document.querySelectorAll('.mcq-option-btn:not(:disabled)');
        if (btns.length === 4) {
          if (e.key === '1' || e.code === 'Numpad1' || e.key === 'a' || e.key === 'A') {
            e.preventDefault();
            btns[0].click();
          } else if (e.key === '2' || e.code === 'Numpad2' || e.key === 'b' || e.key === 'B') {
            e.preventDefault();
            btns[1].click();
          } else if (e.key === '3' || e.code === 'Numpad3' || e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            btns[2].click();
          } else if (e.key === '4' || e.code === 'Numpad4' || e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            btns[3].click();
          }
        }
      }
    } else if (state.currentView === 'viewMemorize') {
      if (e.key === 'ArrowLeft') showPrevCard();
      if (e.key === 'ArrowRight') showNextCard();
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        finishMemorize();
      }
    } else if (state.currentView === 'viewTest') {
      if (e.key === 'Tab') {
        e.preventDefault();
        openHints();
      }
    }
  });
}

// =================================================================
// 2. AI 단어 생성 및 STEP 1 (단어 확인 & 연상 구상)
// =================================================================
document.getElementById('btnStartGenerate').addEventListener('click', async () => {
  let endpoint = '/api/generate';
  let payload = {};

  if (state.activeTab === 'pdf') {
    if (!state.selectedPdfBase64) {
      alert('PDF 파일을 먼저 선택하거나 드롭해주세요.');
      return;
    }
    endpoint = '/api/generate-from-pdf';
    payload = {
      pdf_base64: state.selectedPdfBase64,
      pdf_name: state.selectedPdfName,
      start_page: parseInt(document.getElementById('inputStartPage').value) || 1,
      end_page: parseInt(document.getElementById('inputEndPage').value) || 0,
      count: state.wordCount,
      difficulty: state.difficulty
    };
    toggleLoading(true, `PDF 교재에서 [${state.difficulty.toUpperCase()}] 수준 핵심 전공 용어를 분류 중입니다...`);
  } else {
    let inputVal = '';
    if (state.activeTab === 'topic') {
      inputVal = document.getElementById('inputTopic').value.trim();
    } else if (state.activeTab === 'multi') {
      inputVal = document.getElementById('inputMultiTopics').value.trim();
    } else {
      inputVal = document.getElementById('inputText').value.trim();
    }

    if (!inputVal) {
      alert('주제 또는 원문 내용을 입력해주세요.');
      return;
    }

    payload = {
      mode: state.activeTab,
      input: inputVal,
      count: state.wordCount,
      difficulty: state.difficulty
    };
    toggleLoading(true, `AI가 [${state.difficulty.toUpperCase()}] 난이도에 맞춰 핵심 전공 용어와 시각 앵커를 설계하고 있습니다...`);
  }

  try {
    let data;
    const isStandalone = SERVERLESS_CONFIG.isStandalone();

    if (!isStandalone) {
      // 로컬/Render 파이썬 백엔드 서버가 켜져 있는 환경
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch (e) {}
    }

    // 서버가 없거나 응답이 비어있으면 클라이언트 브라우저 Gemini API 직행!
    if (!data || !data.quiz_data) {
      let targetInput = payload.input || '';
      let targetMode = payload.mode || 'topic';

      if (state.activeTab === 'pdf') {
        try {
          toggleLoading(true, 'PDF.js로 브라우저에서 직접 교재 텍스트를 파싱하고 있습니다...');
          const startP = parseInt(document.getElementById('inputStartPage').value) || 1;
          const endP = parseInt(document.getElementById('inputEndPage').value) || 0;
          targetInput = await extractPdfTextClient(state.selectedPdfFile, startP, endP);
          targetMode = 'text';
          toggleLoading(true, 'AI가 추출된 교재 내용에서 핵심 개념어를 분류 중입니다...');
        } catch (pdfErr) {
          console.warn('PDF 클라이언트 파싱 실패, 기본 파일명 모드로 전환:', pdfErr);
          targetInput = state.selectedPdfName.replace('.pdf', '') + ' 핵심 개념';
          targetMode = 'topic';
        }
      }

      data = await generateWordsClient(targetMode, targetInput, payload.count || 5);
    }
    toggleLoading(false);

    if (data.quiz_data && data.quiz_data.length > 0) {
      const sourceTitle = data.source_name || 
        (state.activeTab === 'multi' ? '다중 융합 10선' : document.getElementById('inputTopic').value);

      state.sessionData = {
        quiz_data: data.quiz_data,
        source_name: sourceTitle,
        user_story: '',
        history: []
      };
      
      // ⏱️ 핵심: 단어가 사용자에게 노출되는 바로 이 순간부터 연상/암기 타이머 시작!
      startMemorizeTimer();
      
      renderPrepareView();
      switchView('viewPrepare');
    } else {
      alert('단어를 생성하지 못했습니다. 다시 시도해주세요.');
    }
  } catch (err) {
    toggleLoading(false);
    alert('서버와 통신할 수 없습니다: ' + err);
  }
});

// 타이머 시작 함수 (STEP 1 진입 즉시 가동)
function startMemorizeTimer() {
  state.memorizeStartTime = Date.now();
  const timerElem = document.getElementById('memorizeTimer');
  const prepareTimerElem = document.getElementById('prepareTimerText');
  if (state.memorizeTimerId) clearInterval(state.memorizeTimerId);
  
  state.memorizeTimerId = setInterval(() => {
    const elapsed = ((Date.now() - state.memorizeStartTime) / 1000).toFixed(1);
    if (timerElem) timerElem.innerText = `${elapsed}s`;
    if (prepareTimerElem) prepareTimerElem.innerText = `${elapsed}s`;
  }, 100);
}

// STEP 1 렌더링 (단어 카드가 메인 주인공!)
function renderPrepareView() {
  const container = document.getElementById('prepareCardsList');
  container.innerHTML = '';

  state.sessionData.quiz_data.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'word-prep-card';
    
    // 시각 앵커 파싱 (이모지 vs 텍스트)
    const anchor = item.visual_anchor || '💡 연상 사물';
    const firstChar = Array.from(anchor)[0] || '💡';
    const isEmoji = /\p{Extended_Pictographic}/u.test(firstChar);
    const emoji = isEmoji ? firstChar : '💡';
    const anchorText = isEmoji ? anchor.substring(firstChar.length).trim() : anchor;

    const categoryHtml = item.category ? `<span class="prep-card-cat">${item.category}</span>` : '';

    card.innerHTML = `
      <div class="prep-card-top">
        <span class="prep-card-num">#0${idx + 1}</span>
        ${categoryHtml}
      </div>
      <div class="prep-card-word">
        <span class="prep-emoji">${emoji}</span> ${item.word}
      </div>
      <div class="prep-card-def">
        ${item.definition || '-'}
      </div>
      <div class="prep-card-anchor">
        💡 <strong>연상 닻:</strong> ${anchorText || anchor}
      </div>
    `;
    container.appendChild(card);
  });

  const storyInput = document.getElementById('inputUserStory');
  const countDisplay = document.getElementById('storyCharCount');
  storyInput.value = state.sessionData.user_story || '';
  if (countDisplay) {
    countDisplay.innerText = `${storyInput.value.length} / 1000자`;
  }

  storyInput.oninput = () => {
    if (countDisplay) {
      countDisplay.innerText = `${storyInput.value.length} / 1000자`;
    }
  };
}

// STEP 1 -> STEP 2 (1-Card 암기 진입)
document.getElementById('btnGoToMemorize').addEventListener('click', () => {
  state.sessionData.user_story = document.getElementById('inputUserStory').value.trim();
  startMemorizeMode();
});

// [신규] STEP 1 -> 🎯 4지선다 객관식 퀴즈 시작 (기존 단어로 바로 풀기)
const btnStartMcq = document.getElementById('btnStartMcqQuiz');
if (btnStartMcq) {
  btnStartMcq.addEventListener('click', () => {
    state.sessionData.user_story = document.getElementById('inputUserStory').value.trim();
    clearInterval(state.memorizeTimerId);
    state.memorizeDuration = ((Date.now() - state.memorizeStartTime) / 1000).toFixed(1);
    startMcqQuiz();
  });
}

// 🎯 [양방향 1] 개념 연상술 -> 퀴즈로 전환 시 "+5단어 추가하여 10문제 퀴즈 도전"
const btnExpandAndMcq = document.getElementById('btnExpandAndMcqQuiz');
if (btnExpandAndMcq) {
  btnExpandAndMcq.addEventListener('click', async () => {
    if (!state.sessionData || !state.sessionData.quiz_data || state.sessionData.quiz_data.length === 0) {
      alert('단어 데이터가 없습니다.');
      return;
    }

    const currentTopic = state.sessionData.source_name || '전기기사 전자기학';
    const existingWords = state.sessionData.quiz_data.map(d => d.word);

    toggleLoading(true, `'${currentTopic}' 주제로 퀴즈를 위해 새로운 단어 5개를 추가 보강하고 있습니다...`);
    try {
      const extraData = await generateWordsClient('topic', currentTopic, 5, existingWords);
      toggleLoading(false);

      if (extraData && extraData.quiz_data && extraData.quiz_data.length > 0) {
        // 기존 단어 + 새 단어 융합
        state.sessionData.quiz_data = [...state.sessionData.quiz_data, ...extraData.quiz_data];
        state.mcqWordCount = state.sessionData.quiz_data.length;
      }
    } catch (e) {
      toggleLoading(false);
      console.warn('추가 단어 생성 실패, 기존 단어로 진행:', e);
    }

    clearInterval(state.memorizeTimerId);
    state.memorizeDuration = ((Date.now() - state.memorizeStartTime) / 1000).toFixed(1);
    startMcqQuiz();
  });
}

// 🧠 [양방향 2] 객관식 퀴즈 프리뷰 -> AI 개념 연상술(스토리) 직행
const btnMcqToConcept = document.getElementById('btnMcqToConceptDirect');
if (btnMcqToConcept) {
  btnMcqToConcept.addEventListener('click', () => {
    transferMcqToConceptTraining();
  });
}

// 🧠 [양방향 3] 퀴즈 채점 결과 화면 -> AI 개념 연상술(스토리) 심화 훈련 직행
const btnTransferConcept = document.getElementById('btnTransferToConcept');
if (btnTransferConcept) {
  btnTransferConcept.addEventListener('click', () => {
    transferMcqToConceptTraining();
  });
}

// 🔄 퀴즈 단어들을 들고 AI 개념 연상술(스토리텔링) 화면으로 전환하는 공통 함수
function transferMcqToConceptTraining() {
  if (!state.sessionData || !state.sessionData.quiz_data || state.sessionData.quiz_data.length === 0) {
    alert('전환할 퀴즈 단어가 없습니다.');
    return;
  }

  // 개념 연상술에는 5~7개 단위가 가장 효과적이므로, 10개 이상이면 상위 5개 또는 오답 위주로 세팅
  let targetWords = state.sessionData.quiz_data;
  if (state.lastWrongQuizData && state.lastWrongQuizData.length > 0) {
    const wrongWords = state.lastWrongQuizData;
    const others = targetWords.filter(t => !wrongWords.some(w => w.word === t.word));
    targetWords = [...wrongWords, ...others].slice(0, 5);
  } else if (targetWords.length > 5) {
    targetWords = targetWords.slice(0, 5);
  }

  state.sessionData.quiz_data = targetWords;
  renderPrepareView();
  switchView('viewPrepare');

  alert(`💡 퀴즈 단어 중 핵심 5개가 'AI 개념 연상술' 화면에 연동되었습니다!\n시각 앵커를 활용해 나만의 스토리를 메모하고 깊이 있게 각인해보세요.`);
}

// [신규] STEP 1 -> STEP 3 (1-Card 건너뛰고 연상법 완료 즉시 바로 주관식 시험보기)
document.getElementById('btnDirectToTest').addEventListener('click', () => {
  state.sessionData.user_story = document.getElementById('inputUserStory').value.trim();
  clearInterval(state.memorizeTimerId);
  state.memorizeDuration = ((Date.now() - state.memorizeStartTime) / 1000).toFixed(1);
  startTestMode();
});

// =================================================================
// 3. STEP 2: 초집중 1-Card 암기 모드
// =================================================================
function startMemorizeMode() {
  state.currentCardIdx = 0;

  // Zen 모드 버튼
  const timerElem = document.getElementById('memorizeTimer');
  document.getElementById('btnToggleZen').onclick = () => {
    state.isZenMode = !state.isZenMode;
    timerElem.style.visibility = state.isZenMode ? 'hidden' : 'visible';
  };

  // 스토리 미리보기 바
  const storyPreview = document.getElementById('storyPreviewText');
  storyPreview.innerText = state.sessionData.user_story || '(작성된 연상 스토리 없음)';

  renderFocusCard();
  switchView('viewMemorize');
}

function renderFocusCard() {
  const list = state.sessionData.quiz_data;
  const curr = list[state.currentCardIdx];
  if (!curr) return;

  const emoji = (curr.visual_anchor || '💡').split(' ')[0];

  const categoryLabel = curr.category ? ` [${curr.category}]` : '';
  document.getElementById('focusNum').innerText = `${state.currentCardIdx + 1} / ${list.length}${categoryLabel}`;
  
  // 메인 단어 (가장 크고 명확하게!)
  document.getElementById('focusWord').innerHTML = `<span class="focus-emoji">${emoji}</span> ${curr.word}`;
  document.getElementById('focusDef').innerText = curr.definition;
  
  // 시각 앵커 (보조 힌트 배지 형태)
  document.getElementById('focusAnchor').innerText = `💡 연상 힌트: ${curr.visual_anchor || ''}`;
  
  // 출제 포인트 배지
  let reasonElem = document.getElementById('focusReason');
  if (!reasonElem) {
    reasonElem = document.createElement('div');
    reasonElem.id = 'focusReason';
    reasonElem.className = 'focus-reason';
    document.getElementById('focusCard').appendChild(reasonElem);
  }
  if (curr.importance_reason) {
    reasonElem.innerText = `📌 출제 포인트: ${curr.importance_reason}`;
    reasonElem.style.display = 'block';
  } else {
    reasonElem.style.display = 'none';
  }

  document.getElementById('cardProgressText').innerText = `단어 ${state.currentCardIdx + 1} / ${list.length}`;
}

function showPrevCard() {
  if (state.currentCardIdx > 0) {
    state.currentCardIdx--;
    renderFocusCard();
  }
}

function showNextCard() {
  if (state.currentCardIdx < state.sessionData.quiz_data.length - 1) {
    state.currentCardIdx++;
    renderFocusCard();
  }
}

document.getElementById('btnPrevCard').addEventListener('click', showPrevCard);
document.getElementById('btnNextCard').addEventListener('click', showNextCard);

function finishMemorize() {
  clearInterval(state.memorizeTimerId);
  state.memorizeDuration = ((Date.now() - state.memorizeStartTime) / 1000).toFixed(1);
  startTestMode();
}

document.getElementById('btnFinishMemorize').addEventListener('click', finishMemorize);

// =================================================================
// 4. STEP 3: 스피드 인출 시험 (태그형 입력 & 힌트 사다리)
// =================================================================
function startTestMode() {
  state.userTags = [];
  state.testStartTime = Date.now();
  state.hintsOpened = false;

  // 인출 타이머
  const timerElem = document.getElementById('testTimer');
  if (state.testTimerId) clearInterval(state.testTimerId);
  state.testTimerId = setInterval(() => {
    const elapsed = ((Date.now() - state.testStartTime) / 1000).toFixed(1);
    timerElem.innerText = `${elapsed}s`;
  }, 100);

  // 태그 초기화
  renderTags();
  document.getElementById('targetCountNum').innerText = state.sessionData.quiz_data.length;

  // 난이도별 힌트 사다리 셋팅
  setupHintLadder();

  switchView('viewTest');
  document.getElementById('tagInput').focus();
}

function setupHintLadder() {
  const hintBox = document.getElementById('hintLadderBox');
  const hintsGrid = document.getElementById('hintsGrid');
  const btnOpen = document.getElementById('btnOpenHint');
  hintsGrid.innerHTML = '';

  if (state.difficulty === 'hard') {
    hintBox.style.display = 'none'; // 어려움: 힌트 완전 차단
    return;
  }

  hintBox.style.display = 'block';

  state.sessionData.quiz_data.forEach(item => {
    const chip = document.createElement('div');
    chip.className = 'hint-chip';
    chip.innerHTML = `${item.visual_anchor || '💡'} <span class="hint-chosung">${item.chosung || '??'}</span>`;
    
    if (state.difficulty === 'normal') {
      chip.classList.add('locked'); // 보통: 기본 블라인드
    }
    hintsGrid.appendChild(chip);
  });

  if (state.difficulty === 'easy') {
    btnOpen.style.display = 'none'; // 쉬움: 이미 열려있음
  } else {
    btnOpen.style.display = 'inline-block';
    btnOpen.onclick = openHints;
  }
}

function openHints() {
  state.hintsOpened = true;
  document.querySelectorAll('.hint-chip').forEach(c => c.classList.remove('locked'));
}

// 태그 인풋 로직
function setupTagInput() {
  const input = document.getElementById('tagInput');
  input.addEventListener('keydown', (e) => {
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault();
      const val = input.value.trim().replace(',', '');
      if (val && !state.userTags.includes(val)) {
        state.userTags.push(val);
        input.value = '';
        renderTags();
      }
    } else if (e.key === 'Backspace' && !input.value && state.userTags.length > 0) {
      state.userTags.pop();
      renderTags();
    }
  });
}

function renderTags() {
  const container = document.getElementById('tagsContainer');
  const inputRow = container.querySelector('.tag-input-row');
  
  // 기존 태그 칩 삭제
  container.querySelectorAll('.tag-chip').forEach(b => b.remove());

  // 태그 칩 재생성 (애니메이션과 번호 뱃지)
  state.userTags.forEach((tag, idx) => {
    const badge = document.createElement('div');
    badge.className = 'tag-chip';
    badge.innerHTML = `
      <span class="tag-chip-num">#${idx + 1}</span>
      <span>${tag}</span>
      <span class="tag-chip-remove" data-idx="${idx}">✕</span>
    `;
    container.insertBefore(badge, inputRow);
  });

  // 삭제 클릭 이벤트
  container.querySelectorAll('.tag-chip-remove').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      state.userTags.splice(idx, 1);
      renderTags();
    };
  });

  // 카운트 & 프로그레스 바 갱신
  const countNum = state.userTags.length;
  const targetNum = state.sessionData.quiz_data.length || 5;
  document.getElementById('tagCountNum').innerText = countNum;
  document.getElementById('targetCountNum').innerText = targetNum;

  const pct = Math.min(100, Math.round((countNum / targetNum) * 100));
  const progressBar = document.getElementById('inputProgressBar');
  if (progressBar) {
    progressBar.style.width = `${pct}%`;
  }
}

// =================================================================
// 5. STEP 4: 답안 제출 및 채점 리포트
// =================================================================
document.getElementById('btnSubmitTest').addEventListener('click', async () => {
  // 인풋에 남아있는 텍스트가 있으면 태그에 추가
  const leftover = document.getElementById('tagInput').value.trim().replace(',', '');
  if (leftover && !state.userTags.includes(leftover)) {
    state.userTags.push(leftover);
    renderTags();
  }

  clearInterval(state.testTimerId);
  state.testDuration = ((Date.now() - state.testStartTime) / 1000).toFixed(1);

  toggleLoading(true, 'AI 채점관이 답안을 정밀 분석하고 있습니다...');

  try {
    let data;
    const quizWords = state.sessionData.quiz_data.map(q => q.word);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quiz_words: quizWords,
          user_inputs: state.userTags,
          difficulty: state.difficulty
        })
      });
      data = await res.json();
    } catch (serverErr) {
      // 🌐 서버 없는 GitHub Pages 환경 -> 브라우저 내장 Gemini 채점기 가동!
      data = await verifyAnswersClient(quizWords, state.userTags);
    }
    toggleLoading(false);

    renderResultView(data.results || []);
    switchView('viewResult');
  } catch (err) {
    toggleLoading(false);
    alert('채점 중 오류가 발생했습니다: ' + err);
  }
});

// =================================================================
// 🎯 4지선다 객관식 퀴즈 (MCQ) 전용 엔진
// =================================================================
let mcqPreviewTimerId = null;
let mcqPreviewStartTime = 0;

// 📚 객관식 퀴즈 화면 내 주제 선택기 및 동적 단어 생성 엔진
function setupMcqTopicSelector() {
  const inputTopic = document.getElementById('inputMcqTopic');
  const btnGen = document.getElementById('btnGenerateMcqTopic');
  const badge = document.getElementById('mcqCurrentTopicBadge');
  const chips = document.querySelectorAll('.mcq-preset-chip');

  // 🎯 [신규] 퀴즈 단어 개수 컨트롤러 (최소 10개 시작!)
  const btnMinus = document.getElementById('btnMcqCountMinus');
  const btnPlus = document.getElementById('btnMcqCountPlus');
  const countDisplay = document.getElementById('mcqCountDisplay');
  const countChips = document.querySelectorAll('.mcq-count-chip');

  function updateMcqCountUI(val) {
    state.mcqWordCount = Math.max(10, Math.min(30, val)); // 최소 10개 강제 보장
    if (countDisplay) countDisplay.innerText = `${state.mcqWordCount}개`;
    countChips.forEach(c => {
      const cVal = parseInt(c.getAttribute('data-count'), 10);
      if (cVal === state.mcqWordCount) {
        c.style.borderColor = '#10b981';
        c.style.background = 'rgba(16, 185, 129, 0.15)';
        c.style.color = '#10b981';
        c.style.fontWeight = '800';
      } else {
        c.style.borderColor = 'var(--border-color)';
        c.style.background = 'var(--bg-card)';
        c.style.color = 'var(--text-secondary)';
        c.style.fontWeight = '600';
      }
    });
  }

  if (btnMinus) {
    btnMinus.onclick = () => updateMcqCountUI(state.mcqWordCount - 5);
  }

  if (btnPlus) {
    btnPlus.onclick = () => updateMcqCountUI(state.mcqWordCount + 5);
  }

  countChips.forEach(c => {
    c.onclick = () => {
      const val = parseInt(c.getAttribute('data-count'), 10);
      updateMcqCountUI(val);
    };
  });

  if (btnGen && inputTopic) {
    btnGen.onclick = async () => {
      const topicVal = inputTopic.value.trim();
      if (!topicVal) {
        alert('주제를 입력해주세요.');
        return;
      }

      const targetCount = state.mcqWordCount || 10;
      toggleLoading(true, `'${topicVal}' 분야의 핵심 개념어 ${targetCount}개를 엄선하여 퀴즈를 설계하고 있습니다...`);
      try {
        const data = await generateWordsClient('topic', topicVal, targetCount);
        toggleLoading(false);

        if (data && data.quiz_data && data.quiz_data.length > 0) {
          state.sessionData = {
            quiz_data: data.quiz_data,
            source_name: topicVal,
            user_story: '',
            history: []
          };
          if (badge) badge.innerText = `현재 주제: ${topicVal} (${data.quiz_data.length}문제)`;
          
          // 새 단어 생성 시 블라인드 상태로 리셋 & 타이머 대기
          state.mcqIsRevealed = false;
          clearInterval(mcqPreviewTimerId);
          const timerElem = document.getElementById('mcqPreviewTimer');
          if (timerElem) timerElem.innerText = '00.0s';
          const btnReveal = document.getElementById('btnRevealAllWords');
          if (btnReveal) btnReveal.style.display = 'inline-block';
          const solveWrap = document.getElementById('mcqStartSolveWrap');
          if (solveWrap) solveWrap.style.display = 'none';
          const heading = document.getElementById('mcqPreviewHeading');
          const sub = document.getElementById('mcqPreviewSub');
          if (heading) heading.innerText = '단어를 확인하고 뇌에 각인하세요!';
          if (sub) sub.innerText = '아래 단어 카드를 클릭하면 단어가 공개되며 각인 타이머가 작동합니다.';

          renderMcqWordPreview();
        } else {
          alert('단어 생성에 실패했습니다. 다시 시도해주세요.');
        }
      } catch (err) {
        toggleLoading(false);
        console.error('MCQ 단어 생성 오류:', err);
      }
    };
  }

  // 프리셋 칩 클릭 시 즉시 입력 및 생성
  chips.forEach(chip => {
    chip.onclick = () => {
      const topic = chip.getAttribute('data-topic');
      if (inputTopic && topic) {
        inputTopic.value = topic;
        if (btnGen) btnGen.click();
      }
    };
  });
}

function startMcqQuiz() {
  const inputTopic = document.getElementById('inputMcqTopic');
  const currentTopic = (state.sessionData && state.sessionData.source_name) || (inputTopic ? inputTopic.value.trim() : '전기기사 전자기학');

  if (!state.sessionData || !state.sessionData.quiz_data || state.sessionData.quiz_data.length === 0) {
    const instantData = getInstantOfflineWords(currentTopic, state.mcqWordCount || 10);
    state.sessionData = {
      quiz_data: instantData.quiz_data,
      source_name: instantData.source_name,
      user_story: '',
      history: []
    };
  }

  // 화면 전환
  switchView('viewQuizMCQ');

  // 주제 뱃지 및 인풋창 동기화
  const qCount = state.sessionData.quiz_data ? state.sessionData.quiz_data.length : (state.mcqWordCount || 10);
  const badge = document.getElementById('mcqCurrentTopicBadge');
  if (badge) badge.innerText = `현재 주제: ${state.sessionData.source_name || currentTopic} (${qCount}문제)`;
  if (inputTopic && state.sessionData.source_name) inputTopic.value = state.sessionData.source_name;

  // 1단계: 단어 각인 프리뷰 영역 표시
  const previewStep = document.getElementById('mcqPreviewStep');
  const solveStep = document.getElementById('mcqSolveStep');
  if (previewStep) previewStep.style.display = 'block';
  if (solveStep) solveStep.style.display = 'none';

  // [중요] 단어는 처음부터 즉시 100% 공개 상태! (거추장스러운 가림막 제거)
  state.mcqIsRevealed = true;

  // 타이머 즉시 카운트다운/업 시작!
  clearInterval(mcqPreviewTimerId);
  mcqPreviewStartTime = Date.now();
  const timerElem = document.getElementById('mcqPreviewTimer');
  if (timerElem) timerElem.innerText = '00.0s';
  mcqPreviewTimerId = setInterval(() => {
    const elapsed = ((Date.now() - mcqPreviewStartTime) / 1000).toFixed(1);
    if (timerElem) timerElem.innerText = `${elapsed}s`;
  }, 100);

  // 단어 목록 즉시 렌더링!
  renderMcqWordPreview();

  // 상단 및 하단 [퀴즈 시작하기] 버튼 이벤트 바인딩
  const handleStartSolve = () => {
    clearInterval(mcqPreviewTimerId);
    state.memorizeDuration = ((Date.now() - mcqPreviewStartTime) / 1000).toFixed(1);
    startMcqSolving();
  };

  const btnTop = document.getElementById('btnStartSolveMcqTop');
  const btnBottom = document.getElementById('btnStartSolveMcq');
  if (btnTop) btnTop.onclick = handleStartSolve;
  if (btnBottom) btnBottom.onclick = handleStartSolve;
}

// 🔓 단어 열람 및 각인 타이머 START 함수
function revealMcqWordsAndStartTimer() {
  if (state.mcqIsRevealed) return;
  state.mcqIsRevealed = true;

  // 1. 헤더 텍스트 변경
  const heading = document.getElementById('mcqPreviewHeading');
  const sub = document.getElementById('mcqPreviewSub');
  if (heading) heading.innerText = '🔥 집중 각인 중! 충분히 외운 후 퀴즈를 시작하세요';
  if (sub) sub.innerText = '시각 앵커와 설명을 뇌에 강렬히 결합하세요. 완료되면 아래 [퀴즈 시작]을 누릅니다.';

  // 2. 타이머 작동 시작!
  clearInterval(mcqPreviewTimerId);
  mcqPreviewStartTime = Date.now();
  const timerElem = document.getElementById('mcqPreviewTimer');
  mcqPreviewTimerId = setInterval(() => {
    const elapsed = ((Date.now() - mcqPreviewStartTime) / 1000).toFixed(1);
    if (timerElem) timerElem.innerText = `${elapsed}s`;
  }, 100);

  // 3. 열람 버튼 숨기고 퀴즈 시작 버튼 표시
  const btnReveal = document.getElementById('btnRevealAllWords');
  if (btnReveal) btnReveal.style.display = 'none';

  const solveWrap = document.getElementById('mcqStartSolveWrap');
  if (solveWrap) solveWrap.style.display = 'block';

  // 4. 단어 카드들을 선명하게 재렌더링
  renderMcqWordPreview();
}

// 📇 퀴즈 전 단어 각인 카드 렌더링 (블라인드 / 공개 모드 지원)
function renderMcqWordPreview() {
  const container = document.getElementById('mcqPreviewGrid');
  if (!container) return;
  container.innerHTML = '';

  const quizData = state.sessionData.quiz_data || [];

  quizData.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'prepare-word-card';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 800; font-size: 12px; padding: 3px 8px; border-radius: 6px;">#${String(idx + 1).padStart(2, '0')}</span>
        <span style="font-size: 13px; font-weight: 800; color: #f59e0b;">${item.visual_anchor || '💡 시각 앵커'}</span>
      </div>
      <div style="font-size: 21px; font-weight: 800; color: var(--text-primary); margin-bottom: 6px; letter-spacing: -0.5px;">${item.word}</div>
      <div style="font-size: 14px; color: var(--text-secondary); line-height: 1.45; margin-bottom: 6px;">${item.definition || ''}</div>
      ${item.importance_reason ? `<div style="font-size: 12px; color: var(--text-muted); background: var(--bg-card); padding: 5px 8px; border-radius: 6px; border: 1px solid var(--border-color);">📌 ${item.importance_reason}</div>` : ''}
    `;
    container.appendChild(card);
  });
}

// 2단계: 실전 4지선다 퀴즈 풀기 시작
function startMcqSolving() {
  const previewStep = document.getElementById('mcqPreviewStep');
  const solveStep = document.getElementById('mcqSolveStep');
  if (previewStep) previewStep.style.display = 'none';
  if (solveStep) solveStep.style.display = 'block';

  state.mcqIndex = 0;
  state.mcqScore = 0;
  state.mcqResults = [];
  state.mcqStartTime = Date.now();

  startMcqTimer();
  renderMcqQuestion();
}

function startMcqTimer() {
  clearInterval(state.mcqTimerId);
  const timerElem = document.getElementById('mcqTimer');
  state.mcqTimerId = setInterval(() => {
    const elapsed = ((Date.now() - state.mcqStartTime) / 1000).toFixed(1);
    if (timerElem) timerElem.innerText = `${elapsed}s`;
  }, 100);
}

function renderMcqQuestion() {
  const quizData = state.sessionData.quiz_data;
  const current = quizData[state.mcqIndex];
  const total = quizData.length;

  // 헤더 진행도
  const currentNumElem = document.getElementById('mcqCurrentNum');
  const totalNumElem = document.getElementById('mcqTotalNum');
  if (currentNumElem) currentNumElem.innerText = state.mcqIndex + 1;
  if (totalNumElem) totalNumElem.innerText = total;

  const progressPct = Math.round(((state.mcqIndex + 1) / total) * 100);
  const bar = document.getElementById('mcqProgressBar');
  if (bar) bar.style.width = `${progressPct}%`;

  // 문제 카드 (설명 및 시각 앵커 제시)
  const anchorElem = document.getElementById('mcqQuestionAnchor');
  const defElem = document.getElementById('mcqQuestionDef');
  const reasonElem = document.getElementById('mcqQuestionReason');

  if (anchorElem) anchorElem.innerText = current.visual_anchor || '💡 시각 앵커';
  if (defElem) defElem.innerText = current.definition || '다음 설명에 해당하는 개념 단어는?';
  if (reasonElem) reasonElem.innerText = current.importance_reason ? `📌 포인트: ${current.importance_reason}` : '';

  // 피드백 바 숨기기
  const feedbackBar = document.getElementById('mcqFeedbackBar');
  if (feedbackBar) {
    feedbackBar.style.display = 'none';
    feedbackBar.innerText = '';
  }

  // 4지선다 보기 생성
  const correctWord = current.word;
  let distractors = quizData
    .filter((_, idx) => idx !== state.mcqIndex)
    .map(item => item.word);

  // 단어가 4개 미만일 때 오프라인 단어장에서 보충
  if (distractors.length < 3) {
    const fallbackWords = ["기억의궁전", "시각앵커", "페그시스템", "작업기억", "뇌가소성", "장기기억", "인출단서", "분산학습"];
    fallbackWords.forEach(w => {
      if (w !== correctWord && !distractors.includes(w)) {
        distractors.push(w);
      }
    });
  }

  // 오답 셔플 후 3개 선택
  distractors.sort(() => Math.random() - 0.5);
  const chosenDistractors = distractors.slice(0, 3);

  // 4개 선택지 조합 및 최종 셔플
  const options = [correctWord, ...chosenDistractors];
  options.sort(() => Math.random() - 0.5);

  // 선택지 렌더링
  const grid = document.getElementById('mcqOptionsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];

  options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'mcq-option-btn';
    btn.innerHTML = `
      <span class="mcq-option-letter">${letters[idx]}</span>
      <span class="mcq-option-text">${opt}</span>
    `;
    btn.onclick = () => selectMcqOption(opt, correctWord, current, btn, grid);
    grid.appendChild(btn);
  });
}

function selectMcqOption(selectedWord, correctWord, currentItem, clickedBtn, grid) {
  // 모든 보기 버튼 비활성화 (중복 터치 방지)
  const buttons = grid.querySelectorAll('.mcq-option-btn');
  buttons.forEach(b => b.disabled = true);

  const isCorrect = (selectedWord === correctWord);
  const feedbackBar = document.getElementById('mcqFeedbackBar');
  const comboElem = document.getElementById('mcqComboBadge');

  if (!state.currentCombo) state.currentCombo = 0;

  if (isCorrect) {
    state.mcqScore++;
    state.currentCombo++;
    clickedBtn.classList.add('correct');

    // 상용 오디오 피드백
    if (state.currentCombo >= 3) {
      SoundEngine.playCombo();
    } else {
      SoundEngine.playCorrect();
    }

    // 콤보 배지 업데이트
    if (comboElem) {
      if (state.currentCombo >= 2) {
        comboElem.style.display = 'inline-block';
        comboElem.innerText = `🔥 ${state.currentCombo} COMBO!`;
      } else {
        comboElem.style.display = 'none';
      }
    }
    if (feedbackBar) {
      feedbackBar.style.display = 'block';
      feedbackBar.style.background = 'rgba(16, 185, 129, 0.15)';
      feedbackBar.style.color = '#10b981';
      feedbackBar.innerText = '🎯 정답입니다! 두뇌에 완벽하게 각인되었습니다.';
    }
  } else {
    state.currentCombo = 0;
    if (comboElem) comboElem.style.display = 'none';
    SoundEngine.playWrong();
    clickedBtn.classList.add('wrong');
    // 정답 버튼을 초록색으로 밝혀서 학습 지원
    buttons.forEach(b => {
      const textElem = b.querySelector('.mcq-option-text');
      if (textElem && textElem.innerText === correctWord) {
        b.classList.add('correct');
      }
    });
    if (feedbackBar) {
      feedbackBar.style.display = 'block';
      feedbackBar.style.background = 'rgba(239, 68, 68, 0.15)';
      feedbackBar.style.color = '#ef4444';
      feedbackBar.innerText = `❌ 아쉽습니다! 정답은 [${correctWord}] 입니다.`;
    }
  }

  // 결과 수집 (renderResultView 형식과 100% 호환)
  state.mcqResults.push({
    original: correctWord,
    matched_input: selectedWord,
    is_correct: isCorrect,
    feedback: isCorrect ? '정답 (객관식 퀴즈 마스터)' : `오답 (선택: ${selectedWord} ➔ 정답: ${correctWord})`
  });

  // 0.8초 후 다음 문제 또는 시험 종료
  setTimeout(() => {
    state.mcqIndex++;
    if (state.mcqIndex < state.sessionData.quiz_data.length) {
      renderMcqQuestion();
    } else {
      finishMcqQuiz();
    }
  }, 350);
}

function finishMcqQuiz() {
  clearInterval(state.mcqTimerId);
  state.testDuration = ((Date.now() - state.mcqStartTime) / 1000).toFixed(1);

  renderResultView(state.mcqResults);
  switchView('viewResult');
}

function renderResultView(results) {
  let correctCount = 0;
  const table = document.getElementById('resultTable');
  table.innerHTML = '';

  // 안전 초기화
  if (!Array.isArray(state.learnedWordsList)) state.learnedWordsList = [];
  state.lastWrongQuizData = [];

  const quizList = (state.sessionData && Array.isArray(state.sessionData.quiz_data)) ? state.sessionData.quiz_data : [];
  const validResults = Array.isArray(results) ? results : [];

  validResults.forEach(res => {
    if (res.is_correct) {
      correctCount++;
      if (!state.learnedWordsList.includes(res.original)) {
        state.learnedWordsList.push(res.original);
      }
    } else {
      const wrongItem = quizList.find(q => q.word === res.original);
      if (wrongItem) {
        state.lastWrongQuizData.push(wrongItem);
      }
    }

    const row = document.createElement('div');
    row.className = `result-row ${res.is_correct ? 'correct' : 'wrong'}`;
    row.innerHTML = `
      <div class="result-word-info">
        <div class="res-orig">${res.is_correct ? '✅' : '❌'} ${res.original}</div>
        <div class="res-input">내가 쓴 답: <strong>${res.matched_input || '(미인출)'}</strong></div>
      </div>
      <div class="res-feedback">${res.feedback || ''}</div>
    `;
    table.appendChild(row);
  });

  const total = quizList.length || validResults.length || 5;
  const accuracy = Math.round((correctCount / total) * 100);

  document.getElementById('resultScore').innerText = `${accuracy}%`;

  // 🏆 상용 등급 배지 & 축하 팡파레 & 콘페티
  const gradeBadge = document.getElementById('resultGradeBadge');
  if (gradeBadge) {
    if (accuracy === 100) {
      gradeBadge.className = 'grade-pill grade-s';
      gradeBadge.innerText = '🏆 S등급 (마스터)';
      SoundEngine.playFanfare();
      launchCelebrationConfetti();
    } else if (accuracy >= 80) {
      gradeBadge.className = 'grade-pill grade-a';
      gradeBadge.innerText = '🥇 A등급 (우수)';
      SoundEngine.playFanfare();
      launchCelebrationConfetti();
    } else if (accuracy >= 60) {
      gradeBadge.className = 'grade-pill grade-b';
      gradeBadge.innerText = '🥈 B등급 (양호)';
      SoundEngine.playCorrect();
    } else {
      gradeBadge.className = 'grade-pill grade-c';
      gradeBadge.innerText = '🥉 C등급 (복습 권장)';
    }
  }

  // 오답 개수 배지 동기화
  const wrongBadge = document.getElementById('wrongCountBadge');
  if (wrongBadge) {
    wrongBadge.innerText = `${state.lastWrongQuizData.length}개`;
  }
  document.getElementById('statMemTime').innerText = `${state.memorizeDuration || 0}초`;
  document.getElementById('statTestTime').innerText = `${state.testDuration || 0}초`;
  document.getElementById('statCorrect').innerText = `${correctCount} / ${total}개`;

  // 피드백 헤드라인
  const titleElem = document.getElementById('resultTitle');
  if (accuracy === 100) titleElem.innerText = '완벽합니다! 뇌의 신경망이 단단히 연결되었습니다 🔥';
  else if (accuracy >= 60) titleElem.innerText = '좋은 흐름입니다! 절반 이상을 성공적으로 인출했습니다 👏';
  else titleElem.innerText = '괜찮습니다! 쉬움 모드로 시각 앵커를 다시 확인해보세요 🌱';

  // 복기용 연상 스토리
  const reviewCard = document.getElementById('reviewStoryCard');
  if (state.sessionData && state.sessionData.user_story) {
    reviewCard.style.display = 'block';
    document.getElementById('reviewStoryText').innerText = state.sessionData.user_story;
    // 🧠 AI 연상법 코칭 비동기 호출
    fetchAiCoaching(validResults, accuracy);
  } else {
    reviewCard.style.display = 'none';
    const coachCard = document.getElementById('aiCoachingCard');
    if (coachCard) coachCard.style.display = 'none';
  }

  // 히스토리 안전 추가
  if (state.sessionData) {
    if (!Array.isArray(state.sessionData.history)) {
      state.sessionData.history = [];
    }
    state.sessionData.history.push({
      date: new Date().toISOString().replace('T', ' ').substring(0, 19),
      memorize_sec: state.memorizeDuration || 0,
      test_sec: state.testDuration || 0,
      correct: correctCount,
      total: total,
      accuracy: accuracy
    });
  }

  // 🗄️ [SQLite 자동 저장] 시험이 끝나자마자 DB에 100% 자동 영구 보존
  triggerAutoSave(validResults, correctCount, total, accuracy);
}

// =================================================================
// 6. 결과 화면 액션 버튼들 (스마트 연속 훈련 & 오답 복습)
// =================================================================

// ⚡ 맞힌 단어 제외하고 동일 주제의 새로운 5단어 생성 ➔ 즉시 다음 세트 시작
document.getElementById('btnNextSetExclude').addEventListener('click', async () => {
  toggleLoading(true, 'AI가 기존에 마스터한 단어를 제외하고 새로운 핵심 단어를 엄선하고 있습니다...');

  try {
    let payload = {};
    let url = '/api/generate';

    if (state.activeTab === 'pdf' && state.selectedPdfBase64) {
      url = '/api/generate-from-pdf';
      payload = {
        pdf_base64: state.selectedPdfBase64,
        start_page: document.getElementById('inputStartPage').value || 1,
        end_page: document.getElementById('inputEndPage').value || 0,
        count: state.wordCount,
        pdf_name: state.selectedPdfName,
        exclude_words: state.learnedWordsList
      };
    } else if (state.activeTab === 'multi') {
      payload = {
        mode: 'multi',
        input: document.getElementById('inputMultiTopics').value.trim() || '전자기학, 거시경제학, 운영체제, 민법, 심리학',
        count: state.wordCount,
        exclude_words: state.learnedWordsList
      };
    } else if (state.activeTab === 'topic') {
      payload = {
        mode: 'topic',
        input: document.getElementById('inputTopic').value.trim() || '전기기사 전자기학',
        count: state.wordCount,
        exclude_words: state.learnedWordsList
      };
    } else {
      payload = {
        mode: 'text',
        input: document.getElementById('inputText').value.trim(),
        count: state.wordCount,
        exclude_words: state.learnedWordsList
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    toggleLoading(false);

    if (data.error) {
      alert(data.error);
      return;
    }

    state.sessionData = data;
    renderPrepareView();
    switchView('viewPrepare');
  } catch (err) {
    toggleLoading(false);
    alert('다음 단어 세트 생성 중 오류: ' + err);
  }
});

// ⚠️ 틀린 단어만 집중 복습
document.getElementById('btnRetryWrong').addEventListener('click', () => {
  if (!state.lastWrongQuizData || state.lastWrongQuizData.length === 0) {
    alert('🎉 모든 단어를 맞히셨습니다! [맞힌 단어 제외하고 다음 단어 도전]을 눌러보세요!');
    return;
  }
  state.sessionData.quiz_data = [...state.lastWrongQuizData];
  renderPrepareView();
  switchView('viewPrepare');
});

// 🔁 전체 단어 재도전
document.getElementById('btnRetrySame').addEventListener('click', () => {
  renderPrepareView();
  switchView('viewPrepare');
});

// 🏠 새로운 주제로 이동
document.getElementById('btnNewTraining').addEventListener('click', () => {
  switchView('viewSetup');
});

// 💾 이 세트 영구 저장
document.getElementById('btnSaveSet').addEventListener('click', async () => {
  const title = prompt('이 훈련 세트의 이름을 입력하세요:', state.sessionData.source_name || document.getElementById('inputTopic').value || '기억술 세트');
  if (!title) return;

  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: state.currentUser.user_id,
        title: title,
        session_data: state.sessionData
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(`'${title}' 세트가 성공적으로 저장되었습니다!`);
      await loadSavedList();
    }
  } catch (err) {
    alert('저장 실패: ' + err);
  }
});

// 🗄️ 하이브리드 자동 저장 함수 (SQLite + Google Sheets + LocalStorage)
async function triggerAutoSave(results, correctCount, total, accuracy) {
  const payload = {
    title: state.sessionData.source_name || document.getElementById('inputTopic').value || '기억술 훈련',
    quiz_data: state.sessionData.quiz_data,
    user_story: state.sessionData.user_story,
    difficulty: state.difficulty,
    memorize_sec: state.memorizeDuration,
    test_sec: state.testDuration,
    total_words: total,
    correct_words: correctCount,
    accuracy: accuracy,
    hints_used: state.hintsOpened ? 1 : 0,
    details: results
  };

  // 1. 하이브리드 영구 저장 (로컬 + 구글시트)
  saveHybrid('log_concept', payload);
  saveHybrid('save_training', payload);

  // 2. 서버 통신 시도 (로컬/Render 실행 중일 때)
  try {
    const userId = state.currentUser ? state.currentUser.user_id : 1;
    await fetch('/api/auto-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, ...payload })
    });
  } catch (e) {}

  await loadSavedList();
}

// 🧠 AI 연상법 코칭 비동기 분석 함수
async function fetchAiCoaching(results, accuracy) {
  const coachCard = document.getElementById('aiCoachingCard');
  if (!coachCard) return;
  
  coachCard.style.display = 'block';
  document.getElementById('techScoreNum').innerText = '분석 중...';
  document.getElementById('coachSummaryText').innerText = 'AI 코치가 작성하신 연상 스토리와 소요 시간, 오답 패턴을 분석하고 있습니다...';
  document.getElementById('coachWeakText').innerText = '-';
  document.getElementById('coachTipText').innerText = '-';

  try {
    let data;
    try {
      const res = await fetch('/api/evaluate-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_story: state.sessionData.user_story,
          quiz_words: state.sessionData.quiz_data.map(q => q.word),
          results: results,
          memorize_sec: state.memorizeDuration,
          test_sec: state.testDuration,
          accuracy: accuracy
        })
      });
      data = await res.json();
    } catch (serverErr) {
      // 🌐 서버 없는 환경 -> 클라이언트 Gemini 코칭
      data = await evaluateStoryClient(state.sessionData.user_story, state.sessionData.quiz_data.map(q => q.word), results, state.memorizeDuration, state.testDuration, accuracy);
    }

    document.getElementById('techScoreNum').innerText = `${data.technique_score || accuracy}점`;
    document.getElementById('coachSummaryText').innerText = data.analysis_summary || data.coach_summary || '분석 완료';
    document.getElementById('coachWeakText').innerText = data.weak_points || '없음 (양호)';
    document.getElementById('coachTipText').innerText = data.actionable_tip || data.tip || '다음에도 강렬한 시각 이미지를 유지하세요.';
  } catch (err) {
    document.getElementById('coachSummaryText').innerText = '코칭 분석을 완료했습니다.';
  }
}

// 대시보드 및 저장된 목록 로드 (사용자별 격리 + 하이브리드)
async function loadSavedList() {
  try {
    let sessions = [];
    let trainings = {};

    if (!SERVERLESS_CONFIG.isStandalone()) {
      try {
        const userId = state.currentUser ? state.currentUser.user_id : 1;
        const res = await fetch(`/api/dashboard?user_id=${userId}`);
        if (res.ok) {
          const dbData = await res.json();
          sessions = dbData.sessions || [];
          trainings = dbData.trainings || {};
        }
      } catch (serverErr) {}
    }

    if (!sessions || sessions.length === 0) {
      // 🌐 로컬스토리지에서 복원
      const localDb = JSON.parse(localStorage.getItem('brainlock_local_db') || '{"trainings":{},"concept":[],"spatial":[],"sudoku":[]}');
      trainings = localDb.trainings || {};
      sessions = localDb.concept || [];
    }

    // 좌측 사이드바 갱신
    renderSidebarHistory(sessions, trainings);

    // 드로어 단어장 세트 목록
    const container = document.getElementById('savedListContainer');
    const trainingKeys = Object.keys(trainings);
    if (container) {
      if (trainingKeys.length === 0) {
        container.innerHTML = '<p class="empty-msg">저장된 단어장 세트가 없습니다.</p>';
      } else {
        container.innerHTML = '';
        trainingKeys.forEach(title => {
          const item = trainings[title];
          const div = document.createElement('div');
          div.className = 'saved-item';
          div.innerHTML = `
            <div class="saved-item-title">${title} (${item.word_count}단어)</div>
            <div class="saved-item-date">생성일: ${item.created_at || '알 수 없음'}</div>
          `;
          div.onclick = () => {
            state.sessionData = item;
            document.getElementById('savedDrawer').classList.remove('open');
            renderPrepareView();
            switchView('viewPrepare');
          };
          container.appendChild(div);
        });
      }
    }
  } catch (err) {
    console.error('loadSavedList error:', err);
  }
}

// 좌측 사이드바 히스토리 & 저장된 단어장 라이브러리 렌더링
function renderSidebarHistory(sessions, trainings) {
  const listElem = document.getElementById('sidebarHistoryList');
  const countElem = document.getElementById('historyCount');
  const avgAccElem = document.getElementById('avgAccuracy');
  const avgMemElem = document.getElementById('avgMemTime');
  
  const savedListElem = document.getElementById('sidebarSavedList');
  const savedCountElem = document.getElementById('sidebarSavedCount');

  // 1. 실시간 훈련 세션 기록
  if (listElem && countElem && avgAccElem && avgMemElem) {
    countElem.innerText = `${sessions.length}회`;

    if (sessions.length === 0) {
      listElem.innerHTML = '<p class="empty-history">아직 훈련 기록이 없습니다.<br>첫 단어장을 생성해보세요!</p>';
      avgAccElem.innerText = '-%';
      avgMemElem.innerText = '-초';
    } else {
      const avgAcc = Math.round(sessions.reduce((sum, h) => sum + (h.accuracy || 0), 0) / sessions.length);
      const avgMem = (sessions.reduce((sum, h) => sum + (parseFloat(h.memorize_sec) || 0), 0) / sessions.length).toFixed(1);
      avgAccElem.innerText = `${avgAcc}%`;
      avgMemElem.innerText = `${avgMem}s`;

      listElem.innerHTML = '';
      sessions.slice(0, 15).forEach(h => {
        const accClass = (h.accuracy >= 80) ? 'high' : ((h.accuracy >= 50) ? 'mid' : 'low');
        const itemDiv = document.createElement('div');
        itemDiv.className = 'history-card-item';
        itemDiv.innerHTML = `
          <div class="history-card-top">
            <span class="history-card-title" title="${h.title}">${h.title}</span>
            <span class="history-card-acc ${accClass}">${h.accuracy}%</span>
          </div>
          <div class="history-card-meta">
            <span>⏱️ ${h.memorize_sec}s / ${h.test_sec}s</span>
            <span>${(h.created_at || '').substring(5, 16)}</span>
          </div>
        `;
        listElem.appendChild(itemDiv);
      });
    }
  }

  // 2. [좌측 하단] 영구 저장된 단어장 라이브러리 카드 렌더링
  if (savedListElem && savedCountElem) {
    const trainingKeys = Object.keys(trainings || {});
    savedCountElem.innerText = `${trainingKeys.length}개`;

    if (trainingKeys.length === 0) {
      savedListElem.innerHTML = '<p class="empty-history">저장된 단어장이 없습니다.<br>훈련 후 세트를 저장해보세요!</p>';
    } else {
      savedListElem.innerHTML = '';
      trainingKeys.forEach(title => {
        const item = trainings[title];
        const itemDiv = document.createElement('div');
        itemDiv.className = 'history-card-item';
        itemDiv.style.cursor = 'pointer';
        itemDiv.innerHTML = `
          <div class="history-card-top">
            <span class="history-card-title" title="${title}">📁 ${title}</span>
            <span class="history-badge" style="background: rgba(59,130,246,0.15); color: #3b82f6;">${item.word_count}단어</span>
          </div>
          <div class="history-card-meta">
            <span>${(item.created_at || '').substring(5, 16)}</span>
            <span style="color: var(--accent-primary); font-weight:700;">🚀 복습 ➔</span>
          </div>
        `;
        itemDiv.onclick = () => {
          state.sessionData = item;
          renderPrepareView();
          switchView('viewPrepare');
        };
        savedListElem.appendChild(itemDiv);
      });
    }
  }
}

// 로딩 토글 유틸
function toggleLoading(show, text = 'AI가 시각 앵커를 설계하고 있습니다...') {
  const overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  document.getElementById('loadingText').innerText = text;
  if (show) overlay.classList.add('active');
  else overlay.classList.remove('active');
}

// 앱 시작 시 자동 로드
loadSavedList();

// =================================================================
// ⚡ 순간 공간 기억력 (Chimp Spatial Memory) 전용 게임 엔진
// =================================================================

const spatialState = {
  gridSize: 4,          // 3, 4, 5, 6
  targetCount: 5,       // 1 ~ N
  ruleMode: 'adaptive', // adaptive, chimp, timed
  exposureSec: 3.0,     // 0.8 ~ 5.0
  
  gridData: [],         // 전체 타일 데이터 [{ id, num, state }]
  currentTarget: 1,     // 현재 눌러야 할 숫자
  isPlaying: false,
  isShowing: false,
  timerId: null,
  startTime: 0,
  reactionTimeMs: 0,
  streakCount: 0
};

function setupSpatialGame() {
  const gridSelect = document.getElementById('spatialGridSelect');
  const modeSelect = document.getElementById('spatialModeSelect');
  const timeSelect = document.getElementById('spatialTimeSelect');
  const btnStart = document.getElementById('btnStartSpatial');
  const btnReset = document.getElementById('btnResetSpatial');

  gridSelect.addEventListener('change', () => {
    spatialState.gridSize = parseInt(gridSelect.value, 10);
    resetSpatialGame(false);
  });

  modeSelect.addEventListener('change', () => {
    spatialState.ruleMode = modeSelect.value;
  });

  timeSelect.addEventListener('change', () => {
    spatialState.exposureSec = parseFloat(timeSelect.value);
  });

  btnStart.addEventListener('click', () => {
    startSpatialGame();
  });

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      resetSpatialGame(true);
    });
  }

  renderInitialSpatialGrid();
}

// 훈련 정지 및 초기화
function resetSpatialGame(showUserFeedback = true) {
  if (spatialState.timerId) {
    clearTimeout(spatialState.timerId);
    spatialState.timerId = null;
  }

  spatialState.isShowing = false;
  spatialState.isPlaying = false;
  spatialState.currentTarget = 1;

  const btnStart = document.getElementById('btnStartSpatial');
  if (btnStart) btnStart.disabled = false;

  const progressBar = document.getElementById('spatialProgressBar');
  if (progressBar) {
    progressBar.style.transition = 'none';
    progressBar.style.width = '0%';
  }

  const statusText = document.getElementById('spatialStatusText');
  if (statusText) {
    if (showUserFeedback) {
      statusText.innerText = '⏹️ 훈련이 정지 및 초기화되었습니다. [시작] 버튼을 눌러 다시 도전하세요.';
      statusText.style.color = 'var(--text-secondary)';
    } else {
      statusText.innerText = '훈련 설정 후 [시작] 버튼을 누르세요.';
      statusText.style.color = 'var(--text-primary)';
    }
  }

  renderInitialSpatialGrid();
}

// 초기 그리드 렌더링
function renderInitialSpatialGrid() {
  const gridArea = document.getElementById('spatialGridArea');
  const size = spatialState.gridSize;
  gridArea.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  gridArea.style.gridTemplateRows = `repeat(${size}, 1fr)`;
  gridArea.innerHTML = '';

  const totalCells = size * size;
  for (let i = 0; i < totalCells; i++) {
    const tile = document.createElement('div');
    tile.className = 'spatial-tile';
    tile.innerText = '';
    gridArea.appendChild(tile);
  }
}

// 훈련 시작
function startSpatialGame() {
  if (spatialState.isShowing || spatialState.isPlaying) return;

  const size = spatialState.gridSize;
  const totalCells = size * size;
  const maxTargets = Math.min(totalCells, spatialState.targetCount);

  spatialState.isShowing = true;
  spatialState.isPlaying = false;
  spatialState.currentTarget = 1;
  spatialState.startTime = Date.now();

  const statusText = document.getElementById('spatialStatusText');
  const btnStart = document.getElementById('btnStartSpatial');
  const progressBar = document.getElementById('spatialProgressBar');

  statusText.innerText = `👀 숫자의 위치를 빠르게 눈에 각인하세요! (1 ~ ${maxTargets})`;
  statusText.style.color = 'var(--text-primary)';
  btnStart.disabled = true;

  // 1 ~ maxTargets 랜덤 좌표 배치
  const positions = Array.from({ length: totalCells }, (_, i) => i);
  // 셔플
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  spatialState.gridData = Array(totalCells).fill(0);
  for (let num = 1; num <= maxTargets; num++) {
    spatialState.gridData[positions[num - 1]] = num;
  }

  // 타일 UI 업데이트 (숫자 노출)
  const gridArea = document.getElementById('spatialGridArea');
  gridArea.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  gridArea.style.gridTemplateRows = `repeat(${size}, 1fr)`;
  gridArea.innerHTML = '';

  for (let i = 0; i < totalCells; i++) {
    const num = spatialState.gridData[i];
    const tile = document.createElement('div');
    tile.className = 'spatial-tile';
    tile.dataset.index = i;

    if (num > 0) {
      tile.classList.add('showing');
      tile.innerText = num;
    }

    tile.addEventListener('click', () => handleSpatialTileClick(i, tile));
    gridArea.appendChild(tile);
  }

  // 노출 시간 타이머 & 프로그레스 바 가동
  const exposureMs = spatialState.exposureSec * 1000;
  progressBar.style.transition = 'none';
  progressBar.style.width = '100%';
  setTimeout(() => {
    progressBar.style.transition = `width ${exposureMs}ms linear`;
    progressBar.style.width = '0%';
  }, 30);

  if (spatialState.timerId) clearTimeout(spatialState.timerId);
  spatialState.timerId = setTimeout(() => {
    hideSpatialNumbers();
  }, exposureMs);
}

// 숫자 블라인드 처리 (기억 인출 모드 진입)
function hideSpatialNumbers() {
  spatialState.isShowing = false;
  spatialState.isPlaying = true;
  spatialState.startTime = Date.now(); // 인출 시작 시각 측정

  const statusText = document.getElementById('spatialStatusText');
  statusText.innerText = `🎯 1번부터 ${spatialState.targetCount}번까지 순서대로 터치하세요!`;
  statusText.style.color = 'var(--accent-primary)';

  const tiles = document.querySelectorAll('.spatial-tile');
  tiles.forEach((tile, i) => {
    if (spatialState.gridData[i] > 0) {
      tile.classList.remove('showing');
      tile.classList.add('hidden-target');
      tile.innerText = '?';
    }
  });
}

// 타일 클릭 판정
function handleSpatialTileClick(index, tile) {
  // 정답을 보여주는 노출 단계(isShowing) 또는 게임 인출 진행 중이 아닐 때는 클릭 무시
  if (spatialState.isShowing || !spatialState.isPlaying) return;
  if (tile.classList.contains('correct') || tile.classList.contains('wrong') || tile.classList.contains('missed')) return;

  const num = spatialState.gridData[index];

  if (num === spatialState.currentTarget) {
    // 🎯 정답 클릭
    tile.classList.remove('hidden-target');
    tile.classList.add('correct');
    tile.innerText = num;
    spatialState.currentTarget++;

    // 모든 타겟 클리어 성공!
    if (spatialState.currentTarget > spatialState.targetCount) {
      spatialGameSuccess();
    }
  } else {
    // ❌ 오답 클릭
    tile.classList.remove('hidden-target');
    tile.classList.add('wrong');
    tile.innerText = num > 0 ? num : 'X';
    spatialGameFailure(num);
  }
}

// 성공 처리
async function spatialGameSuccess() {
  spatialState.isPlaying = false;
  const elapsedMs = Date.now() - spatialState.startTime;
  spatialState.reactionTimeMs = elapsedMs;
  spatialState.streakCount++;

  const isNoSave = document.getElementById('spatialNoSaveCheck')?.checked;
  const statusText = document.getElementById('spatialStatusText');
  const tag = isNoSave ? ' (연습 모드 - DB 미저장)' : '';
  statusText.innerText = `🎉 성공! ${spatialState.targetCount}개 기억 완료! (${elapsedMs}ms)${tag}`;
  statusText.style.color = 'var(--success)';
  document.getElementById('btnStartSpatial').disabled = false;

  // SQLite 영구 자동 저장 (미저장 옵션 체크 시 내부에서 스킵)
  await saveSpatialResult(true, spatialState.targetCount);

  // 적응형 모드일 경우 다음 목표 개수 +1개 증가
  if (spatialState.ruleMode === 'adaptive') {
    const size = spatialState.gridSize;
    if (spatialState.targetCount < size * size) {
      spatialState.targetCount++;
      document.getElementById('displayTargetCount').innerText = spatialState.targetCount;
    }
  }
  loadSpatialStats();
}

// 실패 처리
async function spatialGameFailure(wrongNum) {
  spatialState.isPlaying = false;
  const elapsedMs = Date.now() - spatialState.startTime;
  spatialState.reactionTimeMs = elapsedMs;
  spatialState.streakCount = 0;

  const isNoSave = document.getElementById('spatialNoSaveCheck')?.checked;
  const statusText = document.getElementById('spatialStatusText');
  const tag = isNoSave ? ' (연습 모드 - DB 미저장)' : '';
  statusText.innerText = `❌ 실패! (${spatialState.currentTarget}번 순서였습니다)${tag}`;
  statusText.style.color = 'var(--error)';
  document.getElementById('btnStartSpatial').disabled = false;

  // 나머지 정답 위치 전체 공개
  const tiles = document.querySelectorAll('.spatial-tile');
  tiles.forEach((t, i) => {
    const n = spatialState.gridData[i];
    if (n > 0 && !t.classList.contains('correct') && !t.classList.contains('wrong')) {
      t.classList.remove('hidden-target');
      t.classList.add('missed');
      t.innerText = n;
    }
  });

  // SQLite 영구 자동 저장 (미저장 옵션 체크 시 내부에서 스킵)
  await saveSpatialResult(false, spatialState.currentTarget - 1);

  // 적응형 모드일 경우 실패 시 1개 감소 (최소 3개 유지)
  if (spatialState.ruleMode === 'adaptive' && spatialState.targetCount > 3) {
    spatialState.targetCount--;
    document.getElementById('displayTargetCount').innerText = spatialState.targetCount;
  }
  loadSpatialStats();
}

// SQLite 자동 저장 통신
async function saveSpatialResult(isSuccess, clearedCount) {
  const isNoSave = document.getElementById('spatialNoSaveCheck')?.checked;
  if (isNoSave) return;

  const payload = {
    grid_size: spatialState.gridSize,
    target_count: spatialState.targetCount,
    exposure_sec: spatialState.exposureSec,
    reaction_time_ms: spatialState.reactionTimeMs,
    is_success: isSuccess ? 1 : 0,
    cleared_count: clearedCount
  };

  saveHybrid('log_spatial', payload);

  try {
    const userId = state.currentUser ? state.currentUser.user_id : 1;
    await fetch('/api/save-spatial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, ...payload })
    });
  } catch (e) {}
}

// 공간기억 통계 대시보드 로드
async function loadSpatialStats() {
  try {
    const userId = state.currentUser ? state.currentUser.user_id : 1;
    let data;
    try {
      const res = await fetch(`/api/spatial-dashboard?user_id=${userId}`);
      data = await res.json();
    } catch (e) {
      const localDb = JSON.parse(localStorage.getItem('brainlock_local_db') || '{"spatial":[]}');
      const list = localDb.spatial || [];
      const wins = list.filter(s => s.is_success === 1);
      data = {
        max_span: wins.length > 0 ? Math.max(...wins.map(s => s.target_count || 0)) : 0,
        avg_rt: list.length > 0 ? Math.round(list.reduce((acc, s) => acc + (s.reaction_time_ms || 0), 0) / list.length) : 0,
        total_plays: list.length,
        total_wins: wins.length
      };
    }

    document.getElementById('statSpatialMaxSpan').innerText = `${data.max_span || 0}개`;
    document.getElementById('statSpatialAvgRt').innerText = `${data.avg_rt || 0}ms`;
    
    const winRate = data.total_plays > 0 ? Math.round((data.total_wins / data.total_plays) * 100) : 0;
    document.getElementById('statSpatialWinRate').innerText = `${winRate}% (${data.total_wins}/${data.total_plays})`;
  } catch (e) {}
}

// =================================================================
// 🏠 메인 종합 대시보드 (viewDashboard) DB 데이터 전체 시각화 로드
// =================================================================
async function loadMainDashboard() {
  try {
    const userId = state.currentUser ? state.currentUser.user_id : 1;
    
    // 1. 개념 훈련 DB & 공간 기억 DB & 스도쿠 DB 병렬 조회 (서버 우선 -> 로컬 폴백)
    let conceptRes = { sessions: [], trainings: {} };
    let spatialRes = { history: [], max_span: 0, avg_rt: 0, total_wins: 0, total_plays: 0 };
    
    if (!SERVERLESS_CONFIG.isStandalone()) {
      try {
        [conceptRes, spatialRes] = await Promise.all([
          fetch(`/api/dashboard?user_id=${userId}`).then(r => r.json()),
          fetch(`/api/spatial-dashboard?user_id=${userId}`).then(r => r.json()),
          fetch(`/api/sudoku-dashboard?user_id=${userId}`).then(r => r.json())
        ]);
      } catch (serverErr) {}
    }

    if (!conceptRes.sessions || conceptRes.sessions.length === 0) {
      // 🌐 서버 없는 GitHub Pages / 로컬 환경 -> localStorage 로드!
      const localDb = JSON.parse(localStorage.getItem('brainlock_local_db') || '{"trainings":{},"concept":[],"spatial":[],"sudoku":[]}');
      conceptRes = { sessions: localDb.concept || [], trainings: localDb.trainings || {} };
      const spList = localDb.spatial || [];
      const spWins = spList.filter(s => s.is_success === 1);
      spatialRes = {
        history: spList,
        max_span: spWins.length > 0 ? Math.max(...spWins.map(s => s.target_count || 0)) : 0,
        avg_rt: spList.length > 0 ? Math.round(spList.reduce((acc, s) => acc + (s.reaction_time_ms || 0), 0) / spList.length) : 0,
        total_plays: spList.length,
        total_wins: spWins.length
      };
      const suList = localDb.sudoku || [];
      sudokuRes = {
        history: suList,
        best_time: suList.length > 0 ? Math.min(...suList.map(s => s.clear_time_sec || 999)) : 0,
        avg_time: suList.length > 0 ? Math.round(suList.reduce((acc, s) => acc + (s.clear_time_sec || 0), 0) / suList.length) : 0,
        total_clears: suList.length
      };
    }

    const conceptSessions = conceptRes.sessions || [];
    const spatialSessions = spatialRes.history || [];
    const sudokuSessions = sudokuRes.history || [];
    const trainings = conceptRes.trainings || {};

    // 2. 4대 KPI 계산 및 렌더링
    const totalConceptCount = conceptSessions.length;
    const totalSpatialCount = spatialRes.total_plays || 0;
    const totalSudokuCount = 0;
    const grandTotalPlays = totalConceptCount + totalSpatialCount + totalSudokuCount;

    // 평균 정답률
    let avgAcc = '-';
    if (totalConceptCount > 0) {
      const sumAcc = conceptSessions.reduce((acc, s) => acc + (s.accuracy || 0), 0);
      avgAcc = `${Math.round(sumAcc / totalConceptCount)}%`;
    }

    document.getElementById('dashAvgAcc').innerText = avgAcc;
    document.getElementById('dashMaxSpan').innerText = `${spatialRes.max_span || 0}개`;
    document.getElementById('dashAvgRt').innerText = `${spatialRes.avg_rt || 0}ms`;
    document.getElementById('dashTotalPlays').innerText = `${grandTotalPlays}회`;

    // 3. 📁 [독립 테이블] 저장된 단어장 보관함 렌더링
    const savedTableBody = document.getElementById('dashSavedTableBody');
    const savedCountElem = document.getElementById('dashSavedCount');
    const trainingKeys = Object.keys(trainings);

    if (savedCountElem) savedCountElem.innerText = trainingKeys.length;

    if (savedTableBody) {
      if (trainingKeys.length === 0) {
        savedTableBody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-table-msg">저장된 단어장이 없습니다. 상단 훈련에서 '💾 이 세트 영구 저장'을 눌러보세요!</td>
          </tr>
        `;
      } else {
        savedTableBody.innerHTML = '';
        trainingKeys.forEach(title => {
          const item = trainings[title];
          const tr = document.createElement('tr');
          const hasStory = item.user_story ? '📝 스토리 있음' : '<span style="color:var(--text-muted);">-</span>';
          const timeStr = item.created_at ? item.created_at.substring(2, 16) : '-';

          tr.innerHTML = `
            <td><strong>${title}</strong></td>
            <td><span class="history-badge" style="background: rgba(59,130,246,0.15); color: #3b82f6;">${item.word_count || 5}개</span></td>
            <td>${hasStory}</td>
            <td>${timeStr}</td>
            <td>
              <div style="display:flex; gap:6px;">
                <button class="btn-primary btn-sm btn-train-set" data-title="${title}" style="padding: 4px 10px; font-size: 11px;">
                  🚀 훈련 ➔
                </button>
                <button class="btn-delete-chip btn-delete-set" data-title="${title}" title="단어장 삭제">
                  🗑️
                </button>
              </div>
            </td>
          `;

          tr.querySelector('.btn-train-set').onclick = () => {
            state.sessionData = item;
            renderPrepareView();
            switchView('viewPrepare');
          };

          tr.querySelector('.btn-delete-set').onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`'${title}' 단어장을 정말 영구 삭제하시겠습니까?\n(구글 시트와 로컬 DB 모두에서 삭제됩니다)`)) {
              await deleteTrainingSet(title);
            }
          };

          savedTableBody.appendChild(tr);
        });
      }
    }

    // 4. 📊 [독립 테이블] 통합 훈련 세션 로그 테이블 생성 (최근 순 정렬)
    const logTableBody = document.getElementById('dashLogTableBody');
    if (logTableBody) {
      const unifiedLogs = [];

      // 개념 단어 훈련 로그 정규화
      conceptSessions.forEach(s => {
        unifiedLogs.push({
          type: 'concept',
          created_at: s.created_at || '',
          title: s.title || '단어 훈련',
          performance: `${s.accuracy}% (${s.correct_words}/${s.total_words})`,
          scoreClass: s.accuracy >= 80 ? 'high' : (s.accuracy >= 50 ? 'mid' : 'low'),
          duration: `암기 ${s.memorize_sec}s / 인출 ${s.test_sec}s`
        });
      });

      // 공간 기억력 로그 정규화
      spatialSessions.forEach(s => {
        const isWin = s.is_success === 1;
        unifiedLogs.push({
          type: 'spatial',
          created_at: s.created_at || '',
          title: `격자 ${s.grid_size}x${s.grid_size} (목표 ${s.target_count}개)`,
          performance: isWin ? `성공 (${s.target_count}개)` : `실패 (${s.cleared_count}개 통과)`,
          scoreClass: isWin ? 'high' : 'low',
          duration: `반응 ${s.reaction_time_ms}ms`
        });
      });


      // 시간순 내림차순 정렬
      unifiedLogs.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));

      if (unifiedLogs.length === 0) {
        logTableBody.innerHTML = `
          <tr>
            <td colspan="5" class="empty-table-msg">아직 훈련 기록이 없습니다. 위 훈련 카드를 눌러 첫 훈련을 시작하세요!</td>
          </tr>
        `;
      } else {
        logTableBody.innerHTML = '';
        unifiedLogs.slice(0, 25).forEach(log => {
          const tr = document.createElement('tr');
          let typeBadge = '';
          if (log.type === 'concept') {
            typeBadge = '<span class="history-badge" style="background: rgba(59,130,246,0.15); color: #3b82f6;">🧠 개념 연상</span>';
          } else if (log.type === 'spatial') {
            typeBadge = '<span class="history-badge" style="background: rgba(245,158,11,0.15); color: #f59e0b;">⚡ 공간 기억</span>';
          } else {
            typeBadge = '<span class="history-badge" style="background: rgba(16,185,129,0.15); color: #10b981;">🔢 두뇌 스도쿠</span>';
          }
          
          const timeStr = log.created_at ? log.created_at.substring(2, 16) : '-';

          tr.innerHTML = `
            <td>${timeStr}</td>
            <td>${typeBadge}</td>
            <td><strong>${log.title}</strong></td>
            <td><span class="history-card-acc ${log.scoreClass}">${log.performance}</span></td>
            <td>${log.duration}</td>
          `;
          logTableBody.appendChild(tr);
        });
      }
    }

    // 5. 탭 전환 이벤트 (단어장 보관함 ⇄ 훈련 로그)
    const tabSavedBtn = document.getElementById('tabDashSavedBtn');
    const tabLogsBtn = document.getElementById('tabDashLogsBtn');
    const savedContainer = document.getElementById('dashSavedTableContainer');
    const logsContainer = document.getElementById('dashLogsTableContainer');

    if (tabSavedBtn && tabLogsBtn && savedContainer && logsContainer) {
      tabSavedBtn.onclick = () => {
        tabSavedBtn.classList.add('active');
        tabLogsBtn.classList.remove('active');
        savedContainer.style.display = 'block';
        logsContainer.style.display = 'none';
      };

      tabLogsBtn.onclick = () => {
        tabLogsBtn.classList.add('active');
        tabSavedBtn.classList.remove('active');
        savedContainer.style.display = 'none';
        logsContainer.style.display = 'block';
      };
    }

  } catch (err) {
    console.error('메인 대시보드 로드 오류:', err);
  }
}

// =================================================================
// ⚙️ Google Sheets DB 웹훅 설정 및 관리 모달 유틸리티
// =================================================================
function setupSettingsModal() {
  const modal = document.getElementById('settingsModal');
  const btnOpen = document.getElementById('btnOpenSettings');
  const btnClose = document.getElementById('btnCloseSettings');
  const selectModel = document.getElementById('selectAiModel');
  const inputKey = document.getElementById('inputGeminiKey');
  const inputUrl = document.getElementById('inputSheetUrl');
  const btnTest = document.getElementById('btnTestWebhook');
  const btnSave = document.getElementById('btnSaveSheetUrl');
  const resultBox = document.getElementById('webhookTestResult');
  const btnClearLogs = document.getElementById('btnClearAllLogs');

  if (btnOpen && modal) {
    btnOpen.onclick = () => {
      modal.style.display = 'flex';
      resultBox.style.display = 'none';

      // 저장된 설정값 불러오기
      if (selectModel) selectModel.value = localStorage.getItem('brainlock_ai_model') || 'gemini-2.5-flash';
      if (inputKey) inputKey.value = localStorage.getItem('brainlock_gemini_key') || '';
      if (inputUrl) inputUrl.value = localStorage.getItem('brainlock_sheet_url') || '';
    };
  }

  if (btnClose && modal) {
    btnClose.onclick = () => {
      modal.style.display = 'none';
    };
  }

  // 모달 바깥 클릭 시 닫기
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) modal.style.display = 'none';
    };
  }

  // 🔗 웹훅 연결 테스트 (브라우저 직접 핑 & GitHub Pages 완전 대응)
  if (btnTest) {
    btnTest.onclick = async () => {
      const url = inputUrl.value.trim();
      if (!url) {
        alert('테스트할 구글 시트 웹 앱 URL을 먼저 입력해주세요.');
        return;
      }
      if (!url.includes('script.google.com/macros/s/')) {
        alert('올바른 Google Apps Script 웹 앱 URL 형식이 아닙니다.\n(https://script.google.com/macros/s/.../exec)');
        return;
      }

      resultBox.style.display = 'block';
      resultBox.style.background = 'rgba(59, 130, 246, 0.1)';
      resultBox.style.color = '#3b82f6';
      resultBox.innerText = '구글 시트 웹 앱으로 직접 핑(Ping)을 전송하여 검증 중입니다...';

      const startTime = Date.now();
      let success = false;
      let latency = 0;
      let msg = '';

      try {
        const testTarget = url.includes('?') ? `${url}&action=get_all` : `${url}?action=get_all`;
        const res = await fetch(testTarget, { method: 'GET', redirect: 'follow' });
        latency = Date.now() - startTime;
        if (res.ok) {
          const data = await res.json().catch(() => null);
          success = true;
          msg = (data && data.status === 'success') ? '구글 시트와 양방향 통신이 완벽하게 확인되었습니다!' : '구글 시트 웹 앱 응답 정상 확인';
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        // no-cors 비동기 핑으로 최종 도달 여부 검증
        try {
          await fetch(url, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ type: 'ping' }) });
          latency = Date.now() - startTime;
          success = true;
          msg = '구글 시트 웹훅 엔드포인트 연결이 정상 확인되었습니다!';
        } catch (noCorsErr) {
          success = false;
          msg = noCorsErr.message || '네트워크 통신 실패';
        }
      }

      if (success) {
        resultBox.style.background = 'rgba(16, 185, 129, 0.12)';
        resultBox.style.color = '#10b981';
        resultBox.innerHTML = `<strong>🟢 연동 성공! (응답 지연: ${latency}ms)</strong><br>${msg}<br><small style="color:var(--text-primary); font-weight:700;">👉 아래 [💾 설정 전체 저장] 버튼을 꼭 눌러주세요!</small>`;
      } else {
        resultBox.style.background = 'rgba(239, 68, 68, 0.12)';
        resultBox.style.color = '#ef4444';
        resultBox.innerHTML = `<strong>❌ 연결 실패:</strong> ${msg}<br><small>1) 배포 시 <strong>'액세스 권한: 모든 사용자(Anyone)'</strong>로 설정했는지 확인하세요.<br>2) URL 맨 끝이 <strong>/exec</strong> 로 끝나는지 확인하세요 (/dev는 불가).</small>`;
      }
    };
  }

  // 💾 전체 설정 저장 (AI 모델, API Key, 구글 시트 URL)
  if (btnSave) {
    btnSave.onclick = async () => {
      const selectedModel = selectModel ? selectModel.value : 'gemini-2.5-flash';
      const key = inputKey ? inputKey.value.trim() : '';
      const url = inputUrl ? inputUrl.value.trim() : '';

      // 1. 브라우저 로컬스토리지에 영구 보관 (100% 서버리스 즉시 반영)
      localStorage.setItem('brainlock_ai_model', selectedModel);
      if (key) localStorage.setItem('brainlock_gemini_key', key);
      if (url) localStorage.setItem('brainlock_sheet_url', url);

      // 2. 서버가 켜져 있으면 서버 환경변수에도 저장 시도
      try {
        if (url) {
          await fetch('/api/set-sheet-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          });
        }
      } catch (e) {}

      alert(`✅ 설정이 성공적으로 저장되었습니다!\n\n• AI 모델: ${selectedModel}\n• API 키: ${key ? '등록 완료' : '미등록'}\n• 시트 연동: ${url ? '설정 완료' : '미등록'}`);
      modal.style.display = 'none';
      loadMainDashboard();
    };
  }

  // 🧹 전체 훈련 로그 초기화
  if (btnClearLogs) {
    btnClearLogs.onclick = async () => {
      if (confirm('⚠️ 정말로 모든 훈련 로그를 초기화하시겠습니까?\n(SQLite 및 구글 시트의 로그가 모두 삭제되며 복구할 수 없습니다)')) {
        try {
          const userId = state.currentUser ? state.currentUser.user_id : 1;
          const res = await fetch('/api/clear-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
          });
          const data = await res.json();
          if (data.success) {
            alert('모든 훈련 로그가 깔끔하게 초기화되었습니다.');
            modal.style.display = 'none';
            await loadMainDashboard();
            await loadSavedList();
          }
        } catch (err) {
          alert('초기화 통신 오류: ' + err);
        }
      }
    };
  }
}

// =================================================================
// ⚡ FAST 올인원 집중 훈련 모드 (연상법 + 객관식 퀴즈 융합 / 제로 세팅)
// =================================================================

const FAST_TOPIC_BANK = [
  {
    topic: "전자기학",
    fusionStory: "⚡ 번개가 치자 🧲 자석이 ⚖️ 저울 위로 날아가 📜 마법두루마리를 펴고 🥊 글러브로 로렌츠힘을 쳤다!",
    words: [
      { word: "전계", anchor: "⚡ 번개", def: "전하가 전기력을 미치는 공간 영역", reason: "전위차 및 전기력선의 기본" },
      { word: "자계", anchor: "🧲 자석", def: "자극이나 전류에 의해 자기력이 작용하는 공간", reason: "전자기 유도와 모터 구동의 핵심" },
      { word: "쿨롱의법칙", anchor: "⚖️ 저울", def: "두 전하 사이 작용하는 정전기력의 크기 공식", reason: "전기장 세기 계산 필수 공식" },
      { word: "맥스웰방정식", anchor: "📜 마법두루마리", def: "전기장과 자기장의 상호작용을 통합한 4대 방정식", reason: "전자기파 존재의 이론적 증명" },
      { word: "로렌츠힘", anchor: "🥊 글러브", def: "자기장 속을 운동하는 하전입자가 받는 힘", reason: "플레밍의 왼손법칙과 입자 가속 원리" }
    ]
  },
  {
    topic: "거시경제학",
    fusionStory: "거대하게 부푼 🎈 풍선이 🏦 은행탑에 부딪히자 📈 황금계단이 무너지고 🎢 롤러코스터 위에서 💸 돈비가 쏟아졌다!",
    words: [
      { word: "인플레이션", anchor: "🎈 풍선", def: "물가가 지속적으로 상승하여 화폐가치가 하락하는 현상", reason: "중앙은행 통화정책의 핵심 지표" },
      { word: "기준금리", anchor: "🏦 은행탑", def: "중앙은행이 다른 금융기관과 거래할 때 기준이 되는 금리", reason: "시중 유동성 및 경기 조절 도구" },
      { word: "GDP", anchor: "📈 황금계단", def: "일정 기간 동안 한 나라 안에서 생산된 최종 생산물의 시장가치", reason: "국가 경제 규모와 성장률 측정" },
      { word: "필립스곡선", anchor: "🎢 롤러코스터", def: "실업률과 인플레이션율 간의 역(음)의 상관관계", reason: "경기 과열과 침체 정책 딜레마" },
      { word: "양적완화", anchor: "💸 돈비", def: "중앙은행이 국채 등을 매입해 시장에 직접 유동성을 공급하는 정책", reason: "제로금리 한계 극복 비전통 정책" }
    ]
  },
  {
    topic: "인지심리학",
    fusionStory: "🧠 칠판에 적힌 기억을 🔑 황금열쇠로 잠그고 🏷️ 라벨기를 붙였더니 📻 잡음라디오를 뚫고 🥇 금메달이 튀어나왔다!",
    words: [
      { word: "작업기억", anchor: "🧠 칠판", def: "정보를 일시적으로 유지하며 조작하는 뇌의 실행 기능", reason: "문제해결과 주의집중의 중추" },
      { word: "인출단서", anchor: "🔑 황금열쇠", def: "장기기억 속에 저장된 정보를 떠올리게 돕는 자극", reason: "망각 극복 및 회상 확률 증대" },
      { word: "부호화특수성", anchor: "🏷️ 라벨기", def: "기억을 입력할 당시의 맥락이 회상 시 맥락과 일치할 때 인출이 촉진되는 원리", reason: "시험 환경 유사도 훈련의 근거" },
      { word: "간섭이론", anchor: "📻 잡음라디오", def: "이전이나 이후에 학습한 다른 정보로 인해 기억 회상이 방해받는 현상", reason: "정보 중복 방지와 휴식의 중요성" },
      { word: "초두효과", anchor: "🥇 금메달", def: "학습 목록에서 가장 처음 제시된 항목을 더 잘 기억하는 현상", reason: "장기기억 전이 우선순위 효과" }
    ]
  },
  {
    topic: "뇌신경과학",
    fusionStory: "🌉 흔들다리 위에서 🎁 깜짝상자가 터지자 🐎 바다말이 튀어나와 💡 반딧불이 숲을 지나 👑 왕관조종실에 도달했다!",
    words: [
      { word: "시냅스", anchor: "🌉 흔들다리", def: "두 신경세포 사이에서 신호가 전달되는 연결 접점", reason: "학습과 기억에 따른 가소성 발생" },
      { word: "도파민", anchor: "🎁 깜짝상자", def: "동기부여, 보상 예측, 쾌감을 조절하는 신경전달물질", reason: "반복 행동과 중독 및 몰입의 핵심" },
      { word: "해마", anchor: "🐎 바다말", def: "새로운 기억을 형성하고 시공간 정보를 처리하는 뇌 부위", reason: "단기기억의 장기기억 전환 중추" },
      { word: "뉴런", anchor: "💡 반딧불이", def: "전기적·화학적 신호를 통해 정보를 처리하는 신경세포", reason: "신경계의 구조적·기능적 기본 단위" },
      { word: "전두엽", anchor: "👑 왕관조종실", def: "의사결정, 기획, 충동억제 등 고차원 인지기능을 총괄하는 전두부", reason: "작업기억 및 메타인지의 사령탑" }
    ]
  },
  {
    topic: "민법총칙",
    fusionStory: "📜 도장계약서에 ⏳ 모래시계가 멈추자 🛡️ 방패가 깨지며 ↩️ 되돌리기버튼을 눌렀으나 💨 연기구름으로 무효가 되었다!",
    words: [
      { word: "법률행위", anchor: "📜 도장계약서", def: "의사표시를 요소로 하여 법률효과를 발생시키는 행위", reason: "사적자치의 원칙을 실현하는 핵심 수단" },
      { word: "소멸시효", anchor: "⏳ 모래시계", def: "권리자가 권리를 행사할 수 있음에도 행사하지 않아 권리가 소멸하는 제도", reason: "법적 안정성과 거래 보호" },
      { word: "권리능력", anchor: "🛡️ 방패", def: "권리의 주체가 되어 권리를 누리고 의무를 질 수 있는 자격", reason: "자연인과 법인의 법적 지위 기본" },
      { word: "취소권", anchor: "↩️ 되돌리기버튼", def: "일단 유효하게 성립한 법률행위의 효력을 소급하여 무효로 만드는 권리", reason: "사기, 강박, 착오 시 권리구제" },
      { word: "무효", anchor: "💨 연기구름", def: "법률행위가 성립 당초부터 당연히 효력이 없는 상태", reason: "강행규정 위반 및 반사회질서 보호" }
    ]
  },
  {
    topic: "컴퓨터네트워크",
    fusionStory: "🤝 악수를 나눈 뒤 📦 택배상자를 싣고 🚦 신호등교차로를 지나 📖 전화번호부로 찾아가 🧱 불벽을 무사히 통과했다!",
    words: [
      { word: "TCP핸드셰이크", anchor: "🤝 악수", def: "연결형 통신을 수립하기 위해 3단계로 패킷을 주고받는 절차", reason: "신뢰성 있는 데이터 전송의 전제조건" },
      { word: "패킷", anchor: "📦 택배상자", def: "네트워크를 통해 전송되는 데이터의 표준 분할 단위", reason: "회선 효율 극대화와 오류 검출" },
      { word: "라우터", anchor: "🚦 신호등교차로", def: "서로 다른 네트워크를 연결하고 최적의 경로를 배정하는 중계 장비", reason: "인터넷 트래픽 최적화 필수 장비" },
      { word: "DNS", anchor: "📖 전화번호부", def: "도메인 이름을 컴퓨터가 이해하는 IP 주소로 변환해주는 시스템", reason: "웹 브라우징 및 서비스 연결의 관문" },
      { word: "방화벽", anchor: "🧱 불벽", def: "외부 침입으로부터 내부 네트워크를 보호하는 보안 시스템", reason: "비인가 패킷 차단 및 네트워크 보안" }
    ]
  },
  {
    topic: "인공지능딥러닝",
    fusionStory: "🔄 거꾸로태엽을 돌려 ⚡ 스위치를 켜자 🧥 꽉끼는정장을 입은 🤖 변신로봇이 🔍 돋보기로 모든 단어를 비췄다!",
    words: [
      { word: "역전파", anchor: "🔄 거꾸로태엽", def: "출력층의 오차를 역방향으로 전달하며 가중치를 업데이트하는 학습 알고리즘", reason: "심층 신경망 학습의 핵심 기둥" },
      { word: "활성화함수", anchor: "⚡ 스위치", def: "입력 신호의 총합을 출력 신호로 변환하는 비선형 수학 함수", reason: "신경망에 비선형 표현력 부여" },
      { word: "과적합", anchor: "🧥 꽉끼는정장", def: "모델이 훈련 데이터에만 지나치게 맞춰져 새로운 데이터 예측력이 떨어지는 현상", reason: "드롭아웃, 정규화 등 성능 개선의 이유" },
      { word: "트랜스포머", anchor: "🤖 변신로봇", def: "어텐션 메커니즘을 기반으로 순차적 처리 없이 문맥을 파악하는 모델 구조", reason: "현대 LLM(GPT, Gemini)의 근간 아키텍처" },
      { word: "어텐션", anchor: "🔍 돋보기", def: "입력 시퀀스 중 출력과 가장 밀접한 연관이 있는 부분에 가중치를 집중하는 기법", reason: "장거리 문맥 의존성 해결" }
    ]
  },
  {
    topic: "우주천문학",
    fusionStory: "🕳️ 블랙홀소용돌이 주변에 🕸️ 거미줄이 쳐지고 🎆 대폭발폭죽이 터지자 🚗 빨간후미등이 🌌 무지개구름요람 속으로 빨려들어갔다!",
    words: [
      { word: "사건의지평선", anchor: "🕳️ 블랙홀소용돌이", def: "빛조차 탈출할 수 없는 블랙홀의 경계면", reason: "일반상대성이론의 극단적 경계" },
      { word: "암흑물질", anchor: "🕸️ 거미줄", def: "빛을 내지 않으나 중력을 통해 은하를 묶어두는 미지의 물질", reason: "우주 질량의 85%를 차지하는 수수께끼" },
      { word: "초신성", anchor: "🎆 대폭발폭죽", def: "진화의 마지막 단계에 이른 무거운 별이 거대하게 폭발하는 현상", reason: "우주에 중원소를 공급하는 원천" },
      { word: "적색편이", anchor: "🚗 빨간후미등", def: "멀어지는 천체에서 오는 빛의 파장이 길어져 붉게 보이는 현상", reason: "우주 팽창을 증명한 허블의 법칙" },
      { word: "성운", anchor: "🌌 무지개구름요람", def: "우주 공간에 희박하게 퍼져 있는 성간 가스와 먼지의 구름", reason: "새로운 별과 행성계가 탄생하는 요람" }
    ]
  },
  {
    topic: "행동경제학",
    fusionStory: "바다에 ⚓ 거대한닻을 내리자 짝꿍이 👉 팔꿈치슬쩍 찔러 😱 빼앗긴지갑을 🖼️ 액자틀에 끼운 채 🕳️ 돈빠진구덩이에서 건져냈다!",
    words: [
      { word: "닻내림효과", anchor: "⚓ 거대한닻", def: "초기에 제시된 정보에 얽매여 이후 판단과 협상이 왜곡되는 현상", reason: "가격 책정 및 마케팅 전략의 기초" },
      { word: "넛지", anchor: "👉 팔꿈치슬쩍", def: "강제하지 않고 부드러운 개입을 통해 더 나은 선택을 유도하는 방식", reason: "공공정책 및 행동 유도 설계의 핵심" },
      { word: "손실회피", anchor: "😱 빼앗긴지갑", def: "동일한 금액의 이익보다 손실에 대해 2배 이상 더 큰 고통을 느끼는 심리", reason: "전망이론과 위험 회피의 근본 원인" },
      { word: "프레이밍", anchor: "🖼️ 액자틀", def: "동일한 사실이라도 어떤 틀(액자)로 전달하느냐에 따라 판단이 달라지는 현상", reason: "메시지 설득력과 결정 구조 조작" },
      { word: "매몰비용", anchor: "🕳️ 돈빠진구덩이", def: "이미 지출하여 회수할 수 없음에도 미련 때문에 비합리적 투자를 지속하는 오류", reason: "합리적 의사결정의 최대 장애물" }
    ]
  },
  {
    topic: "기억술과메타인지",
    fusionStory: "🏛️ 기억의궁전 벽면 🪝 옷걸이못에 🍅 빨간토마토를 걸고 🧱 레고블록묶음을 맞춰 📅 달력도장을 찍었다!",
    words: [
      { word: "장소법", anchor: "🏛️ 기억의궁전", def: "친숙한 장소의 동선에 암기할 항목의 시각 이미지를 배치하는 고대 기억술", reason: "인간의 진화된 공간기억을 극대화 활용" },
      { word: "페그시스템", anchor: "🪝 옷걸이못", def: "미리 정해둔 고정된 번호별 이미지(못)에 새 단어를 걸어 외우는 기법", reason: "숫자와 순서를 완벽히 보존하는 기억술" },
      { word: "뽀모도로", anchor: "🍅 빨간토마토", def: "25분 고도의 집중 후 5분 휴식을 반복하는 시간 관리 기술", reason: "작업기억 피로 회복과 도파민 유지" },
      { word: "청킹", anchor: "🧱 레고블록묶음", def: "개별 정보 조각들을 의미 있는 더 큰 덩어리로 묶어 처리하는 기술", reason: "작업기억 7±2 한계 용량 돌파" },
      { word: "간격반복", anchor: "📅 달력도장", def: "망각 주기에 맞춰 시간 간격을 점차 늘려가며 복습하는 학습법", reason: "에빙하우스 망각곡선을 이기는 장기기억화" }
    ]
  },
  {
    topic: "양자역학",
    fusionStory: "🌊 무지개파도 위에서 🎭 두얼굴의가면을 쓴 쌍둥이가 🧶 붉은실타래를 잡고 🌫️ 짙은안개 속 🚪 벽을뚫는문으로 순간이동했다!",
    words: [
      { word: "파동함수", anchor: "🌊 무지개파도", def: "양자역학에서 입자의 상태와 확률 진폭을 수학적으로 나타내는 함수", reason: "슈뢰딩거 방정식의 해법이자 기초" },
      { word: "중첩", anchor: "🎭 두얼굴의가면", def: "입자가 관측되기 전까지 여러 가능한 상태가 동시에 공존하는 현상", reason: "양자컴퓨터의 큐비트 병렬 연산 근간" },
      { word: "양자얽힘", anchor: "🧶 붉은실타래", def: "두 입자가 아무리 멀리 떨어져 있어도 한쪽 상태가 다른 쪽에 즉각 결정되는 연결", reason: "아인슈타인의 유령 같은 원격작용" },
      { word: "불확정성원리", anchor: "🌫️ 짙은안개", def: "입자의 위치와 운동량을 동시에 정확하게 측정할 수 없다는 한계 법칙", reason: "하이젠베르크의 고전역학 결정론 타파" },
      { word: "터널링", anchor: "🚪 벽을뚫는문", def: "에너지 장벽이 높아 통과할 수 없는 벽을 입자가 파동성으로 뚫고 나가는 현상", reason: "플래시 메모리 및 핵융합의 기본 원리" }
    ]
  },
  {
    topic: "정보보안",
    fusionStory: "🔐 한쌍의열쇠로 금고를 잠그자 💣 시한폭탄이 울리고 🎣 낚싯바늘에 🧂 소금통이 걸려 🕵️ 검은모자도청자의 얼굴에 쏟아졌다!",
    words: [
      { word: "공개키암호", anchor: "🔐 한쌍의열쇠", def: "암호화에는 공개키, 복호화에는 개인키를 사용하는 비대칭 암호 방식", reason: "현대 전자서명과 HTTPS(SSL)의 기둥" },
      { word: "제로데이", anchor: "💣 시한폭탄", def: "보안 취약점이 발견된 후 패치가 나오기 전에 감행되는 기습 해킹 공격", reason: "방어자가 대응할 시간이 없는 최고 위험 위협" },
      { word: "피싱", anchor: "🎣 낚싯바늘", def: "신뢰할 수 있는 기관을 사칭하여 개인정보와 금융정보를 탈취하는 사회공학 공격", reason: "인간의 심리적 취약점을 노리는 보안 위협" },
      { word: "솔트", anchor: "🧂 소금통", def: "비밀번호 해시를 생성할 때 레인보우 테이블 공격을 막기 위해 덧붙이는 무작위 데이터", reason: "단방향 암호화 보안 강화 필수 기법" },
      { word: "중간자공격", anchor: "🕵️ 검은모자도청자", def: "통신하는 두 당사자 사이에 몰래 끼어들어 패킷을 도청하거나 위변조하는 기법", reason: "종단간 암호화(E2EE) 도입의 핵심 계기" }
    ]
  }
];

const fastModeState = {
  streak: 0,
  currentTopic: '',
  words: [],
  fusionStory: '',
  currentPhase: 'preview', // 'preview' | 'quiz' | 'summary'
  quizIndex: 0,
  quizScore: 0,
  currentOptions: [],
  answeredCurrent: false,
  startTime: 0,
  timerInterval: null,
  autoNextTimer: null,
  autoNextCountdown: 5,
  wrongWords: []
};

// ⚡ FAST 모드 초기 진입 및 시작
function startFastMode() {
  clearInterval(fastModeState.timerInterval);
  clearInterval(fastModeState.autoNextTimer);

  // 1. 랜덤 주제 및 세트 선택 (직전 주제와 중복 방지)
  const availableTopics = FAST_TOPIC_BANK.filter(t => t.topic !== fastModeState.currentTopic);
  const selectedBank = availableTopics[Math.floor(Math.random() * availableTopics.length)] || FAST_TOPIC_BANK[0];

  fastModeState.currentTopic = selectedBank.topic;
  fastModeState.fusionStory = selectedBank.fusionStory;
  fastModeState.words = [...selectedBank.words];
  fastModeState.quizScore = 0;
  fastModeState.wrongWords = [];
  fastModeState.currentPhase = 'preview';
  fastModeState.startTime = Date.now();

  // 2. UI 렌더링
  const badgeTopic = document.getElementById('fastTopicBadge');
  const badgeStreak = document.getElementById('fastStreakBadge');
  const chainText = document.getElementById('fastStoryChainText');
  const wordsGrid = document.getElementById('fastWordsGrid');

  if (badgeTopic) badgeTopic.textContent = `🎲 주제: ${fastModeState.currentTopic}`;
  if (badgeStreak) badgeStreak.textContent = `🔥 ${fastModeState.streak} STREAK`;
  if (chainText) chainText.innerHTML = highlightStoryAnchors(fastModeState.fusionStory, fastModeState.words);

  if (wordsGrid) {
    wordsGrid.innerHTML = fastModeState.words.map((item, idx) => `
      <div class="fast-word-card">
        <div class="fast-word-top">
          <span class="fast-word-idx">#0${idx + 1}</span>
          <span class="fast-word-anchor">${item.anchor}</span>
        </div>
        <div class="fast-word-title">${item.word}</div>
        <div class="fast-word-def">${item.def}</div>
      </div>
    `).join('');
  }

  // 3. 페이즈 전환 (페이즈 1 활성화)
  document.getElementById('fastPhasePreview').style.display = 'block';
  document.getElementById('fastPhaseQuiz').style.display = 'none';
  document.getElementById('fastPhaseSummary').style.display = 'none';

  switchView('viewFastMode');

  // 4. 타이머 시작
  startFastTimer();
}

// 스토리 텍스트 안의 앵커 및 단어 강조 헬퍼
function highlightStoryAnchors(story, words) {
  let res = story;
  words.forEach(w => {
    if (w.word && res.includes(w.word)) {
      res = res.replaceAll(w.word, `<span style="color: #6366f1; font-weight: 800; text-decoration: underline;">${w.word}</span>`);
    }
  });
  return res;
}

// FAST 타이머 작동
function startFastTimer() {
  clearInterval(fastModeState.timerInterval);
  const timerDisplay = document.getElementById('fastTimerDisplay');
  fastModeState.timerInterval = setInterval(() => {
    const elapsedSec = ((Date.now() - fastModeState.startTime) / 1000).toFixed(1);
    if (timerDisplay) timerDisplay.textContent = `${elapsedSec}s`;
  }, 100);
}

// 🎯 페이즈 2: 4지선다 스피드 퀴즈 시작
function startFastQuiz() {
  fastModeState.currentPhase = 'quiz';
  fastModeState.quizIndex = 0;
  fastModeState.quizScore = 0;
  fastModeState.wrongWords = [];

  document.getElementById('fastPhasePreview').style.display = 'none';
  document.getElementById('fastPhaseQuiz').style.display = 'block';
  document.getElementById('fastPhaseSummary').style.display = 'none';

  renderFastQuizQuestion();
}

// 퀴즈 문제 1문항 렌더링
function renderFastQuizQuestion() {
  const qIndex = fastModeState.quizIndex;
  const total = fastModeState.words.length;

  if (qIndex >= total) {
    showFastSummary();
    return;
  }

  fastModeState.answeredCurrent = false;
  const currentItem = fastModeState.words[qIndex];

  // 메타 정보
  document.getElementById('fastQuizCurrentNum').textContent = qIndex + 1;
  document.getElementById('fastQuizTotalNum').textContent = total;
  document.getElementById('fastQuizProgressBar').style.width = `${((qIndex + 1) / total) * 100}%`;

  const comboText = document.getElementById('fastQuizComboText');
  if (comboText) {
    comboText.textContent = fastModeState.quizScore > 0 ? `🔥 ${fastModeState.quizScore}연속 정답!` : `🎯 순수 인출 집중`;
  }

  // 문제 카드
  document.getElementById('fastQuizAnchor').textContent = currentItem.anchor || '💡 연상 힌트';
  document.getElementById('fastQuizDef').textContent = currentItem.def;
  document.getElementById('fastQuizReason').textContent = currentItem.reason ? `출제 포인트: ${currentItem.reason}` : '';

  // 4개 선택지 구성 (정답 1개 + 오답 3개)
  const otherWords = fastModeState.words.filter(w => w.word !== currentItem.word).map(w => w.word);
  
  // 만약 다른 단어가 부족하면 전체 단어 은행에서 무작위 보충
  let distractorPool = [...otherWords];
  if (distractorPool.length < 3) {
    FAST_TOPIC_BANK.forEach(b => {
      b.words.forEach(w => {
        if (w.word !== currentItem.word && !distractorPool.includes(w.word)) {
          distractorPool.push(w.word);
        }
      });
    });
  }

  distractorPool.sort(() => Math.random() - 0.5);
  const distractors = distractorPool.slice(0, 3);
  const options = [currentItem.word, ...distractors].sort(() => Math.random() - 0.5);
  fastModeState.currentOptions = options;

  // 피드백 바 숨김
  const feedbackBar = document.getElementById('fastQuizFeedbackBar');
  if (feedbackBar) feedbackBar.style.display = 'none';

  // 버튼 렌더링
  const optionsGrid = document.getElementById('fastQuizOptionsGrid');
  optionsGrid.innerHTML = options.map((opt, i) => `
    <button class="fast-option-btn" data-index="${i}" data-word="${opt}">
      <span class="fast-key-badge">${i + 1}</span>
      <span class="fast-option-text">${opt}</span>
    </button>
  `).join('');

  // 클릭 이벤트 바인딩
  optionsGrid.querySelectorAll('.fast-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-index'));
      handleFastOptionSelect(idx);
    });
  });
}

// 키보드 단축키 (1, 2, 3, 4)로 보기 선택
function handleFastOptionKey(idx) {
  if (fastModeState.currentPhase !== 'quiz') return;
  if (idx >= 0 && idx < fastModeState.currentOptions.length) {
    handleFastOptionSelect(idx);
  }
}

// 선택지 채점 처리
function handleFastOptionSelect(selectedIdx) {
  if (fastModeState.answeredCurrent) return;
  fastModeState.answeredCurrent = true;

  const currentItem = fastModeState.words[fastModeState.quizIndex];
  const selectedWord = fastModeState.currentOptions[selectedIdx];
  const isCorrect = (selectedWord === currentItem.word);

  const btns = document.querySelectorAll('.fast-option-btn');
  const selectedBtn = btns[selectedIdx];

  const feedbackBar = document.getElementById('fastQuizFeedbackBar');

  if (isCorrect) {
    fastModeState.quizScore++;
    if (selectedBtn) selectedBtn.classList.add('correct');
    if (feedbackBar) {
      feedbackBar.textContent = '🎯 정답입니다! 완벽한 기억 인출입니다.';
      feedbackBar.style.display = 'block';
      feedbackBar.style.background = 'rgba(16, 185, 129, 0.15)';
      feedbackBar.style.color = '#10b981';
      feedbackBar.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    }
  } else {
    if (selectedBtn) selectedBtn.classList.add('wrong');
    // 정답 버튼 표시
    btns.forEach(b => {
      if (b.getAttribute('data-word') === currentItem.word) {
        b.classList.add('correct');
      }
    });
    fastModeState.wrongWords.push(currentItem);
    if (feedbackBar) {
      feedbackBar.textContent = `⚠️ 아쉽습니다! 정답: [${currentItem.word}]`;
      feedbackBar.style.display = 'block';
      feedbackBar.style.background = 'rgba(239, 68, 68, 0.15)';
      feedbackBar.style.color = '#ef4444';
      feedbackBar.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    }
  }

  // 480ms 후 스피디하게 다음 문항으로 전환
  setTimeout(() => {
    fastModeState.quizIndex++;
    renderFastQuizQuestion();
  }, 480);
}

// 🏆 페이즈 3: FAST 결과 요약 및 무한 루프
function showFastSummary() {
  clearInterval(fastModeState.timerInterval);
  fastModeState.currentPhase = 'summary';

  document.getElementById('fastPhasePreview').style.display = 'none';
  document.getElementById('fastPhaseQuiz').style.display = 'none';
  document.getElementById('fastPhaseSummary').style.display = 'block';

  const totalTime = ((Date.now() - fastModeState.startTime) / 1000).toFixed(1);
  const totalCount = fastModeState.words.length;
  const accuracy = Math.round((fastModeState.quizScore / totalCount) * 100);

  const isSuccess = accuracy >= 80;
  if (isSuccess) {
    fastModeState.streak++;
  } else {
    fastModeState.streak = 0;
  }

  // UI 바인딩
  const badgeEl = document.getElementById('fastSummaryBadge');
  const titleEl = document.getElementById('fastSummaryTitle');
  const scoreEl = document.getElementById('fastSummaryScore');
  const timeEl = document.getElementById('fastSummaryTime');
  const streakEl = document.getElementById('fastSummaryStreak');
  const wrongEl = document.getElementById('fastWrongRecap');

  if (badgeEl) {
    badgeEl.textContent = isSuccess ? '🎉 ROUND CLEAR! (+1 STREAK)' : '⚠️ FOCUS RECHARGE';
    badgeEl.style.background = isSuccess ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #b91c1c)';
  }

  if (titleEl) {
    titleEl.textContent = isSuccess 
      ? '대단한 몰입력입니다! 연상 앵커와 퀴즈 인출이 완벽히 결합되었습니다 🔥'
      : '아쉽게 놓친 단어가 있습니다. 다음 라운드에서 뇌를 다시 깨워보세요!';
  }

  if (scoreEl) scoreEl.textContent = `${accuracy}% (${fastModeState.quizScore}/${totalCount})`;
  if (timeEl) timeEl.textContent = `${totalTime}초`;
  if (streakEl) streakEl.textContent = `🔥 ${fastModeState.streak} STREAK`;

  // 오답 복습 표시
  if (wrongEl) {
    if (fastModeState.wrongWords.length > 0) {
      wrongEl.style.display = 'block';
      wrongEl.innerHTML = `<strong>⚠️ 방금 놓친 단어 복습:</strong><br>` + 
        fastModeState.wrongWords.map(w => `• <strong>${w.word}</strong> (${w.anchor}): ${w.def}`).join('<br>');
    } else {
      wrongEl.style.display = 'none';
    }
  }

  // 세션 자동 저장
  saveHybrid('log_concept', {
    source_name: `[FAST] ${fastModeState.currentTopic}`,
    total_words: totalCount,
    correct_count: fastModeState.quizScore,
    accuracy: accuracy,
    memorize_sec: parseFloat(totalTime),
    test_sec: 0,
    difficulty: 'fast'
  });

  // 5초 자동 다음 라운드 카운트다운
  startFastAutoNextCountdown();
}

// 5초 자동 다음 라운드 카운트다운
function startFastAutoNextCountdown() {
  clearInterval(fastModeState.autoNextTimer);
  fastModeState.autoNextCountdown = 5;

  const cdText = document.getElementById('fastAutoCountdown');
  if (cdText) cdText.innerHTML = `⏱️ <strong>${fastModeState.autoNextCountdown}초</strong> 후 다음 랜덤 라운드가 자동 시작됩니다...`;

  fastModeState.autoNextTimer = setInterval(() => {
    fastModeState.autoNextCountdown--;
    if (fastModeState.autoNextCountdown <= 0) {
      clearInterval(fastModeState.autoNextTimer);
      nextFastRound();
    } else {
      if (cdText) cdText.innerHTML = `⏱️ <strong>${fastModeState.autoNextCountdown}초</strong> 후 다음 랜덤 라운드가 자동 시작됩니다...`;
    }
  }, 1000);
}

// 다음 라운드 즉시 시작
function nextFastRound() {
  clearInterval(fastModeState.autoNextTimer);
  startFastMode();
}

// FAST 모드 이벤트 바인딩 등록
function setupFastModeEvents() {
  const btnStartQuiz = document.getElementById('btnFastStartQuiz');
  const btnNext = document.getElementById('btnFastNextRound');
  const btnPause = document.getElementById('btnFastPause');
  const btnExit = document.getElementById('btnExitFastMode');

  if (btnStartQuiz) {
    btnStartQuiz.addEventListener('click', () => startFastQuiz());
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => nextFastRound());
  }

  if (btnPause) {
    btnPause.addEventListener('click', () => {
      clearInterval(fastModeState.autoNextTimer);
      const cdText = document.getElementById('fastAutoCountdown');
      if (cdText) cdText.textContent = '⏸️ 자동 진행이 일시정지되었습니다. 준비되면 위 버튼을 눌러주세요.';
    });
  }

  if (btnExit) {
    btnExit.addEventListener('click', () => {
      clearInterval(fastModeState.timerInterval);
      clearInterval(fastModeState.autoNextTimer);
      switchView('viewDashboard');
      loadMainDashboard();
    });
  }
}




function setupSoundToggle() {
  const btn = document.getElementById('btnToggleSound');
  if (!btn) return;
  btn.innerText = SoundEngine.enabled ? '🔊' : '🔇';
  btn.onclick = () => {
    const isEnabled = SoundEngine.toggle();
    btn.innerText = isEnabled ? '🔊' : '🔇';
    if (isEnabled) SoundEngine.playCorrect();
  };
}


function setupCustomWordModal() {
  const modal = document.getElementById('customWordModal');
  const btnOpen = document.getElementById('btnOpenCustomWordModal');
  const btnClose = document.getElementById('btnCloseCustomWordModal');
  const btnApply = document.getElementById('btnApplyCustomWords');
  const inputName = document.getElementById('inputCustomSetName');
  const inputText = document.getElementById('inputCustomWordsText');

  if (btnOpen && modal) {
    btnOpen.onclick = () => {
      SoundEngine.playClick();
      modal.style.display = 'flex';
      if (inputName) inputName.focus();
    };
  }

  if (btnClose && modal) {
    btnClose.onclick = () => {
      SoundEngine.playClick();
      modal.style.display = 'none';
    };
  }

  if (btnApply && modal) {
    btnApply.onclick = () => {
      const rawText = inputText.value.trim();
      if (!rawText) {
        alert('단어와 설명을 최소 2줄 이상 입력해주세요.');
        return;
      }

      const lines = rawText.split('\n').filter(l => l.trim().length > 0);
      const parsed = [];
      const defaultAnchors = ['💡', '⚡', '🎯', '🏛️', '📜', '💎', '🔑', '🚀', '🔥', '🛡️', '📦', '🌟'];

      lines.forEach((line, idx) => {
        let delimiter = ':';
        if (line.includes(':')) delimiter = ':';
        else if (line.includes('-')) delimiter = '-';
        else if (line.includes('=')) delimiter = '=';
        else if (line.includes('\t')) delimiter = '\t';

        const parts = line.split(delimiter);
        const word = (parts[0] || '').trim();
        const def = (parts.slice(1).join(delimiter) || '').trim() || '사용자 등록 맞춤 개념';

        if (word) {
          parsed.push({
            word: word,
            definition: def,
            importance_reason: '사용자 등록 맞춤 암기 키워드',
            visual_anchor: defaultAnchors[idx % defaultAnchors.length] + ' ' + word,
            chosung: extractChosung(word)
          });
        }
      });

      if (parsed.length < 2) {
        alert('최소 2개 이상의 단어가 정상적으로 인식되어야 합니다.');
        return;
      }

      const setName = (inputName.value.trim()) || '나만의 맞춤 단어장';
      state.sessionData = {
        quiz_data: parsed,
        source_name: setName,
        user_story: '',
        history: []
      };
      state.mcqWordCount = parsed.length;

      modal.style.display = 'none';
      SoundEngine.playCombo();
      startMcqQuiz();
    };
  }
}


// 📥 [상용 기능] 단어장 CSV 다운로드 유틸리티
const btnExportCsv = document.getElementById('btnExportResultCsv');
if (btnExportCsv) {
  btnExportCsv.onclick = () => {
    SoundEngine.playClick();
    const quizList = (state.sessionData && Array.isArray(state.sessionData.quiz_data)) ? state.sessionData.quiz_data : [];
    if (quizList.length === 0) {
      alert('내보낼 단어 데이터가 없습니다.');
      return;
    }

    const title = (state.sessionData && state.sessionData.source_name) || 'BrainLock_단어장';
    let csvContent = "\uFEFF순번,단어,정의,출제포인트,시각앵커\n";

    quizList.forEach((item, idx) => {
      const cleanWord = (item.word || '').replace(/"/g, '""');
      const cleanDef = (item.definition || '').replace(/"/g, '""');
      const cleanReason = (item.importance_reason || '').replace(/"/g, '""');
      const cleanAnchor = (item.visual_anchor || '').replace(/"/g, '""');
      csvContent += `${idx + 1},"${cleanWord}","${cleanDef}","${cleanReason}","${cleanAnchor}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}_${new Date().toISOString().substring(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
}
