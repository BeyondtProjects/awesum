#!/usr/bin/env python3
"""
TalktoWP Instagram carousel renderer — light-mode "carouselD" house style.

Usage:
    python3 carousel_render.py <spec.json> <output_dir>

spec.json shape:
{
  "slide1": {"headline": "...", "sub": "..."},
  "slide2": {"headline": "...", "sub": "..."},
  "slide3": {"headline": "...", "alert_lines": ["line 1", "line 2", "line 3"], "sub": "..."},
  "slide4": {"headline": "...", "sub": "...", "cta": "Install free on WordPress.org", "footer": "Link in bio"}
}

Writes slide-1.png .. slide-4.png (1080x1080) into output_dir.
Requires: weasyprint, pymupdf (fitz) — both already installed in this sandbox.
Font + logo assets live alongside this script (fonts/, logo.png) — do not move
this script away from those without updating the paths below.
"""
import json
import os
import sys
import subprocess

TEMPLATE_DIR = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(TEMPLATE_DIR, "fonts")
LOGO_PATH = os.path.join(TEMPLATE_DIR, "logo.png")

BG = "#F6F8FF"
INK = "#0D1117"
BLUE = "#1448CC"
BODY_GRAY = "#374151"
MUTED = "#6B7280"
CTA_BG = "#2060F0"
ERROR_RED = "#DC2626"
CARD_WHITE = "#FFFFFF"

FONT_CSS = f"""
@font-face {{
  font-family: 'Plus Jakarta Sans';
  src: url('file://{FONTS_DIR}/pjs-500.woff2') format('woff2');
  font-weight: 500;
}}
@font-face {{
  font-family: 'Plus Jakarta Sans';
  src: url('file://{FONTS_DIR}/pjs-700.woff2') format('woff2');
  font-weight: 700;
}}
@font-face {{
  font-family: 'Plus Jakarta Sans';
  src: url('file://{FONTS_DIR}/pjs-800.woff2') format('woff2');
  font-weight: 800;
}}
@font-face {{
  font-family: 'JetBrains Mono';
  src: url('file://{FONTS_DIR}/jbm-400.woff2') format('woff2');
  font-weight: 400;
}}
@font-face {{
  font-family: 'JetBrains Mono';
  src: url('file://{FONTS_DIR}/jbm-500.woff2') format('woff2');
  font-weight: 500;
}}
"""

BASE_CSS = f"""
{FONT_CSS}
@page {{ size: 1080px 1080px; margin: 0; }}
* {{ box-sizing: border-box; }}
body {{
  width: 1080px; height: 1080px; margin: 0;
  background: {BG};
  font-family: 'Plus Jakarta Sans', sans-serif;
  position: relative;
  overflow: hidden;
}}
.frame {{
  width: 1080px; height: 1080px;
  padding: 90px 86px;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 2;
}}
.motif {{
  position: absolute;
  right: -120px;
  bottom: -120px;
  width: 620px;
  opacity: 0.06;
  z-index: 1;
}}
.counter {{
  font-family: 'JetBrains Mono', monospace;
  font-size: 24px;
  font-weight: 500;
  color: {MUTED};
  letter-spacing: 1px;
  margin-bottom: 50px;
}}
.headline {{
  font-weight: 800;
  color: {INK};
  line-height: 1.18;
  letter-spacing: -0.5px;
}}
.sub {{
  font-weight: 500;
  line-height: 1.45;
  margin-top: 28px;
}}
.spacer {{ flex: 1; }}
.mono-card {{
  background: {CARD_WHITE};
  border-radius: 20px;
  padding: 42px 44px;
  margin-top: 36px;
  box-shadow: 0 2px 24px rgba(13,17,23,0.08);
}}
.mono-line {{
  font-family: 'JetBrains Mono', monospace;
  font-size: 28px;
  font-weight: 500;
  color: {INK};
  line-height: 1.55;
  white-space: pre-wrap;
}}
.mono-line .err {{ color: {ERROR_RED}; }}
.cta-button {{
  display: inline-block;
  background: {CTA_BG};
  color: #FFFFFF;
  font-weight: 700;
  font-size: 30px;
  padding: 26px 44px;
  border-radius: 14px;
  margin-top: 40px;
}}
.footer {{
  font-family: 'JetBrains Mono', monospace;
  font-size: 22px;
  color: {MUTED};
  margin-top: 22px;
}}
"""


def _html(body_inner, motif=False):
    motif_tag = f'<img class="motif" src="file://{LOGO_PATH}">' if motif else ""
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>{BASE_CSS}</style></head>
<body>
{motif_tag}
<div class="frame">
{body_inner}
</div>
</body></html>"""


def _render_png(html_str, out_path, work_dir):
    import shutil
    from weasyprint import HTML
    import fitz

    base_name = os.path.splitext(os.path.basename(out_path))[0]
    html_path = os.path.join(work_dir, base_name + ".html")
    pdf_path = os.path.join(work_dir, base_name + ".pdf")
    tmp_png_path = os.path.join(work_dir, base_name + ".png")
    with open(html_path, "w") as f:
        f.write(html_str)
    HTML(html_path).write_pdf(pdf_path)

    doc = fitz.open(pdf_path)
    page = doc[0]
    # WeasyPrint emits the PDF in points (1 CSS px = 0.75pt), so a "1080px"
    # @page becomes an 810pt page. Scale back up to a true 1080x1080 raster.
    zoom = 1080 / page.rect.width
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    # Render to local scratch space first, then copy into place — some
    # mounted output folders don't support in-place overwrite via direct save.
    pix.save(tmp_png_path)
    doc.close()
    if os.path.exists(out_path):
        os.remove(out_path)
    shutil.copy(tmp_png_path, out_path)


def build_carousel(spec, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    work_dir = "/tmp/_carousel_render_work"
    os.makedirs(work_dir, exist_ok=True)

    s1, s2, s3, s4 = spec["slide1"], spec["slide2"], spec["slide3"], spec["slide4"]

    # Slide 1 — the recognisable claim. Motif watermark on.
    body1 = f"""
<div class="counter">01 / 04</div>
<div class="headline" style="font-size:64px;">{s1['headline']}</div>
<div class="sub" style="font-size:34px; color:{BLUE};">{s1.get('sub','')}</div>
<div class="spacer"></div>
"""
    _render_png(_html(body1, motif=True), os.path.join(out_dir, "slide-1.png"), work_dir)

    # Slide 2 — twist the knife. No motif.
    body2 = f"""
<div class="counter">02 / 04</div>
<div class="headline" style="font-size:58px;">{s2['headline']}</div>
<div class="sub" style="font-size:32px; color:{BODY_GRAY};">{s2.get('sub','')}</div>
<div class="spacer"></div>
"""
    _render_png(_html(body2, motif=False), os.path.join(out_dir, "slide-2.png"), work_dir)

    # Slide 3 — introduce TalktoWP + mono-card alert example. No motif.
    alert_lines = s3.get("alert_lines", [])
    mono_html = "<br>".join(alert_lines)
    body3 = f"""
<div class="counter">03 / 04</div>
<div class="headline" style="font-size:54px;">{s3['headline']}</div>
<div class="mono-card"><div class="mono-line">{mono_html}</div></div>
<div class="sub" style="font-size:30px; color:{BLUE};">{s3.get('sub','')}</div>
<div class="spacer"></div>
"""
    _render_png(_html(body3, motif=False), os.path.join(out_dir, "slide-3.png"), work_dir)

    # Slide 4 — single CTA. Motif watermark on.
    body4 = f"""
<div class="counter"></div>
<div class="headline" style="font-size:62px;">{s4['headline']}</div>
<div class="sub" style="font-size:36px; color:{BLUE};">{s4.get('sub','')}</div>
<div class="cta-button">{s4.get('cta', 'Install free on WordPress.org')}</div>
<div class="footer">{s4.get('footer', 'Link in bio')}</div>
<div class="spacer"></div>
"""
    _render_png(_html(body4, motif=True), os.path.join(out_dir, "slide-4.png"), work_dir)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 carousel_render.py <spec.json> <output_dir>")
        sys.exit(1)
    spec_path, out_dir = sys.argv[1], sys.argv[2]
    with open(spec_path) as f:
        spec = json.load(f)
    build_carousel(spec, out_dir)
    print(f"Rendered 4 slides to {out_dir}")
