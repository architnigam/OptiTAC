from pathlib import Path
from xml.sax.saxutils import escape
import re
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf/OptiTAC-Review-2.pdf'
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyReview',fontName='Helvetica',fontSize=9.3,leading=14,spaceAfter=9,textColor=colors.HexColor('#384137')))
styles.add(ParagraphStyle(name='SectionReview',fontName='Helvetica-Bold',fontSize=17,leading=22,spaceBefore=18,spaceAfter=12,textColor=colors.HexColor('#3d553c'),keepWithNext=True))
styles.add(ParagraphStyle(name='SmallReview',fontName='Helvetica',fontSize=8,leading=11,spaceAfter=6,textColor=colors.HexColor('#63705c')))
styles.add(ParagraphStyle(name='CoverTitle',fontName='Times-Roman',fontSize=46,leading=51,textColor=colors.HexColor('#344d34'),spaceAfter=24))
styles.add(ParagraphStyle(name='CellReview',fontName='Helvetica',fontSize=8,leading=11))

def p(s,style='BodyReview'):
    text=escape(s).replace("&lt;br/&gt;", "<br/>")
    text=re.sub(r'(https?://[^\s]+)',r'<link href="\1" color="#3d553c">\1</link>',text)
    return Paragraph(text,styles[style])

def footer(canvas,doc):
    canvas.saveState(); w,h=A4
    canvas.setStrokeColor(colors.HexColor('#cbd1c4'));canvas.line(44,42,w-44,42)
    canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#6a7462'))
    canvas.drawString(44,29,'OPTITAC  /  REVIEW 02  /  13 OCTOBER 2026')
    canvas.drawRightString(w-44,29,str(doc.page));canvas.restoreState()

story=[Spacer(1,60),p('ASSESSMENT 9  /  PROJECT REVIEW 2','SmallReview'),Spacer(1,22),p('OptiTAC<br/>Optimization<br/>Autopsy','CoverTitle'),p('Implementation & research progress report','SectionReview'),p('A compiler notebook for investigating optimization benefit and observed behavioral preservation.'),Spacer(1,30)]
summary=Table([[p('75 / 100','SectionReview'),p('25 / 100','SectionReview')],[p('Implemented planned scope','SmallReview'),p('Reserved for final milestone','SmallReview')]],colWidths=[245,245])
summary.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#e9eddf')),('TOPPADDING',(0,0),(-1,-1),14),('BOTTOMPADDING',(0,0),(-1,-1),12)]));story += [summary,Spacer(1,22),p('Review allocation: prototype 6 marks / report 2 marks / presentation and Q&A 2 marks.'),p('Includes implementation details, validation evidence, related work, an honest novelty statement, demonstration notes and the remaining work.'),p('Milestone percentage is a declared scope allocation. Publication novelty and acceptance are not established.','SmallReview'),PageBreak()]
lines=(ROOT/'docs/review-2-report.md').read_text(encoding='utf-8-sig').splitlines()
i=0
while i<len(lines):
    line=lines[i].strip()
    if not line or line.startswith('# OptiTAC'):
        i+=1;continue
    if line.startswith('## '):
        story.append(p(line[3:],'SectionReview'));i+=1;continue
    if line.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r'[:\- ]+',c) for c in cells):rows.append([p(c,'CellReview') for c in cells])
            i+=1
        t=Table(rows,colWidths=[210,65,220],repeatRows=1,hAlign='LEFT')
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dfe7d7')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f3f4ee'),colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,0),.5,colors.HexColor('#a6b69b'))]));story+=[t,Spacer(1,14)];continue
    story.append(p(line));i+=1
for file,title,caption in [('workbench.png','Appendix A / Working notebook','Actual browser capture: the cascade reduces seven TAC instructions to one; the first propagation checkpoint is open.'),('fault.png','Appendix B / Controlled divergence','Actual browser capture: the deliberately wrong return value is isolated at the injected-fault checkpoint. This is a seeded demonstration.')]:
    path=ROOT/'tmp/pdfs'/file
    if path.exists():
        from PIL import Image as PILImage
        with PILImage.open(path) as im:w,h=im.size
        scale=min(495/w,610/h)
        story += [PageBreak(),p(title,'SectionReview'),p(caption),Image(str(path),width=w*scale,height=h*scale)]
OUT.parent.mkdir(parents=True,exist_ok=True)
SimpleDocTemplate(str(OUT),pagesize=A4,rightMargin=44,leftMargin=44,topMargin=40,bottomMargin=57,title='OptiTAC - Review 2 Progress Report',author='OptiTAC Project',allowSplitting=True).build(story,onFirstPage=footer,onLaterPages=footer)
from pypdf import PdfReader
reader=PdfReader(OUT)
print(f'Created {OUT}: {len(reader.pages)} pages')
assert all(page.extract_text().strip() for page in reader.pages)

