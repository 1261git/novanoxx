
## 204. 2026-10-19 — 모바일 마켓플레이스 카테고리 터치 닫힘 수정

- 운영 0237e42fd60553d5aa4fbbb01b34d4086e994870 / dep-dbau8kbm8hqs73bq1ct0 LIVE 확인. 터치 pointerleave(손가락을 뗌)와 마우스 hover 이탈을 구분하고, 모바일 focusout의 null 대상 및 주소창 높이 resize 때문에 메뉴가 닫히는 동작을 제외. 실제 화면 너비 변경/바깥 터치/메뉴 선택/Escape는 닫기 유지. touch-action pan-y 및 overscroll contain 적용.
- 확인: market-menu.test.cjs 2건 PASS(터치 이탈·초점 해제·높이 resize 유지/상위 펼침/하위 이동/바깥 닫기/폭 변경 닫기/데스크톱 hover·키보드). 운영390px 브라우저 메뉴 폭351px·화면 내 표시, 하위 광고 영상 선택 → category=VIDEO&subcategory=Commercial 및 상품1개·메뉴닫힘 확인. 전체 상품8개 유지. 실제 휴대폰 물리 기기의 Safari/Chrome 검수는 별도이며 합성 이벤트 확인과 구분.
- 개발자노트 갱신. 새 자원/요금제/고정비 추가0, 기존 사용량 과금 기준 유지. 결제/DB/업로드/원본/운영설정 변경0. 기존 미커밋675파일 보존 확인(changed []). 옆 사용자 탭은 sandbox-staging TEST이므로 운영 novanoxx.com에서 수정 확인하도록 안내. TEST 서버 코드/자료/설정 변경0.
