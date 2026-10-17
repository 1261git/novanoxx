from pathlib import Path
import json, re, hashlib
from collections import Counter
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT.parent / 'novanoxx-stage10-evidence-20261017'
DATA = json.loads((ROOT / 'docs/stage10-readiness.json').read_text(encoding='utf-8'))
PLAN = json.loads((ROOT / 'docs/privacy-release-plan.json').read_text(encoding='utf-8'))
SOURCE = json.loads((EVIDENCE / 'function-status-source163.json').read_text(encoding='utf-8'))
OUT = ROOT.parent / '문서파일' / 'NovaNoxX_10단계_기능현황과출시조건_2026-10-18.pdf'
assert len(DATA['features']) == 123
assert {f['id'] for f in DATA['features']} == {f['ID'] for f in SOURCE}

pdfmetrics.registerFont(TTFont('Malgun', r'C:\Windows\Fonts\malgun.ttf'))
pdfmetrics.registerFont(TTFont('MalgunBold', r'C:\Windows\Fonts\malgunbd.ttf'))
pdfmetrics.registerFontFamily('Malgun', normal='Malgun', bold='MalgunBold')
styles = getSampleStyleSheet()
styles.add(ParagraphStyle('KTitle', fontName='MalgunBold', fontSize=23, leading=32, textColor=colors.black, spaceAfter=12))
styles.add(ParagraphStyle('KSub', fontName='Malgun', fontSize=11, leading=18, spaceAfter=16))
styles.add(ParagraphStyle('KH1', fontName='MalgunBold', fontSize=14, leading=21, textColor=colors.black, spaceBefore=13, spaceAfter=8, keepWithNext=True))
styles.add(ParagraphStyle('KH2', fontName='MalgunBold', fontSize=11, leading=17, textColor=colors.black, spaceBefore=8, spaceAfter=5, keepWithNext=True))
styles.add(ParagraphStyle('KBody', fontName='Malgun', fontSize=10, leading=16, wordWrap='CJK', spaceAfter=8))
styles.add(ParagraphStyle('KCell', fontName='Malgun', fontSize=9, leading=13, wordWrap='CJK'))
styles.add(ParagraphStyle('KHeader', parent=styles['KCell'], fontName='MalgunBold', textColor=colors.white))
styles.add(ParagraphStyle('KSmall', fontName='Malgun', fontSize=8.3, leading=12.5, wordWrap='CJK', spaceAfter=6))
story = []

def para(text, style='KBody'):
    return Paragraph(escape(str(text)).replace('\n', '<br/>'), styles[style])

def add(text, style='KBody'):
    story.append(para(text, style))

def table(rows, widths, compact=False):
    formatted = [[para(cell, 'KHeader' if i == 0 else 'KCell') for cell in row] for i, row in enumerate(rows)]
    t = Table(formatted, colWidths=widths, repeatRows=1, hAlign='LEFT')
    commands = [('BACKGROUND', (0,0), (-1,0), colors.HexColor('#263746')),
                ('GRID', (0,0), (-1,-1), 0.45, colors.HexColor('#D9D9D9')),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('LEFTPADDING', (0,0), (-1,-1), 7), ('RIGHTPADDING', (0,0), (-1,-1), 7),
                ('TOPPADDING', (0,0), (-1,-1), 6 if compact else 8),
                ('BOTTOMPADDING', (0,0), (-1,-1), 6 if compact else 8)]
    for i in range(1, len(rows)):
        if i % 2 == 0: commands.append(('BACKGROUND', (0,i), (-1,i), colors.HexColor('#F3F6F8')))
    t.setStyle(TableStyle(commands))
    story.extend([t, Spacer(1, 9)])

add('NovaNoxX 10단계\n기능 현황과 출시 조건', 'KTitle')
add('2026년 10월 18일 KST  |  인수인계 171번 기준', 'KSub')
add('핵심 거래와 운영 준비 기능은 격리 개발본에 연결했습니다. 공개 운영 전환에는 실제 DB와 파일의 권한 매핑, 개인정보 처리 조건, 문서와 전체 화면 검수, 결제 제공자 회신이 남아 있습니다.')
add('이 문서는 원래 PRD의 123개 기능 ID를 유지하면서 최신 구현 근거와 출시 조건을 대조합니다. 상세 원요구사항은 기존 PRD와 기능정의서를 함께 참조합니다. 실제 운영 서비스 배포나 전체 기능의 출시 승인을 뜻하지 않습니다.')
table([
    ['구분', '현재 기준'],
    ['반영 위치', 'novanoxx-stage10-integration-20261017 격리 개발본'],
    ['실제 운영', '배포와 운영 자료 변경 없음. TEST 기능과 LIVE 금융을 분리'],
    ['고정 정책', '총 수수료 12% 원 미만 버림, 단독 관리자, 담당 역할 배정 Phase2'],
    ['데이터 선택', '검색·유입 계정 연결, 추가 IP 수집 없음, 현재 기록 120일, 기본 수집 차단'],
    ['백업', '검색·유입 원문 포함 의사 확인. 90일을 검토 중이며 기간과 용량은 미확정'],
    ['외부 일정', 'Toss 회신은 10월 20일 화요일 확인 예정. 추가 문의와 신청 없음']
], [31*mm, 143*mm])
add('완료 판단 기준', 'KH1')
add('격리 구현은 지정된 로컬 흐름과 증거가 있다는 뜻입니다. 이전 근거 유지는 해당 기능을 이번에 전수 재검증하지 않았다는 뜻입니다. 추가 확인은 남은 구현 또는 운영 검수 항목이 있다는 뜻입니다. Phase2와 MVP 제외 항목은 현재 출시 필수 개발과 구분합니다.')
add('기존 운영·TEST 기록과 미커밋 수정은 보존하며 원래 675개 파일의 해시 불변을 확인했습니다. 사용자 브라우저의 54514 포트와 운영 서버는 조작하지 않았습니다.', 'KSmall')
story.append(PageBreak())

add('확정 정책과 거래 동작', 'KH1')
table([
    ['항목', '적용 기준'],
    ['수수료', '최종 원화 거래금액 × 12%에서 원 미만을 버림. 예상 판매자 금액은 판매가에서 수수료를 뺀 값. 실제 정산은 미실행'],
    ['관리자', 'novanoxx2026@gmail.com 전체 관리. 기존 허용 기록을 보존하며 역할 배정과 위임은 Phase2'],
    ['Brief', '독점·비독점과 이용 범위는 당사자 협의. NovaNoxX는 중개. 최종 납품 범위는 약정 최종본'],
    ['Brief 권리', '구매자 상업적 이용·수정은 판매자가 적법하게 허락 가능한 범위와 사전 고지된 제3자 조건을 따름. 사이트 내 무단 재판매는 운영 검토·제재 대상'],
    ['제3자 소재', '판매자가 이용 허락과 제한을 확보·고지. 구매자는 조건 준수. 중개·심사는 권리 보증이 아니며 법정 플랫폼 의무는 보존'],
    ['콘테스트', '일정·심사 기준·상금/혜택을 관리자가 입력한 뒤 공개. 접수된 해당 콘테스트 작품에서 수상작 수동 선정. 자동 지급 없음']
], [28*mm, 146*mm])
add('추가 작업이 없는 등록 최종본 구매', 'KH2')
add('원래 PRD는 추가 작업 없는 구매의 즉시 완료를 요구합니다. 171번에서는 판매자가 즉시 제공을 명시한 상품에 이 경로를 연결했습니다. 구매자가 추가 작업을 선택하지 않으면 TEST 차감·주문·등록 최종본 사본·COMPLETED·독점 상품 SOLD 처리를 같은 거래 안에서 수행합니다. 여러 사람에게 판매하는 상품은 ACTIVE를 유지합니다.')
add('기존 상품·주문은 종전 WORKFLOW를 유지합니다. 추가 작업을 선택하면 자료 제출·작업·보호 납품·검수 흐름을 적용합니다. 실제 LIVE 권리 부여·정산과 기존 운영 상품의 전환은 별도 확인 대상입니다.')
add('제작 자료와 파일 보호', 'KH2')
add('주문 자료와 메시지 첨부는 업로드만으로 상대방에게 공개되지 않습니다. 실제 제출과 메시지에 연결된 파일만 해당 주문 참가자가 받을 수 있습니다. 최종본은 현재 납품 버전과 완료 상태를 확인하고 파일 크기·지문을 검증합니다. 직접 변환할 수 없는 제작 원본은 별도 검수 자료와 확인 절차를 사용합니다.')
story.append(PageBreak())

add('개인정보와 백업 준비', 'KH1')
for row in PLAN['processingRegister']:
    add(row['purpose'], 'KH2')
    add('항목: ' + ' · '.join(row['items']))
    add('처리 범위: ' + row['scope'] + '\n보존: ' + row['retention'], 'KSmall')
add('공개 운영자 정보', 'KH2')
add('사업자명 ' + PLAN['operator']['legalName'] + '  |  개인정보 보호책임자 ' + PLAN['operator']['privacyOfficer'])
add('문의 이메일 ' + PLAN['operator']['publicContact'])
add('검색·유입 기록의 선택과 삭제', 'KH2')
add('수집 허용 전에는 기록하지 않습니다. 이용자가 수집을 철회하면 해당 계정의 현재 검색·유입 기록과 관련 재시도 요청 내용을 삭제합니다. 기존 기록만 삭제하는 선택도 제공합니다. 다른 계정과 거래·분쟁·보안 기록은 이 동작의 대상이 아닙니다.')
add('신규 가입 시각은 이메일·인증메일·Google·Kakao·Naver 생성 경로에 연결했습니다. 과거 가입 시각은 추정하지 않습니다. 구매 국가 코드는 이용자 선택 입력이며 미검증 정보로 저장합니다. 실제 결제·세무 국가 인증으로 사용하지 않습니다.')
story.append(PageBreak())
add('백업 보관과 운영 검토', 'KH1')
add('원문 백업 90일 검토 시 저장량 예시', 'KH2')
table([
    ['보관 기간', '매일 10MB 전체 백업', '매일 100MB 전체 백업'],
    ['7일', '약 70MB', '약 700MB'],
    ['28일', '약 280MB', '약 2.8GB'],
    ['90일 검토안', '약 900MB', '약 9GB']
], [32*mm, 71*mm, 71*mm], True)
add('위 수치는 매일 전체 백업 1개를 만드는 가정이며 압축·증분·기존 거래 백업·부가 저장량을 포함하지 않습니다. 현재 자동 백업 코드의 전체 보관 예산은 약 4GB입니다. 새 백업 크기나 기존 보관량이 없으면 시작 불가, 합계가 예산을 넘으면 중지하도록 계산기를 준비했습니다. 자원 생성·증설·실제 백업 변경은 하지 않았습니다.', 'KSmall')
add('현재 기록 120일 후에도 그 직전 생성된 백업이 90일 남을 수 있어 보존 기간은 분리해 고지해야 합니다. 이용자 삭제·철회 이후의 원문 접근 차단과 복구 시 재삭제는 실제 백업·복구 절차에 연결해 검증해야 합니다. 기존 전체 백업은 임의 삭제하지 않습니다.')
story.append(PageBreak())

add('운영 전 확인할 조건', 'KH1')
table([
    ['확인할 범위', '남은 작업과 조건'],
    ['개인정보 공개 정보', '사업자명·보호책임자·공개 문의처 확정. 위탁 계약·보관 위치·국외 이전·권리 요청 절차와 실제 처리방침 확인은 잔여'],
    ['백업과 복구', '원문 백업 기간 확정, 실제 크기·기존 보관량 측정. 복구 시 현재 삭제 내역과 만료 기록을 다시 처리하고 수집은 비활성 상태에서 검증'],
    ['운영 거래와 파일', '실제 PostgreSQL 계정·상품 ID·잔액·TEST/LIVE·파일 권한을 매핑. 기존 파일·지문·보호 사본 이전 및 복구 확인'],
    ['화면과 문서', '전체 브라우저 동선·접근성·모국어·법률 검수. Word 수정본은 필수 페이지 렌더러가 없어 기존 원본 보존'],
    ['실금융', '제공자 회신 후 NEON 한도·환급·정산·실제 결제 국가·환불 사유·정기청구 연결. 계약 전 실제 처리 없음'],
    ['운영자 입력', '실제 콘테스트 일정·기준·혜택, 운영 계정과 도메인·키 갱신 담당자 확인']
], [33*mm, 141*mm])
add('검증 근거와 적용 한계', 'KH2')
for name, label in [('bundle170-sqlite-report.json','170 SQLite'),('bundle170-postgres-report.json','170 내장 PostgreSQL'),('auth170-report.json','170 가입 핸들러'),('release171-sqlite-report.json','171 SQLite'),('release171-postgres-report.json','171 내장 PostgreSQL')]:
    result=json.loads((EVIDENCE / name).read_text(encoding='utf-8'))
    add(f'{label}: {result["passed"]}개 확인 통과. 근거 {name}', 'KSmall')
add('171 확인은 등록 즉시 제공의 원장/파일/상태 원자 처리와 실패 취소, 재시도·접근 제한·이전 흐름 유지, 백업 용량/접근 계획 및 개인정보 문서 준비 검사입니다. 실제 네트워크 PostgreSQL·운영 자료 전환·외부 OAuth·전체 시각 검수를 수행한 결과는 아닙니다.', 'KSmall')
add('공식 자료', 'KH2')
add('개인정보보호위원회 개인정보 처리방침 작성지침 2026년 4월 개정. 운영자가 실제 처리 현황과 공개 항목을 확인할 때 참조합니다. 이 문서는 법률 검토 완료를 표시하지 않습니다.', 'KSmall')
add('pipc.go.kr 안내서 게시판 게시물 12018\n국가법령정보센터 개인정보 보호법 제21조와 제30조', 'KSmall')
story.append(PageBreak())

add('전체 123개 기능의 현황 대조', 'KH1')
add('이전 기준은 원래 기능 상태를 보존한 열입니다. 현재 판정은 이번 개발본의 적용 범위이며 출시 승인 여부를 나타내지 않습니다. 근거 번호는 두 인수인계 파일의 번호를 뜻합니다. 번호가 없는 항목은 이전 기준과 관련 증거를 유지하며 이번에 전수 재검증하지 않았습니다.', 'KSmall')
verdicts={'OPEN':'추가 확인','BASELINE_RETAINED_NOT_RELEASE_CERTIFIED':'이전 근거 유지','LOCAL_IMPLEMENTED_OPERATING_INTEGRATION_OPEN':'격리 구현','DEFERRED_OR_EXCLUDED':'후순위 또는 제외'}
rows=[['ID','기능','이전 기준','현재 판정','인수인계 근거']]
for f in DATA['features']:
    refs=[]
    for ref in f['current'].get('refs',[]):
        m=re.search(r'HANDOFF(\d+)',ref)
        if m and m.group(1) not in refs: refs.append(m.group(1))
    rows.append([f['id'], f['name'], f['baselineStatus'], verdicts[f['releaseVerdict']], ' · '.join(refs) if refs else '이전 기준'])
table(rows, [17*mm, 58*mm, 28*mm, 36*mm, 35*mm], True)
add('기준 자료: docs/stage10-readiness.json의 123개 ID 및 원래 function-status-source163.json. ID 집합 일치를 생성 시 검사했습니다. 상세 구현과 운영 조건은 앞의 본문 및 각 인수인계 근거를 함께 확인합니다.', 'KSmall')

def page(canvas, doc):
    canvas.setFont('Malgun', 8)
    canvas.setFillColor(colors.HexColor('#555555'))
    canvas.drawString(18*mm, 13*mm, 'NovaNoxX 10단계  2026년 10월 18일')
    canvas.drawRightString(A4[0]-18*mm, 13*mm, str(doc.page))

doc=SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=18*mm, bottomMargin=21*mm, title='NovaNoxX 10단계 기능 현황과 출시 조건', author='NovaNoxX')
doc.build(story, onFirstPage=page, onLaterPages=page)
reader=PdfReader(str(OUT))
text='\n'.join(p.extract_text() or '' for p in reader.pages)
missing=[f['id'] for f in DATA['features'] if f['id'] not in text]
assert not missing, missing
result={'file':str(OUT),'pages':len(reader.pages),'ids':123,'missingIds':missing,'bytes':OUT.stat().st_size,'sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'scope':'123-ID implementation and release-condition companion; original Word and contract PDF preserved; visual review pending'}
(EVIDENCE/'document171-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
