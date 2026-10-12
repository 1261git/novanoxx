# 외부 격리 테스트 배포 준비 — 아직 배포하지 않음

## 준비된 구성

- 기존 Render `Uyunia's workspace` 안에 **새** novanoxx-sandbox-staging 웹서비스와 **새** novanoxx-sandbox-db. 운영 novanoxx/novanoxx-db는 변경하거나 재사용하지 않는다. 작업 공간은 도구가 사용자 직접 확인을 요구하며 최종 자원 생성 승인 때 함께 확인한다.
- 별도 배포 브랜치 후보 `codex/isolated-staging`. 아직 생성/commit/push하지 않았고 운영 main HEAD는 유지한다. 운영 main으로 push해서 자동배포를 유발하지 않는다.
- `Dockerfile.sandbox`/`sandbox-cloud.cjs`는 Windows PostgreSQL 실행기를 사용하지 않는다. 별도 Managed PostgreSQL18, 같은 Virginia 리전 내부 연결을 사용한다.
- 계정·해시·세션과 구매·예약·권한·가상파일·환불·정산 데이터를 PostgreSQL에 저장한다. 기존 auth.cjs의 PG 호환 브리지를 사용한다. 서버 filesystem은 임시 실행 디렉터리뿐이며 SQLite/파일 디스크의 영속성을 주장하지 않는다.
- 실 PG 결제·운영 원본·소셜OAuth는 연결하지 않는다. 기존 격리 거래 UI와 TEST 안내를 사용하고 신규 가상 데이터만 생성한다. 운영/로컬 DB·계정·백업을 업로드하지 않는다.

## 보호 설정

- 환경 `NNX_SANDBOX_REMOTE=1`, 명시적인 `SANDBOX_PG_URL`, nnx_sandbox 사용자/nnx_sandbox_home_* DB 이름, 예상 Render 호스트, DB 내 SANDBOX 마커를 검사한다. 운영 DB명과 운영 onrender 주소는 거절한다.
- 신규 빈 DB만 처음 초기화. 같은 SANDBOX 마커가 있으면 초기화/fixture를 중복 생성하지 않는다. schema/fixture advisory lock으로 시작 경쟁을 방지한다.
- 별도 URL의 HTTPS와 Secure/HttpOnly/SameSite 계정 쿠키. DB 외부 주소 사용 시 verify-full TLS. 기본은 Render 내부 주소. external ipAllowList=[]로 공용 DB 접근 차단.
- 전체 페이지/API/파일에 HTTP Basic 접근 제한. 테스트 진입 사용자명 novanoxx-test, 긴 별도 비밀번호는 Render generateValue 환경변수로 생성한다. 값은 채팅/문서/Git에 남기지 않는다. health만 접근 제한 없이 상태를 확인할 수 있고 DB 접속도 검사한다.
- 운영 OAuth/PG/API 키를 가져오지 않는다. 로그에는 비밀 URL/오류 stack/비밀번호를 출력하지 않는다.
- .dockerignore에 모든 .sandbox-commerce 백업·비밀 config·검증 DB 및 .sandbox-cloud-runtime 제외. .gitignore도 실행자료 제외. 이전 .dockerignore에는 격리 폴더 제외가 없었으므로 이번 준비에서 보완했다. 운영 Dockerfile은 변경하지 않는다.

## 두 Blueprint 초안

`deploy/render.sandbox.yaml`: 무료 평가용. skill 기본값에 따라 free지만 DB가30일 만료되므로 기록 장기 보존용으로 사용하지 않는다.

`deploy/render.sandbox-retained.yaml`: 사용자 선택이 필요한 유료 제안. Web Starter + DB Basic256MB/1GB, autoscaling off, autoDeployTrigger off. 별도 새 DB에서 계정까지 보관하므로 웹 persistent disk는 불필요하다. 기본 compute 약$13/월에 저장소/세금/추가 사용량이 별도다. 생성 화면의 실제 요금/계정 조건을 재확인하고 승인된 범위와 다르면 재확인한다.

공식 자료: [무료DB 만료](https://render.com/docs/free), [소규모 구성 비용](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses), [가격표](https://render.com/pricing), [Blueprint JSON Schema](https://render.com/schema/render.yaml.json).

## 검증 결과

- `scripts/validate-sandbox-blueprint.cjs`: 다운로드한 공식 JSON Schema로 무료/유료 초안 둘 다 PASS. Render CLI는 이 PC에 없으며 CLI 검증이나 실제 계정의 Apply 검증을 했다고 표현하지 않는다.
- `sandbox-cloud.test.cjs`의 설정 guard 및 새 로컬 PG에서 접근 gate/계정 PG 영속성/구매/환불/재시작 테스트2개 PASS.
- 기존 PG 예약 HTTP/환불/PGlite 로그인 회귀3개 PASS. 합계5개.
- 최신 cloud readiness `.sandbox-commerce/nnx-pg-home-PO2fGf/cloud-readiness-report.json`. 새 테스트 DB/보고서와 기존 기록 보존. Docker 엔진이 없어 실제 Linux Docker 이미지 build는 미검증이며 실제 Render 빌드에서 확인해야 한다.

## 승인 후 진행

1. 사용자께 작업 공간과 유료/무료 계획을 확인받는다. 유료 자원은 추가 반복 비용이 생기므로 먼저 자원을 만들지 않는다.
2. 격리 브랜치/checkout에 배포용 파일만 반영하고 필요한 코드와 웹 assets를 allowlist로 포함한다. .sandbox-commerce, backups, connection.json, .env, 비밀파일은 절대로 Git/Docker context에 넣지 않는다.
3. Blueprint 경로/브랜치를 명시하여 Render에 새 자원만 생성한다. 무료/유료 두 초안을 동시에 Apply하지 않는다. 기존 운영 자원 이름/ID와 매칭되지 않는지 확인한다.
4. 실제 빌드/환경변수/포트/health/HTTPS/gate를 확인한다. 그다음 사용자 테스트 계정으로 로그인/구매/예약/취소/환불을 외부에서 검증한다.
5. 별도 OAuth 앱/콜백 및 외부 동시 세션·재배포/장애 검증은 후속 진행. 아직 외부URL 생성·접근 성공·외부 소셜로그인 완료로 표현하지 않는다.

현재 배포 준비만 완료했고 자원 생성/청구/branch push/운영 배포를 수행하지 않았다. 유료 구성 및 작업 공간의 사용자 승인이 다음 조건이다.
