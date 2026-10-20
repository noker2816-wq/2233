# 서무 전광판

노션 "서무 할 일"(할 일 메모 DB)의 남은 업무를 사무실 모니터·TV에 LED 전광판처럼 띄우는 페이지.

- 수합일·제출마감일을 따로 D-day로 표시 (수합 완료면 수합은 빠짐)
- 날짜 지남 / 오늘 / 7일 이내 / 날짜 미정 / 최근 7일 해낸 일
- 목록이 길면 10초마다 페이지 넘김, 하단에 다음 기한 자막
- 3분마다 새 데이터 확인, 분 단위로 D-day 다시 계산 (한국시간 기준)
- 전체 화면 `F`, 저장된 비밀번호 지우고 잠그기 `L`

미리보기: 배포 주소 뒤에 `?demo=1` (가상의 예시 업무)

## 구조

```
노션 ──(GitHub Actions, 평일 10분마다)── scripts/sync.mjs
          │  업무 제목·날짜·상태만 추림 (메모 본문은 안 씀)
          │  BOARD_PASSWORD로 AES-256-GCM 암호화
          ▼
   site/data.enc.json ── GitHub Pages ── 브라우저에서 비밀번호로 복호화
```

레포가 공개라서 코드와 페이지 주소는 누구나 볼 수 있지만, 업무 데이터는 암호화된 파일로만 배포된다. git 기록에도 데이터가 남지 않는다(배포 아티팩트로만 올라감).

## 처음 설정 (한 번만)

1. **노션 통합 만들기**
   [노션 통합 관리](https://www.notion.so/profile/integrations) → 새 통합 → 유형 "내부", 이름 `서무 전광판` → 기능은 **콘텐츠 읽기만** 체크 → 저장 후 **내부 통합 시크릿**(`ntn_...`) 복사

2. **노션 DB에 통합 연결**
   노션 "서무 할 일" 페이지 오른쪽 위 `•••` → 연결(Connections) → `서무 전광판` 추가

3. **GitHub 시크릿 등록**
   레포 Settings → Secrets and variables → Actions → New repository secret
   - `NOTION_TOKEN` : 1번에서 복사한 시크릿
   - `BOARD_PASSWORD` : 전광판 비밀번호 (12자 이상 권장, 암호화 파일은 누구나 받을 수 있어서 짧으면 뚫릴 수 있음)

4. **GitHub Pages 켜기**
   Settings → Pages → Build and deployment → Source: **GitHub Actions**

5. **첫 실행**
   Actions 탭 → "전광판 동기화·배포" → Run workflow
   끝나면 `https://<아이디>.github.io/<레포명>/` 에서 비밀번호 입력

## 참고

- GitHub 예약 실행은 몇 분씩 늦어질 수 있다. 화면 오른쪽 위에 마지막 동기화 시각이 나오고, 40분 넘게 안 바뀌면 "동기화 지연"으로 표시된다.
- 공개 레포는 60일 동안 커밋이 없으면 GitHub가 예약 실행을 자동으로 멈춘다. 그때는 Actions 탭에서 다시 켜면 된다.
- 비밀번호를 바꾸면 다음 동기화부터 새 비밀번호로 열린다. 기존 화면은 자동으로 잠금 화면으로 바뀐다.
- 날짜가 지난 업무는 "확인" 대상으로만 표시하고 미처리로 단정하지 않는다. 완료 여부는 노션 완료 체크 기준.

## 로컬 실행

```bash
npm test                                   # 날짜 판정·암호화 테스트
NOTION_TOKEN=... BOARD_PASSWORD=... npm run sync   # site/data.enc.json 생성
python3 -m http.server -d site 8000        # http://localhost:8000
```
