import io

# =================================================================
# 📄 PDF 텍스트 추출 및 교재 전처리 모듈
# =================================================================

def extract_text_from_pdf_bytes(pdf_bytes: bytes, start_page: int = 1, end_page: int = None) -> str:
    """PDF 바이트 데이터에서 지정된 페이지 범위의 텍스트 추출 (PyMuPDF / pypdf 지원)"""
    text_content = []
    
    # 1. PyMuPDF (fitz) 우선 시도 (가장 빠르고 정확함)
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc)
        s_idx = max(0, start_page - 1)
        e_idx = min(total_pages, end_page) if end_page else total_pages

        for pno in range(s_idx, e_idx):
            page = doc.load_page(pno)
            page_text = page.get_text()
            if page_text and page_text.strip():
                text_content.append(f"--- [페이지 {pno + 1}] ---\n" + page_text.strip())
        doc.close()
        return "\n\n".join(text_content)
    except ImportError:
        pass

    # 2. pypdf 폴백 시도
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        total_pages = len(reader.pages)
        s_idx = max(0, start_page - 1)
        e_idx = min(total_pages, end_page) if end_page else total_pages

        for pno in range(s_idx, e_idx):
            page_text = reader.pages[pno].extract_text()
            if page_text and page_text.strip():
                text_content.append(f"--- [페이지 {pno + 1}] ---\n" + page_text.strip())
        return "\n\n".join(text_content)
    except ImportError:
        raise RuntimeError("PDF 파싱 라이브러리가 필요합니다. (pip install pymupdf 또는 pypdf)")
