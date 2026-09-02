import hashlib

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
