/**
 * =================================================================
 * 🧠 BrainLock Focus AI - Google Sheets Database API (Apps Script)
 * =================================================================
 * 1. 이 코드를 구글 시트 > 확장 프로그램 > Apps Script에 붙여넣습니다.
 * 2. [배포] > [새 배포] > [웹 앱] 선택
 * 3. 액세스 권한: '모든 사용자(Anyone)'로 설정 후 배포 URL 복사
 */

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'get_all';

  if (action === 'ping') {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Google Sheets DB 웹훅이 정상적으로 응답하고 있습니다!'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'get_all') {
    const trainingsRaw = getSheetData(ss, '단어장_보관함');
    const conceptLogs = getSheetData(ss, '개념훈련_로그');
    const spatialLogs = getSheetData(ss, '공간기억_로그');
    const sudokuLogs = getSheetData(ss, '스도쿠_로그');

    // 단어장 객체 포맷팅
    const trainingsObj = {};
    trainingsRaw.forEach(t => {
      let quizData = [];
      try {
        quizData = JSON.parse(t['단어데이터'] || '[]');
      } catch (err) {
        quizData = [];
      }
      trainingsObj[t['제목']] = {
        title: t['제목'],
        word_count: parseInt(t['단어수']) || 5,
        quiz_data: quizData,
        user_story: t['연상스토리'] || '',
        created_at: t['일시'] || ''
      };
    });

    const result = {
      status: 'success',
      trainings: trainingsObj,
      concept_sessions: conceptLogs.map(r => ({
        created_at: r['일시'],
        title: r['주제'],
        accuracy: parseInt(r['정답률']) || 0,
        correct_words: parseInt(r['맞힌수']) || 0,
        total_words: parseInt(r['총단어']) || 5,
        memorize_sec: parseFloat(r['암기시간']) || 0,
        test_sec: parseFloat(r['인출시간']) || 0
      })),
      spatial_history: spatialLogs.map(r => ({
        created_at: r['일시'],
        grid_size: parseInt(r['격자크기']) || 4,
        target_count: parseInt(r['목표개수']) || 4,
        is_success: parseInt(r['성공여부']) || 0,
        reaction_time_ms: parseInt(r['반응속도']) || 0
      })),
      sudoku_history: sudokuLogs.map(r => ({
        created_at: r['일시'],
        difficulty: r['난이도'] || 'normal',
        clear_time_sec: parseInt(r['클리어시간']) || 0,
        hints_used: parseInt(r['힌트사용']) || 0,
        is_cleared: parseInt(r['완주여부']) || 1
      }))
    };

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'ready' })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = JSON.parse(e.postData.contents);
    const type = data.type;
    const nowStr = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

    // 1. 🔗 웹훅 연결 테스트 (Ping)
    if (type === 'ping') {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Google Sheets DB 웹훅이 정상 작동 중입니다!',
        timestamp: nowStr
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. 🗑️ 단어장 영구 삭제
    if (type === 'delete_training') {
      const sheet = ss.getSheetByName('단어장_보관함');
      let deleted = false;
      if (sheet) {
        const rows = sheet.getDataRange().getValues();
        for (let i = rows.length - 1; i >= 1; i--) {
          if (rows[i][1] === data.title) { // 2번째 열(제목)
            sheet.deleteRow(i + 1);
            deleted = true;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', deleted: deleted })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. 🧹 전체 훈련 로그 초기화
    if (type === 'clear_all_logs') {
      ['개념훈련_로그', '공간기억_로그', '스도쿠_로그'].forEach(name => {
        const sheet = ss.getSheetByName(name);
        if (sheet && sheet.getLastRow() > 1) {
          sheet.deleteRows(2, sheet.getLastRow() - 1);
        }
      });
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: '로그가 모두 초기화되었습니다.' })).setMimeType(ContentService.MimeType.JSON);
    }

    // 4. 일반 데이터 저장
    if (type === 'save_training') {
      appendRow(ss, '단어장_보관함', [nowStr, data.title, data.word_count, JSON.stringify(data.quiz_data), data.user_story || '']);
    } else if (type === 'log_concept') {
      appendRow(ss, '개념훈련_로그', [nowStr, data.title, data.accuracy, data.correct_words, data.total_words, data.memorize_sec, data.test_sec]);
    } else if (type === 'log_spatial') {
      appendRow(ss, '공간기억_로그', [nowStr, data.grid_size, data.target_count, data.is_success, data.reaction_time_ms]);
    } else if (type === 'log_sudoku') {
      appendRow(ss, '스도쿠_로그', [nowStr, data.difficulty, data.clear_time_sec, data.hints_used, data.is_cleared]);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function appendRow(ss, sheetName, rowData) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (sheetName === '단어장_보관함') {
      sheet.appendRow(['일시', '제목', '단어수', '단어데이터', '연상스토리']);
    } else if (sheetName === '개념훈련_로그') {
      sheet.appendRow(['일시', '주제', '정답률', '맞힌수', '총단어', '암기시간', '인출시간']);
    } else if (sheetName === '공간기억_로그') {
      sheet.appendRow(['일시', '격자크기', '목표개수', '성공여부', '반응속도']);
    } else if (sheetName === '스도쿠_로그') {
      sheet.appendRow(['일시', '난이도', '클리어시간', '힌트사용', '완주여부']);
    }
  }
  sheet.appendRow(rowData);
}

function getSheetData(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  const headers = rows[0];
  return rows.slice(1).map(r => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = r[i]);
    return obj;
  });
}
