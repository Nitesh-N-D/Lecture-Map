import io
import logging
import random
from typing import List
from app.models.flashcard import Flashcard

logger = logging.getLogger(__name__)


def export_anki(flashcards: List[Flashcard], deck_name: str = "LectureMap") -> bytes:
    """Export flashcards as Anki .apkg file using genanki."""
    import genanki

    deck_id = random.randrange(1 << 30, 1 << 31)
    model_id = random.randrange(1 << 30, 1 << 31)

    model = genanki.Model(
        model_id,
        "LectureMap Card",
        fields=[
            {"name": "Concept"},
            {"name": "Question"},
            {"name": "Answer"},
        ],
        templates=[
            {
                "name": "Card 1",
                "qfmt": "<h3>{{Concept}}</h3><hr>{{Question}}",
                "afmt": "{{FrontSide}}<hr id=answer>{{Answer}}",
            },
        ],
        css="""
        .card { font-family: Arial, sans-serif; font-size: 20px; 
                text-align: center; color: black; background-color: white; }
        h3 { color: #4f46e5; }
        """,
    )

    deck = genanki.Deck(deck_id, deck_name)

    for card in flashcards:
        note = genanki.Note(
            model=model,
            fields=[card.concept_name, card.question, card.answer],
        )
        deck.add_note(note)

    package = genanki.Package(deck)
    buf = io.BytesIO()
    package.write_to_file(buf)
    buf.seek(0)
    return buf.read()


def export_pdf(flashcards: List[Flashcard], title: str = "LectureMap Export") -> bytes:
    """Export flashcards as PDF using reportlab."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable, PageBreak
    from reportlab.lib.enums import TA_LEFT, TA_CENTER

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title", parent=styles["Title"], fontSize=24, spaceAfter=12,
        textColor=colors.HexColor("#4f46e5"),
    )
    concept_style = ParagraphStyle(
        "Concept", parent=styles["Heading2"], fontSize=16, spaceAfter=6,
        textColor=colors.HexColor("#1e293b"),
    )
    label_style = ParagraphStyle(
        "Label", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#64748b"),
        fontName="Helvetica-Bold",
    )
    body_style = ParagraphStyle(
        "Body", parent=styles["Normal"], fontSize=12, spaceAfter=8,
        textColor=colors.HexColor("#1e293b"),
    )

    story = [
        Paragraph(title, title_style),
        Paragraph(f"Total cards: {len(flashcards)}", label_style),
        Spacer(1, 0.5 * cm),
    ]

    # Group by concept
    concepts: dict = {}
    for card in flashcards:
        concepts.setdefault(card.concept_name, []).append(card)

    for concept_name, cards in concepts.items():
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0")))
        story.append(Spacer(1, 0.3 * cm))
        story.append(Paragraph(concept_name, concept_style))

        for i, card in enumerate(cards, 1):
            story.append(Paragraph(f"Q{i}: {card.question}", label_style))
            story.append(Paragraph(card.answer, body_style))
            story.append(Spacer(1, 0.2 * cm))

        story.append(Spacer(1, 0.4 * cm))

    doc.build(story)
    buf.seek(0)
    return buf.read()
