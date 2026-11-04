import hashlib
import os
import shutil

# =================================================================
# 🛠️ 공통 유틸리티 함수 모듈
# =================================================================

def hash_password(password: str) -> str:
    """비밀번호 SHA-256 단방향 암호화"""
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

CHOSUNG_LIST = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
    'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
]

def extract_chosung(text: str) -> str:
    """한글 텍스트에서 초성만 추출 (비한글은 원본 유지)"""
    result = []
    for ch in text:
        code = ord(ch)
        if 0xAC00 <= code <= 0xD7A3:
            chosung_idx = (code - 0xAC00) // (21 * 28)
            result.append(CHOSUNG_LIST[chosung_idx])
        else:
            result.append(ch)
    return "".join(result)

def create_desktop_bundle():
    desktop = os.path.join(os.environ['USERPROFILE'], 'Desktop')
    target = os.path.join(desktop, 'BrainLock_4지선다퀴즈_최신버전.html')
    target_en = os.path.join(desktop, 'BrainLock_MCQ_Quiz.html')

    # static/ 최신 소스를 루트로 동기화
    shutil.copy2('static/index.html', 'index.html')
    shutil.copy2('static/style.css', 'style.css')
    shutil.copy2('static/app.js', 'app.js')
    if os.path.exists('static/topics_catalog.js'):
        shutil.copy2('static/topics_catalog.js', 'topics_catalog.js')

    with open('index.html', 'r', encoding='utf-8') as f:
        h = f.read()
    with open('style.css', 'r', encoding='utf-8') as f:
        c = f.read()
    with open('app.js', 'r', encoding='utf-8') as f:
        j = f.read()

    tc = ''
    if os.path.exists('topics_catalog.js'):
        with open('topics_catalog.js', 'r', encoding='utf-8') as f:
            tc = f.read()

    # CSS 인라인
    p1 = h.find('<link rel="stylesheet"')
    if p1 != -1:
        p1_end = h.find('>', p1) + 1
        h = h[:p1] + '<style>\n' + c + '\n</style>' + h[p1_end:]

    # topics_catalog.js 인라인
    p_tc = h.find('<script src="topics_catalog.js')
    if p_tc != -1:
        p_tc_end = h.find('>', p_tc) + 1
        h = h[:p_tc] + '<script>\n' + tc + '\n</script>' + h[p_tc_end:]

    # app.js 인라인
    p2 = h.find('<script src="app.js')
    if p2 != -1:
        p2_end = h.find('>', p2) + 1
        h = h[:p2] + '<script>\n' + j + '\n</script>' + h[p2_end:]

    with open(target, 'w', encoding='utf-8') as f:
        f.write(h)

    with open(target_en, 'w', encoding='utf-8') as f:
        f.write(h)

    # 개별 파일들도 바탕화면에 최신 덮어쓰기
    shutil.copy2('index.html', os.path.join(desktop, 'index.html'))
    shutil.copy2('style.css', os.path.join(desktop, 'style.css'))
    shutil.copy2('app.js', os.path.join(desktop, 'app.js'))
    if os.path.exists('topics_catalog.js'):
        shutil.copy2('topics_catalog.js', os.path.join(desktop, 'topics_catalog.js'))

    print('ALL_DESKTOP_FILES_REGENERATED_SUCCESSFULLY!')
    print('1. BrainLock_MCQ_Quiz.html (올인원):', os.path.getsize(target_en), 'bytes')
    print('2. index.html:', os.path.getsize(os.path.join(desktop, 'index.html')), 'bytes')

if __name__ == '__main__':
    create_desktop_bundle()
