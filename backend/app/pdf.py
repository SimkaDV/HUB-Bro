"""Тестовые PDF: заглушка транспортной этикетки и тестовая страница принтера.

Настоящие этикетки приходят от Авито готовым PDF и не генерируются здесь.
"""
from pathlib import Path

from fpdf import FPDF

_FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def _doc() -> tuple[FPDF, bool]:
    pdf = FPDF(unit="mm", format=(100, 150))
    pdf.set_auto_page_break(False)
    pdf.set_margins(5, 5, 5)
    pdf.add_page()
    for path in _FONTS:
        if Path(path).exists():
            pdf.add_font("main", fname=path)
            pdf.set_font("main", size=10)
            return pdf, True
    pdf.set_font("Helvetica", size=10)
    return pdf, False


def _text(pdf: FPDF, unicode_ok: bool, ru: str, en: str, size: int = 10, h: float = 5) -> None:
    pdf.set_font_size(size)
    pdf.multi_cell(0, h, ru if unicode_ok else en, new_x="LMARGIN", new_y="NEXT")


def mock_transport_label(*, order_ext_id: str, marketplace_id: str, shop: str, pvz: str, items: list[str]) -> bytes:
    pdf, u = _doc()
    pdf.set_fill_color(0, 0, 0)
    pdf.set_text_color(255, 255, 255)
    _text(pdf, u, "ТЕСТ — НЕ ДЛЯ ОТПРАВКИ", "TEST - NOT FOR SHIPPING", 13, 8)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(2)
    _text(pdf, u, f"Заказ Авито: {order_ext_id}", f"Avito order: {order_ext_id}", 11, 6)
    _text(pdf, u, f"№ в кабинете: {marketplace_id}", f"Marketplace ID: {marketplace_id}", 11, 6)
    _text(pdf, u, f"Магазин: {shop}", f"Shop: {shop}")
    _text(pdf, u, f"ПВЗ: {pvz}", f"PVZ: {pvz}")
    pdf.ln(2)
    for line in items:
        _text(pdf, u, f"• {line}", f"- {line}", 9, 4.5)
    # Место, где у настоящей этикетки стоит официальный QR Авито
    y = 85
    pdf.set_draw_color(0, 0, 0)
    pdf.set_line_width(0.6)
    pdf.rect(25, y, 50, 50)
    pdf.line(25, y, 75, y + 50)
    pdf.line(75, y, 25, y + 50)
    pdf.set_xy(5, y + 52)
    _text(pdf, u, "Здесь будет официальный QR Авито", "Official Avito QR goes here", 8, 4)
    return bytes(pdf.output())


def test_page(*, station: str, printer: str) -> bytes:
    pdf, u = _doc()
    _text(pdf, u, "HUB BRO — тестовая печать", "HUB BRO - test print", 14, 8)
    _text(pdf, u, f"Станция: {station}", f"Station: {station}")
    _text(pdf, u, f"Принтер: {printer}", f"Printer: {printer}")
    pdf.ln(4)
    _text(pdf, u, "Рамка ниже должна быть ровно 80×80 мм. Если размер другой — "
                  "проверьте масштаб и размер носителя в драйвере.",
          "The frame below must be exactly 80x80 mm. Otherwise check scaling and media size in the driver.", 9, 4.5)
    pdf.set_line_width(0.4)
    pdf.rect(10, 60, 80, 80)
    for i in range(0, 81, 10):
        pdf.line(10 + i, 140, 10 + i, 137)
        pdf.line(10, 60 + i, 13, 60 + i)
    return bytes(pdf.output())
