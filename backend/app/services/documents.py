from pathlib import Path

MAX_PDF_PAGES = 500
MAX_PDF_CHARS = 400_000


def extract_pdf_text(pdf_path: str) -> str:
    """Extract selectable text from a PDF without inventing any content.

    Scanned/image-only PDFs are NOT supported (no OCR); they raise ``ValueError``.
    """
    from pypdf import PdfReader

    try:
        reader = PdfReader(pdf_path)
    except Exception as error:
        raise ValueError(
            "This PDF could not be read. Upload a valid PDF with selectable text."
        ) from error

    if reader.is_encrypted:
        try:
            unlocked = reader.decrypt("")  # empty user password only
        except Exception:
            unlocked = 0
        if not unlocked:
            raise ValueError("This PDF is password-protected. Remove the password and upload it again.")

    parts: list[str] = []
    total = 0
    try:
        for page in reader.pages[:MAX_PDF_PAGES]:
            text = page.extract_text() or ""
            parts.append(text)
            total += len(text)
            if total >= MAX_PDF_CHARS:
                break
    except Exception as error:
        raise ValueError("Text could not be extracted from this PDF.") from error

    text = "\n".join(parts).strip()[:MAX_PDF_CHARS]
    if not text:
        raise ValueError(
            "This PDF has no selectable text (scanned PDFs are not supported). "
            "Upload a text-based PDF or an audio/video lecture."
        )
    return text


def is_pdf_file(path: str) -> bool:
    return Path(path).suffix.lower() == ".pdf"
