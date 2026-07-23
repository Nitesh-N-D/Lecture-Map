from pathlib import Path


def extract_pdf_text(pdf_path: str) -> str:
    """Extract selectable text from a PDF without inventing any content."""
    from pypdf import PdfReader

    try:
        reader = PdfReader(pdf_path)
    except Exception as error:
        raise ValueError(
            "This PDF could not be read. Upload a valid PDF with selectable text."
        ) from error
    text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    if not text:
        raise ValueError(
            "This PDF has no selectable text. Upload a text-based PDF or an audio/video lecture."
        )
    return text


def is_pdf_file(path: str) -> bool:
    return Path(path).suffix.lower() == ".pdf"
