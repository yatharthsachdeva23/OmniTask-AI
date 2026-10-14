import os
import re
import uuid
from pathlib import Path
from typing import Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    KeepTogether,
)
from reportlab.pdfgen import canvas


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and display total page count:
    'Page X of Y' along with a subtle header rule.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_header_footer(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_header_footer(self, total_pages: int):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))

        # Header (pages > 1)
        if self._pageNumber > 1:
            self.setStrokeColor(colors.HexColor("#e2e8f0"))
            self.setLineWidth(0.5)
            self.line(54, 750, 558, 750)

        # Footer (all pages)
        self.setStrokeColor(colors.HexColor("#e2e8f0"))
        self.setLineWidth(0.5)
        self.line(54, 45, 558, 45)

        footer_text = f"Page {self._pageNumber} of {total_pages}"
        self.drawRightString(558, 32, footer_text)
        self.restoreState()


def strip_outer_markdown_fences(text: str) -> str:
    """Safely strips artificial markdown code block wrappers (e.g. ```markdown ... ``` or dangling ```)."""
    if not text:
        return ""
    lines = text.splitlines()
    while lines and (re.match(r"^```(?:markdown|md|text|txt)?\s*$", lines[0].strip(), re.IGNORECASE) or not lines[0].strip()):
        lines.pop(0)
    while lines and (re.match(r"^```\s*$", lines[-1].strip()) or not lines[-1].strip()):
        lines.pop()
    return "\n".join(lines).strip()


def clean_markdown_for_reportlab(text: str) -> str:
    """
    Sanitizes markdown tags into ReportLab compatible XML tags.
    Protects fill-in-the-blank underscores and strips raw markdown syntax.
    """
    # Strip any leading markdown header hashes if left over in paragraph
    text = re.sub(r"^#{1,6}\s*", "", text.strip())

    # Protect fill-in-the-blank underscores (e.g. ____, ______, etc.)
    blanks = []
    def save_blank(m):
        blanks.append(m.group(0))
        return f"@@@BLANK_{len(blanks)-1}@@@"
    
    text = re.sub(r"_{2,}", save_blank, text)

    # Clean LaTeX inline/display wraps
    text = text.replace(r"\(", "").replace(r"\)", "").replace(r"\[", "").replace(r"\]", "")
    text = text.replace(r"\det", "det").replace(r"\sim", "~").replace(r"\odot", "⊙")
    text = text.replace(r"\partial", "∂").replace(r"\frac", "")

    # Escape XML entities first
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    # Re-enable LaTeX math formatting
    text = re.sub(r"\\mathbf\{([^}]+)\}", r"<b>\1</b>", text)
    text = re.sub(r"\\mathcal\{([^}]+)\}", r"\1", text)
    text = re.sub(r"\\text\{([^}]+)\}", r"\1", text)

    # Re-enable basic tags
    # Bold: **bold**
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)

    # Italics: *italic* (only when surrounded by non-asterisks)
    text = re.sub(r"(?<!\*)\*(?!\*)([^\*]+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text)

    # Inline code: `code`
    text = re.sub(r"`([^`]+?)`", r'<font face="Courier" color="#0f172a" backcolor="#f1f5f9"> \1 </font>', text)

    # Restore blanks safely as clean underscores
    for idx, b in enumerate(blanks):
        text = text.replace(f"@@@BLANK_{idx}@@@", "_" * len(b))

    return text


def safe_paragraph(html_text: str, style) -> Paragraph:
    """
    Safely creates a ReportLab Paragraph. If ReportLab XML parser encounters
    any malformed tag sequence (e.g. unclosed tags), falls back to plain escaped text.
    """
    try:
        return Paragraph(html_text, style)
    except Exception:
        clean = re.sub(r"<[^>]+>", "", html_text)
        clean = clean.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        return Paragraph(clean, style)


def markdown_to_pdf(
    markdown_content: str,
    title: str = "Document Deliverable",
    output_filename: Optional[str] = None,
    output_dir: Optional[Path] = None,
) -> Tuple[str, Path]:
    """
    Compiles markdown content into a publication-quality PDF document.
    Returns (pdf_url, physical_path).
    """
    if not output_dir:
        output_dir = Path(__file__).resolve().parent.parent.parent / "uploads" / "generated"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Strip any lines containing AI branding or pipeline watermarks from content
    clean_lines_list = []
    for l in markdown_content.split('\n'):
        l_lower = l.lower().strip()
        if any(brand in l_lower for brand in [
            "omnitask", "omniitask", "omni task", "omni agent",
            "multi-agent swarm", "multi-agent engine", "multi-agent",
            "autonomous code specialist", "autonomous auditing specialist", "autonomous summarizer specialist",
            "prepared by omni", "prepared by: omni", "prepared by omnitask", "prepared by omniitask",
            "prepared by:", "author: omni", "created by omni",
            "generated by omni", "generated by omnitask", "generated by omniitask",
            "official deliverable", "verified document deliverable",
            "publication-grade word document compilation", "publication-grade pdf document compilation",
            "publication-grade document compilation", "word document compilation", "pdf document compilation"
        ]):
            continue
        clean_lines_list.append(l)
    markdown_content = strip_outer_markdown_fences('\n'.join(clean_lines_list))

    # Derive clean title if generic or pipeline title was provided
    if not title or any(b in title.lower() for b in ["omnitask", "compilation", "sub-task", "document deliverable", "deliverable"]):
        m_h = re.search(r'^\s*#\s+(.+)$', markdown_content, re.MULTILINE)
        if m_h:
            cand = re.sub(r'[*_`]', '', m_h.group(1)).strip()
            if not any(b in cand.lower() for b in ["omnitask", "compilation", "deliverable"]):
                title = cand
            else:
                title = "Technical Document"
        else:
            title = "Technical Document"

    if not output_filename:
        safe_base = re.sub(r"[^a-zA-Z0-9_-]", "_", title.lower()).strip("_")[:40] or "document"
        unique_suffix = uuid.uuid4().hex[:8]
        output_filename = f"{safe_base}_{unique_suffix}.pdf"

    if not output_filename.endswith(".pdf"):
        output_filename += ".pdf"

    file_path = output_dir / output_filename

    # Build Document Template
    doc = SimpleDocTemplate(
        str(file_path),
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )

    styles = getSampleStyleSheet()

    # Custom typography styles
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=8,
    )

    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=14,
    )

    h1_style = ParagraphStyle(
        "DocH1",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True,
    )

    h2_style = ParagraphStyle(
        "DocH2",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#334155"),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True,
    )

    h3_style = ParagraphStyle(
        "DocH3",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#475569"),
        spaceBefore=8,
        spaceAfter=3,
        keepWithNext=True,
    )

    h4_style = ParagraphStyle(
        "DocH4",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=7,
        spaceAfter=2,
        keepWithNext=True,
    )

    body_style = ParagraphStyle(
        "DocBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=6,
    )

    bullet_style = ParagraphStyle(
        "DocBullet",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=14,
        leftIndent=15,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=4,
    )

    code_style = ParagraphStyle(
        "DocCode",
        parent=styles["Normal"],
        fontName="Courier",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#0f172a"),
    )

    flowables = []

    # Title Banner (Clean, unbranded)
    flowables.append(Paragraph(title, title_style))
    flowables.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#3b82f6"), spaceAfter=14))

    # Parse lines (remove duplicate leading heading matching title)
    lines = markdown_content.split("\n")
    for idx, l in enumerate(lines):
        if l.strip():
            m_lead_h = re.match(r'^#\s+(.+)$', l.strip())
            if m_lead_h:
                lead_text = re.sub(r'[*_`]', '', m_lead_h.group(1)).strip()
                if lead_text.lower() == title.lower() or title.lower() in lead_text.lower() or lead_text.lower() in title.lower():
                    lines[idx] = ""
            break

    in_code_block = False
    code_lines = []
    code_block_lang = ""

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Check code fence
        if stripped.startswith("```"):
            if in_code_block:
                in_code_block = False
                is_md_block = code_block_lang in ["markdown", "md"] or any(l.strip().startswith(("#", "##", "- ", "* ", "1.")) for l in code_lines[:6])
                if is_md_block:
                    # Unpack markdown lines into the main stream to be rendered as styled headings and text
                    lines = lines[:i] + code_lines + lines[i+1:]
                    code_lines = []
                    continue

                if code_lines:
                    chunk_size = 15
                    rows = []
                    for k in range(0, len(code_lines), chunk_size):
                        chunk = code_lines[k:k+chunk_size]
                        chunk_text = "<br/>".join([
                            l.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace(" ", "&nbsp;")
                            for l in chunk
                        ])
                        rows.append([Paragraph(chunk_text, code_style)])
                    
                    if rows:
                        t = Table(rows, colWidths=[504])
                        t.setStyle(TableStyle([
                            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                            ("TOPPADDING", (0, 0), (-1, -1), 3),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                            ("LEFTPADDING", (0, 0), (-1, -1), 8),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                        ]))
                        flowables.append(t)
                        flowables.append(Spacer(1, 6))
                code_lines = []
            else:
                code_block_lang = stripped[3:].strip().lower()
                in_code_block = True
                code_lines = []
            i += 1
            continue

        if in_code_block:
            code_lines.append(line)
            i += 1
            continue

        stripped = line.strip()

        # Blank line
        if not stripped:
            flowables.append(Spacer(1, 4))
            i += 1
            continue

        # Horizontal rule
        if stripped in ["---", "***", "___"]:
            flowables.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0"), spaceAfter=8, spaceBefore=8))
            i += 1
            continue

        # Headings: #, ##, ###, ####, #####, ######
        h_match = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if h_match:
            level = len(h_match.group(1))
            heading_content = h_match.group(2).strip()
            clean_text = clean_markdown_for_reportlab(heading_content)
            if level == 1:
                flowables.append(safe_paragraph(clean_text, h1_style))
            elif level == 2:
                flowables.append(safe_paragraph(clean_text, h2_style))
            elif level == 3:
                flowables.append(safe_paragraph(clean_text, h3_style))
            else:
                flowables.append(safe_paragraph(clean_text, h4_style))
            i += 1
            continue

        # Bullet points
        if stripped.startswith(("- ", "* ", "+ ")):
            clean_text = clean_markdown_for_reportlab(stripped[2:])
            bullet_html = f"&bull;&nbsp;&nbsp;{clean_text}"
            flowables.append(safe_paragraph(bullet_html, bullet_style))
            i += 1
            continue

        # Numbered & Lettered lists (e.g. "1. ", "2) ", "A) ", "B) ")
        num_match = re.match(r"^([0-9]+[\.\)]|[A-Z][\.\)])\s+(.*)$", stripped)
        if num_match:
            num_prefix = num_match.group(1)
            clean_text = clean_markdown_for_reportlab(num_match.group(2))
            item_html = f"<b>{num_prefix}</b>&nbsp;&nbsp;{clean_text}"
            flowables.append(safe_paragraph(item_html, bullet_style))
            i += 1
            continue

        # Standard paragraph
        clean_text = clean_markdown_for_reportlab(stripped)
        flowables.append(safe_paragraph(clean_text, body_style))
        i += 1

    # Defensive recovery: If document had an unclosed code block (e.g. from splitting or prompt output)
    if in_code_block and code_lines:
        is_md_block = code_block_lang in ["markdown", "md", ""] or any(l.strip().startswith(("#", "##", "- ", "* ", "1.", "A)")) for l in code_lines[:8])
        if is_md_block:
            for cl in code_lines:
                cl_stripped = cl.strip()
                if not cl_stripped:
                    flowables.append(Spacer(1, 4))
                    continue
                if cl_stripped in ["---", "***", "___"]:
                    flowables.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0"), spaceAfter=8, spaceBefore=8))
                    continue
                h_match = re.match(r"^(#{1,6})\s+(.*)$", cl_stripped)
                if h_match:
                    level = len(h_match.group(1))
                    h_content = clean_markdown_for_reportlab(h_match.group(2).strip())
                    flowables.append(safe_paragraph(h_content, h1_style if level == 1 else (h2_style if level == 2 else h3_style)))
                    continue
                num_match = re.match(r"^([0-9]+[\.\)]|[A-Z][\.\)])\s+(.*)$", cl_stripped)
                if num_match:
                    item_html = f"<b>{num_match.group(1)}</b>&nbsp;&nbsp;{clean_markdown_for_reportlab(num_match.group(2))}"
                    flowables.append(safe_paragraph(item_html, bullet_style))
                    continue
                if cl_stripped.startswith(("- ", "* ", "+ ")):
                    bullet_html = f"&bull;&nbsp;&nbsp;{clean_markdown_for_reportlab(cl_stripped[2:])}"
                    flowables.append(safe_paragraph(bullet_html, bullet_style))
                    continue
                flowables.append(safe_paragraph(clean_markdown_for_reportlab(cl_stripped), body_style))
        else:
            chunk_size = 15
            rows = []
            for k in range(0, len(code_lines), chunk_size):
                chunk = code_lines[k:k+chunk_size]
                chunk_text = "<br/>".join([
                    l.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace(" ", "&nbsp;")
                    for l in chunk
                ])
                rows.append([Paragraph(chunk_text, code_style)])
            if rows:
                t = Table(rows, colWidths=[504])
                t.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ]))
                flowables.append(t)
                flowables.append(Spacer(1, 6))

    # Build the PDF using NumberedCanvas with recovery fallback
    try:
        doc.build(flowables, canvasmaker=NumberedCanvas)
    except Exception as build_err:
        print(f"[PDF Generator] NumberedCanvas build notice: {build_err}. Falling back to plain flowables.")
        clean_flowables = []
        for f in flowables:
            if isinstance(f, Paragraph):
                raw_txt = re.sub(r"<[^>]+>", "", f.text)
                clean_flowables.append(safe_paragraph(raw_txt, f.style))
            else:
                clean_flowables.append(f)
        doc.build(clean_flowables)

    pdf_url = f"/api/generated-media/{output_filename}"
    return pdf_url, file_path
