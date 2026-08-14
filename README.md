# SKAX 협업 시트 관리 페이지

사업단과 SKAX 간 일정 조율 및 협조사항을 구글 시트로 지속 관리하기 위한 접속 페이지입니다.

## 구성

- **첫 페이지**: `행사운영` / `교육운영` 두 개의 카드
- **카드 클릭 시**: 해당 구글 시트가 페이지 안에 임베드되어 표시되며, 구글 시트와 동일하게 바로 편집할 수 있습니다 (편집 권한은 구글 계정의 시트 공유 설정을 따릅니다).
- **홈으로 버튼**: 시트 화면 좌측 상단 `← 홈으로` 버튼으로 첫 페이지로 돌아갑니다. 브라우저 뒤로가기도 동작합니다.
- **새 탭에서 열기**: 브라우저의 서드파티 쿠키 차단 등으로 임베드 화면에서 로그인/편집이 제한될 경우를 대비한 우회 버튼입니다.

## 연결된 시트

| 카드 | 시트 |
|------|------|
| 행사운영 | [Google Sheet](https://docs.google.com/spreadsheets/d/1j3mOn0Np0kv9UzT_cb6lBVFahkWJkwOlrx4t1044w9k/edit?gid=1923123151) |
| 교육운영 | [Google Sheet](https://docs.google.com/spreadsheets/d/14PVCDzCXcEBTCx4e4vGfkTSTPivqsipQC4Ym_A6FHLA/edit?gid=115072733) |

카드와 시트의 매칭을 바꾸려면 `index.html`의 `SHEETS` 객체에서 `url` 값을 수정하면 됩니다.

## 실행 방법

별도의 빌드 없이 정적 HTML 한 파일로 동작합니다.

```bash
# 로컬에서 열기
open index.html            # macOS
start index.html           # Windows

# 또는 간단한 로컬 서버로 실행
python3 -m http.server 8000
# http://localhost:8000 접속
```

GitHub Pages, Vercel, Netlify 등 정적 호스팅에 그대로 배포할 수 있습니다.
