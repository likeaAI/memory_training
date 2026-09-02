// 상태 관리 객체
const state = {
  currentView: 'viewAuth',
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
  lastWrongQuizData: []
};

// =================================================================
// 🌐 100% 서버리스 클라이언트 엔진 (GitHub Pages + Google Sheets + Gemini)
// =================================================================
const SERVERLESS_CONFIG = {
  getModel: () => localStorage.getItem('brainlock_ai_model') || 'gemini-2.5-flash',
  getGeminiKey: () => localStorage.getItem('brainlock_gemini_key') || '',
  getSheetUrl: () => localStorage.getItem('brainlock_sheet_url') || '',
  isStandalone: () => !window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1')
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
    alert('🔑 Gemini API Key가 등록되지 않았습니다!\n우측 상단 ⚙️(설정) 버튼을 눌러 본인의 Gemini API Key를 입력해주세요.\n(Google AI Studio에서 무료 발급 가능)');
    const modal = document.getElementById('settingsModal');
    if (modal) modal.style.display = 'flex';
    throw new Error('API Key 누락');
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
      alert(`⚠️ API Key 권한 오류 (${errMsg})\n우측 상단 ⚙️ 설정에서 올바른 API 키를 등록해주세요.`);
    } else if (res.status === 404) {
      alert(`⚠️ 선택하신 모델 [${model}]은 현재 지원되지 않거나 이름을 확인해야 합니다.\n설정에서 [Gemini 2.5 Flash]로 변경해보세요.`);
    }
    throw new Error(`Gemini API Error: ${errMsg}`);
  }

  const json = await res.json();
  const textContent = json.candidates[0].content.parts[0].text;
  return JSON.parse(textContent);
}

// 클라이언트 단어 생성 (25개 풀 & 5개 셔플링)
const CLIENT_WORD_POOL_CACHE = {};
async function generateWordsClient(mode, userInput, count = 5, excludeWords = []) {
  const cacheKey = `${mode}:${userInput.trim()}`;
  let pool = CLIENT_WORD_POOL_CACHE[cacheKey];

  if (!pool || pool.length < count) {
    const prompt = `
[역할]: '${userInput}' 분야 전공 교수
주제 '${userInput}'에 관련된 핵심 전문 용어 총 25개를 기초부터 심화까지 아주 다양하게 엄선하세요.
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
    const res = await callGeminiClient(prompt, 0.95);
    pool = (res.quiz_data || []).map(item => ({
      ...item,
      chosung: extractChosung(item.word)
    }));
    // 셔플
    pool.sort(() => Math.random() - 0.5);
    CLIENT_WORD_POOL_CACHE[cacheKey] = pool;
  }

  const excludeSet = new Set(excludeWords || []);
  const available = pool.filter(w => !excludeSet.has(w.word));
  const picked = available.slice(0, count);
  CLIENT_WORD_POOL_CACHE[cacheKey] = pool.filter(w => !picked.includes(w));

  return {
    source_name: userInput,
    quiz_data: picked
  };
}

// 클라이언트 채점
async function verifyAnswersClient(quizWords, userInputs) {
  const prompt = `
당신은 자비로운 시험 채점관입니다.
정답 단어 목록: ${JSON.stringify(quizWords)}
사용자 입력 목록: ${JSON.stringify(userInputs)}
오타나 자모 분리, 띄어쓰기 차이는 정답(is_correct: true)으로 처리하세요.
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
  if (sheetUrl) {
    fetch(sheetUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...payload })
    }).catch(e => console.log('Google sheet sync:', e));
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
  const btnConcept = document.getElementById('btnModeConcept');
  const btnSpatial = document.getElementById('btnModeSpatial');
  const btnSudoku = document.getElementById('btnModeSudoku');
  
  const navBtns = [btnDash, btnConcept, btnSpatial, btnSudoku].filter(Boolean);
  navBtns.forEach(b => b.classList.remove('active'));

  if (viewName === 'viewDashboard' && btnDash) btnDash.classList.add('active');
  else if (['viewSetup', 'viewPrepare', 'viewMemorize', 'viewTest', 'viewResult'].includes(viewName) && btnConcept) btnConcept.classList.add('active');
  else if (viewName === 'viewSpatial' && btnSpatial) btnSpatial.classList.add('active');
  else if (viewName === 'viewSudoku' && btnSudoku) btnSudoku.classList.add('active');
}

// =================================================================
// 1. 초기화 및 이벤트 리스너
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupThemeToggle();
  setupAuth();
  setupSettingsModal();
  setupModeSwitcher();
  setupSpatialGame();
  setupSudokuGame();
  setupDifficultySelector();
  setupTabs();
  setupPdfDropzone();
  setupCounter();
  setupDrawer();
  setupTagInput();
  setupKeybindings();
  checkAuthAndInit();
});

// 상단 모드 전환기 & 퀵 런처 & 복귀 버튼
function setupModeSwitcher() {
  const btnDash = document.getElementById('btnModeDashboard');
  const btnConcept = document.getElementById('btnModeConcept');
  const btnSpatial = document.getElementById('btnModeSpatial');
  const btnSudoku = document.getElementById('btnModeSudoku');

  if (btnDash) {
    btnDash.addEventListener('click', () => {
      switchView('viewDashboard');
      loadMainDashboard();
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

  if (btnSudoku) {
    btnSudoku.addEventListener('click', () => {
      switchView('viewSudoku');
      loadSudokuStats();
      if (!sudokuState.isGameActive) {
        startNewSudokuGame();
      }
    });
  }

  // 메인 대시보드 내 3대 훈련 퀵 런처 카드
  const launchConcept = document.getElementById('launchConceptCard');
  const launchSpatial = document.getElementById('launchSpatialCard');
  const launchSudoku = document.getElementById('launchSudokuCard');

  if (launchConcept) {
    launchConcept.addEventListener('click', () => {
      switchView('viewSetup');
    });
  }

  if (launchSpatial) {
    launchSpatial.addEventListener('click', () => {
      switchView('viewSpatial');
      loadSpatialStats();
    });
  }

  if (launchSudoku) {
    launchSudoku.addEventListener('click', () => {
      switchView('viewSudoku');
      loadSudokuStats();
      if (!sudokuState.isGameActive) {
        startNewSudokuGame();
      }
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

// 로그인 상태 확인 후 화면 라우팅 (메인 대시보드로 기본 진입)
function checkAuthAndInit() {
  const mainLayout = document.getElementById('mainAppLayout');
  const viewAuth = document.getElementById('viewAuth');

  if (state.currentUser && state.currentUser.user_id) {
    // 로그인된 상태 -> 마스터 메인 종합 대시보드로 직행
    if (viewAuth) {
      viewAuth.style.display = 'none';
      viewAuth.classList.remove('active');
    }
    if (mainLayout) {
      mainLayout.style.display = 'grid';
    }
    updateUserUI();
    switchView('viewDashboard');
    loadMainDashboard();
    loadSavedList();
  } else {
    // 비로그인 상태 -> 마스터 게이트웨이 로그인 창만 확실하게 노출
    if (mainLayout) {
      mainLayout.style.display = 'none';
    }
    if (viewAuth) {
      viewAuth.style.display = 'block';
      viewAuth.classList.add('active');
    }
    updateUserUI();
  }
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
    if (state.currentView === 'viewMemorize') {
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
      count: state.wordCount
    };
    toggleLoading(true, 'PDF 교재 텍스트를 추출하고 핵심 전공 용어를 분류 중입니다...');
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
      count: state.wordCount
    };
    toggleLoading(true, 'AI가 각 분야 핵심 전문 용어와 시각 앵커를 설계하고 있습니다...');
  }

  try {
    let data;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (serverErr) {
      // 🌐 서버 없는 GitHub Pages 환경 -> 브라우저 내장 Gemini API 엔진으로 직접 생성!
      data = await generateWordsClient(payload.mode || 'topic', payload.input || '', payload.count || 5);
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

// [신규] STEP 1 -> STEP 3 (1-Card 건너뛰고 연상법 완료 즉시 바로 시험보기)
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

    try {
      const userId = state.currentUser ? state.currentUser.user_id : 1;
      const res = await fetch(`/api/dashboard?user_id=${userId}`);
      const dbData = await res.json();
      sessions = dbData.sessions || [];
      trainings = dbData.trainings || {};
    } catch (serverErr) {
      // 🌐 로컬스토리지에서 복원
      const localDb = JSON.parse(localStorage.getItem('brainlock_local_db') || '{"trainings":{},"concept":[],"spatial":[],"sudoku":[]}');
      trainings = localDb.trainings || {};
      sessions = localDb.concept || [];
    }

    // 좌측 사이드바 갱신
    renderSidebarHistory(sessions, trainings);
  } catch (err) {
    console.error('loadSavedList error:', err);
  }
}

    // 드로어 단어장 세트 목록
    const trainingKeys = Object.keys(trainings);
    if (trainingKeys.length === 0) {
      if (container) container.innerHTML = '<p class="empty-msg">저장된 단어장 세트가 없습니다.</p>';
      return;
    }

    if (container) {
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
  } catch (err) {
    if (container) container.innerHTML = '<p class="empty-msg">목록을 불러올 수 없습니다.</p>';
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
    let sudokuRes = { history: [], best_time: 0, avg_time: 0, total_clears: 0 };

    try {
      [conceptRes, spatialRes, sudokuRes] = await Promise.all([
        fetch(`/api/dashboard?user_id=${userId}`).then(r => r.json()),
        fetch(`/api/spatial-dashboard?user_id=${userId}`).then(r => r.json()),
        fetch(`/api/sudoku-dashboard?user_id=${userId}`).then(r => r.json())
      ]);
    } catch (serverErr) {
      // 🌐 서버 없는 GitHub Pages 환경 -> localStorage 및 Google Sheets 로드!
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
    const totalSudokuCount = sudokuRes.total_clears || 0;
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

      // 스도쿠 훈련 로그 정규화
      sudokuSessions.forEach(s => {
        const isWin = s.is_cleared === 1;
        const diffName = s.difficulty === 'easy' ? '쉬움' : (s.difficulty === 'hard' ? '어려움' : (s.difficulty === 'expert' ? '전문가' : '보통'));
        unifiedLogs.push({
          type: 'sudoku',
          created_at: s.created_at || '',
          title: `스도쿠 9x9 (${diffName})`,
          performance: isWin ? `완주 성공 (힌트 ${s.hints_used}회)` : `미완성`,
          scoreClass: isWin ? 'high' : 'low',
          duration: `클리어 ${s.clear_time_sec}초`
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
// 🔢 두뇌 활성 9x9 스도쿠 (Sudoku) 게임 엔진
// =================================================================

const sudokuState = {
  difficulty: 'normal',   // easy, normal, hard, expert
  board: [],             // 현재 사용자 상태 9x9
  solution: [],          // 정답 보드 9x9
  initial: [],           // 초기 고정 보드 9x9 (0은 빈칸)
  selectedCell: null,    // { row, col }
  timerId: null,
  elapsedSec: 0,
  mistakes: 0,
  hintsRemaining: 3,
  isGameActive: false
};

// 스도쿠 UI 초기화 및 이벤트 리스너
function setupSudokuGame() {
  const diffSelect = document.getElementById('sudokuDiffSelect');
  const btnNew = document.getElementById('btnNewSudokuGame');
  const btnHint = document.getElementById('btnSudokuHint');
  const btnRestart = document.getElementById('btnSudokuRestart');
  const btnCheck = document.getElementById('btnSudokuCheck');
  const btnErase = document.getElementById('btnKeypadErase');

  if (diffSelect) {
    diffSelect.addEventListener('change', () => {
      sudokuState.difficulty = diffSelect.value;
      startNewSudokuGame();
    });
  }

  if (btnNew) btnNew.addEventListener('click', () => startNewSudokuGame());
  if (btnRestart) btnRestart.addEventListener('click', () => restartSudokuGame());
  if (btnHint) btnHint.addEventListener('click', () => giveSudokuHint());
  if (btnCheck) btnCheck.addEventListener('click', () => validateCurrentSudokuBoard(true));
  if (btnErase) btnErase.addEventListener('click', () => eraseSelectedCell());

  // 온스크린 키패드 숫자 버튼 (1~9)
  document.querySelectorAll('.btn-keypad-num').forEach(btn => {
    btn.addEventListener('click', () => {
      const num = parseInt(btn.getAttribute('data-num'), 10);
      fillNumberInSelectedCell(num);
    });
  });

  // 키보드 입력 지원
  window.addEventListener('keydown', (e) => {
    if (state.currentView !== 'viewSudoku' || !sudokuState.selectedCell) return;
    
    // 숫자 1~9
    if (e.key >= '1' && e.key <= '9') {
      fillNumberInSelectedCell(parseInt(e.key, 10));
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      eraseSelectedCell();
    } else if (e.key === 'ArrowUp' && sudokuState.selectedCell.row > 0) {
      selectSudokuCell(sudokuState.selectedCell.row - 1, sudokuState.selectedCell.col);
    } else if (e.key === 'ArrowDown' && sudokuState.selectedCell.row < 8) {
      selectSudokuCell(sudokuState.selectedCell.row + 1, sudokuState.selectedCell.col);
    } else if (e.key === 'ArrowLeft' && sudokuState.selectedCell.col > 0) {
      selectSudokuCell(sudokuState.selectedCell.row, sudokuState.selectedCell.col - 1);
    } else if (e.key === 'ArrowRight' && sudokuState.selectedCell.col < 8) {
      selectSudokuCell(sudokuState.selectedCell.row, sudokuState.selectedCell.col + 1);
    }
  });
}

// 🚀 새 스도쿠 게임 생성 및 시작
function startNewSudokuGame() {
  if (sudokuState.timerId) clearInterval(sudokuState.timerId);
  
  sudokuState.elapsedSec = 0;
  sudokuState.mistakes = 0;
  sudokuState.hintsRemaining = 3;
  sudokuState.selectedCell = null;
  sudokuState.isGameActive = true;

  updateSudokuTimerDisplay();
  updateSudokuMistakesDisplay();
  document.getElementById('sudokuHintCount').innerText = sudokuState.hintsRemaining;

  // 1. 유효한 9x9 완전 정답 보드 생성 (백트래킹)
  sudokuState.solution = generateSudokuSolution();

  // 2. 난이도별 빈칸 개수 산정 및 마스킹 퍼즐 생성
  // easy: 30개 빈칸, normal: 42개 빈칸, hard: 52개 빈칸, expert: 58개 빈칸
  const blankCounts = {
    easy: 30,
    normal: 42,
    hard: 52,
    expert: 58
  };
  const blanks = blankCounts[sudokuState.difficulty] || 42;
  sudokuState.initial = createPuzzleFromSolution(sudokuState.solution, blanks);
  
  // 현재 보드 복사 (깊은 복사)
  sudokuState.board = sudokuState.initial.map(row => [...row]);

  // 보드 UI 렌더링
  renderSudokuBoard();

  // 타이머 시작
  sudokuState.timerId = setInterval(() => {
    sudokuState.elapsedSec++;
    updateSudokuTimerDisplay();
  }, 1000);
}

// 현재 퍼즐 초기화 (타이머 유지, 입력값만 리셋)
function restartSudokuGame() {
  if (!sudokuState.initial.length) return;
  sudokuState.board = sudokuState.initial.map(row => [...row]);
  sudokuState.mistakes = 0;
  updateSudokuMistakesDisplay();
  renderSudokuBoard();
}

// 9x9 스도쿠 보드 DOM 렌더링
function renderSudokuBoard() {
  const boardElem = document.getElementById('sudokuBoard');
  if (!boardElem) return;
  boardElem.innerHTML = '';

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'sudoku-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;

      const initVal = sudokuState.initial[r][c];
      const curVal = sudokuState.board[r][c];

      if (initVal !== 0) {
        cell.classList.add('fixed');
        cell.innerText = initVal;
      } else if (curVal !== 0) {
        cell.classList.add('user-filled');
        cell.innerText = curVal;
        
        // 오류 검증
        if (curVal !== sudokuState.solution[r][c]) {
          cell.classList.add('error');
        }
      } else {
        cell.innerText = '';
      }

      cell.addEventListener('click', () => selectSudokuCell(r, c));
      boardElem.appendChild(cell);
    }
  }

  // 선택된 셀이 있으면 하이라이트 복원
  if (sudokuState.selectedCell) {
    applySudokuHighlights(sudokuState.selectedCell.row, sudokuState.selectedCell.col);
  }
}

// 셀 선택 및 스마트 하이라이트 (행, 열, 3x3 박스, 동일 숫자)
function selectSudokuCell(row, col) {
  sudokuState.selectedCell = { row, col };
  applySudokuHighlights(row, col);
}

function applySudokuHighlights(row, col) {
  const cells = document.querySelectorAll('.sudoku-cell');
  const targetVal = sudokuState.board[row][col];

  cells.forEach(cell => {
    const r = parseInt(cell.dataset.row, 10);
    const c = parseInt(cell.dataset.col, 10);
    const val = sudokuState.board[r][c];

    cell.classList.remove('selected', 'same-num', 'highlight-line');

    // 선택된 셀
    if (r === row && c === col) {
      cell.classList.add('selected');
    }
    // 동일 숫자 하이라이트
    else if (targetVal !== 0 && val === targetVal) {
      cell.classList.add('same-num');
    }
    // 같은 행/열/3x3 박스 하이라이트
    else if (r === row || c === col || (Math.floor(r / 3) === Math.floor(row / 3) && Math.floor(c / 3) === Math.floor(col / 3))) {
      cell.classList.add('highlight-line');
    }
  });
}

// 선택된 셀에 숫자 입력
function fillNumberInSelectedCell(num) {
  if (!sudokuState.isGameActive || !sudokuState.selectedCell) return;
  const { row, col } = sudokuState.selectedCell;

  // 고정 셀은 수정 불가
  if (sudokuState.initial[row][col] !== 0) return;

  sudokuState.board[row][col] = num;

  // 정답 검증 및 오류 처리
  if (num !== sudokuState.solution[row][col]) {
    sudokuState.mistakes++;
    updateSudokuMistakesDisplay();
  }

  renderSudokuBoard();
  checkSudokuCompletion();
}

// 선택된 셀 지우기
function eraseSelectedCell() {
  if (!sudokuState.isGameActive || !sudokuState.selectedCell) return;
  const { row, col } = sudokuState.selectedCell;

  // 고정 셀은 삭제 불가
  if (sudokuState.initial[row][col] !== 0) return;

  sudokuState.board[row][col] = 0;
  renderSudokuBoard();
}

// 💡 힌트 제공 (선택된 빈칸에 정답 채우기)
function giveSudokuHint() {
  if (!sudokuState.isGameActive || sudokuState.hintsRemaining <= 0) {
    alert('남은 힌트가 없습니다!');
    return;
  }

  let targetRow = -1, targetCol = -1;

  // 1. 현재 선택된 셀이 빈칸이거나 틀린 값이면 거길 채워줌
  if (sudokuState.selectedCell) {
    const { row, col } = sudokuState.selectedCell;
    if (sudokuState.initial[row][col] === 0 && sudokuState.board[row][col] !== sudokuState.solution[row][col]) {
      targetRow = row;
      targetCol = col;
    }
  }

  // 2. 아니면 아직 안 채워진 빈칸 중 하나를 자동 탐색
  if (targetRow === -1) {
    const emptyCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (sudokuState.board[r][c] !== sudokuState.solution[r][c]) {
          emptyCells.push({ r, c });
        }
      }
    }
    if (emptyCells.length > 0) {
      const picked = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      targetRow = picked.r;
      targetCol = picked.c;
    }
  }

  if (targetRow !== -1) {
    sudokuState.board[targetRow][targetCol] = sudokuState.solution[targetRow][targetCol];
    sudokuState.hintsRemaining--;
    document.getElementById('sudokuHintCount').innerText = sudokuState.hintsRemaining;
    selectSudokuCell(targetRow, targetCol);
    renderSudokuBoard();
    checkSudokuCompletion();
  }
}

// 스도쿠 완주 검증 및 자동 SQLite 저장
async function checkSudokuCompletion() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (sudokuState.board[r][c] !== sudokuState.solution[r][c]) {
        return; // 아직 미완성
      }
    }
  }

  // 🎉 9x9 완벽 클리어 성공!
  sudokuState.isGameActive = false;
  if (sudokuState.timerId) clearInterval(sudokuState.timerId);

  const clearSec = sudokuState.elapsedSec;
  const usedHints = 3 - sudokuState.hintsRemaining;

  setTimeout(async () => {
    alert(`🎉 축하합니다! 9x9 스도쿠 [${sudokuState.difficulty.toUpperCase()}] 퍼즐을 ${clearSec}초 만에 완벽히 풀었습니다! 🧠⚡`);
    
    // SQLite 영구 자동 저장
    await saveSudokuResult(sudokuState.difficulty, clearSec, usedHints, 1);
    loadSudokuStats();
  }, 100);
}

// 수동 검증 버튼
function validateCurrentSudokuBoard(showAlert = false) {
  let hasError = false;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = sudokuState.board[r][c];
      if (val !== 0 && val !== sudokuState.solution[r][c]) {
        hasError = true;
      }
    }
  }
  if (showAlert) {
    if (hasError) {
      alert('⚠️ 현재 보드에 잘못 입력된 숫자가 있습니다. 빨간색 하이라이트를 확인하세요!');
    } else {
      alert('👍 현재까지 입력하신 숫자는 모두 정확합니다! 계속 진행하세요.');
    }
  }
}

// 스도쿠 타이머 텍스트 갱신
function updateSudokuTimerDisplay() {
  const min = String(Math.floor(sudokuState.elapsedSec / 60)).padStart(2, '0');
  const sec = String(sudokuState.elapsedSec % 60).padStart(2, '0');
  const elem = document.getElementById('sudokuTimerDisplay');
  if (elem) elem.innerText = `${min}:${sec}`;
}

// 스도쿠 오류 표시 갱신
function updateSudokuMistakesDisplay() {
  const elem = document.getElementById('sudokuMistakesDisplay');
  if (elem) elem.innerText = `${sudokuState.mistakes} / 3`;
}

// SQLite 스도쿠 통계 저장 통신
async function saveSudokuResult(difficulty, clearTimeSec, hintsUsed, isCleared) {
  const payload = {
    difficulty: difficulty,
    clear_time_sec: clearTimeSec,
    hints_used: hintsUsed,
    is_cleared: isCleared
  };

  saveHybrid('log_sudoku', payload);

  try {
    const userId = state.currentUser ? state.currentUser.user_id : 1;
    await fetch('/api/save-sudoku', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, ...payload })
    });
  } catch (e) {}
}

// 스도쿠 통계 로드 (서버 -> 로컬 하이브리드)
async function loadSudokuStats() {
  try {
    const userId = state.currentUser ? state.currentUser.user_id : 1;
    let data;
    try {
      const res = await fetch(`/api/sudoku-dashboard?user_id=${userId}`);
      data = await res.json();
    } catch (e) {
      const localDb = JSON.parse(localStorage.getItem('brainlock_local_db') || '{"sudoku":[]}');
      const list = localDb.sudoku || [];
      const clears = list.filter(s => s.is_cleared === 1);
      data = {
        best_time: clears.length > 0 ? Math.min(...clears.map(s => s.clear_time_sec || 999)) : 0,
        avg_time: clears.length > 0 ? Math.round(clears.reduce((acc, s) => acc + (s.clear_time_sec || 0), 0) / clears.length) : 0,
        total_clears: clears.length
      };
    }

    const bestTime = data.best_time > 0 ? `${data.best_time}초` : '-';
    const avgTime = data.avg_time > 0 ? `${data.avg_time}초` : '-';

    document.getElementById('statSudokuBestTime').innerText = bestTime;
    document.getElementById('statSudokuAvgTime').innerText = avgTime;
    document.getElementById('statSudokuTotalClears').innerText = `${data.total_clears || 0}회`;
  } catch (e) {}
}

// =================================================================
// 🎲 9x9 스도쿠 알고리즘 (완전 보드 생성 & 백트래킹)
// =================================================================

function generateSudokuSolution() {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));

  function isValid(b, row, col, num) {
    for (let i = 0; i < 9; i++) {
      if (b[row][i] === num || b[i][col] === num) return false;
    }
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (b[startRow + r][startCol + c] === num) return false;
      }
    }
    return true;
  }

  function solve(b) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (b[r][c] === 0) {
          const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
          // 셔플하여 매번 완전히 새로운 스도쿠 퍼즐 생성
          for (let i = numbers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
          }

          for (const num of numbers) {
            if (isValid(b, r, c, num)) {
              b[r][c] = num;
              if (solve(b)) return true;
              b[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  solve(board);
  return board;
}

// 정답 보드에서 난이도별 빈칸을 마스킹하여 플레이용 퍼즐 생성
function createPuzzleFromSolution(solutionBoard, blanksCount) {
  const puzzle = solutionBoard.map(row => [...row]);
  const positions = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      positions.push({ r, c });
    }
  }

  // 좌표 셔플
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

// =================================================================
// 🗑️ 단어장 삭제 유틸리티 (SQLite + Google Sheets 양방향 삭제)
// =================================================================
async function deleteTrainingSet(title) {
  try {
    const userId = state.currentUser ? state.currentUser.user_id : 1;
    toggleLoading(true, `'${title}' 단어장을 삭제하는 중입니다...`);
    const res = await fetch('/api/delete-training', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, user_id: userId })
    });
    toggleLoading(false);
    const data = await res.json();
    if (data.success) {
      alert(`'${title}' 단어장이 정상적으로 삭제되었습니다.`);
      await loadMainDashboard();
      await loadSavedList();
    } else {
      alert('삭제 실패: ' + (data.error || '알 수 없는 오류'));
    }
  } catch (err) {
    toggleLoading(false);
    alert('삭제 통신 오류: ' + err);
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

  // 🔗 웹훅 연결 테스트 (Ping)
  if (btnTest) {
    btnTest.onclick = async () => {
      const url = inputUrl.value.trim();
      if (!url) {
        alert('테스트할 구글 시트 웹 앱 URL을 먼저 입력해주세요.');
        return;
      }

      resultBox.style.display = 'block';
      resultBox.style.background = 'rgba(59, 130, 246, 0.1)';
      resultBox.style.color = '#3b82f6';
      resultBox.innerText = '구글 시트 웹훅 서버로 핑을 전송하고 있습니다...';

      try {
        const res = await fetch('/api/test-sheet-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.success) {
          resultBox.style.background = 'rgba(16, 185, 129, 0.12)';
          resultBox.style.color = '#10b981';
          resultBox.innerHTML = `<strong>🟢 연동 성공! (응답 지연: ${data.latency_ms}ms)</strong><br>${data.server_response.message || 'Google Sheets DB와 완벽하게 통신되었습니다.'}`;
        } else {
          resultBox.style.background = 'rgba(239, 68, 68, 0.12)';
          resultBox.style.color = '#ef4444';
          resultBox.innerHTML = `<strong>❌ 연결 실패:</strong> ${data.error}<br><small>Google Apps Script 배포 시 '액세스 권한: 모든 사용자(Anyone)'로 설정했는지 확인하세요.</small>`;
        }
      } catch (err) {
        resultBox.style.background = 'rgba(239, 68, 68, 0.12)';
        resultBox.style.color = '#ef4444';
        resultBox.innerText = '통신 에러: ' + err;
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


