# WhaLe Docs

WhaLe 문서는 아래 순서로 읽는 것을 권장합니다.

## 추천 읽기 순서

1. [README](../README.md)
2. [설정 가이드](./config.md)
3. [아키텍처](./architecture.md)
4. [SDK API](./api/sdk.md)
5. [개발/디버깅 가이드](./dev-and-troubleshooting.md)

## 문서 구성

- `config.md`
  - `whale.config.ts`의 모든 주요 옵션
  - 아이콘, 윈도우 타이틀/이름, 빌드 경로 설정
- `architecture.md`
  - UI ↔ Rust ↔ Frida 데이터 흐름
  - hotkey/store/window/persist 동작 방식
- `api/sdk.md`
  - `@whale1/sdk` 공개 API 레퍼런스
- `dev-and-troubleshooting.md`
  - dev/build 실행 흐름
  - HMR/DevTools/스토어 동기화/윈도우 재오픈 이슈 점검표
- `plans/`
  - 과거 설계/작업 계획 문서 아카이브
