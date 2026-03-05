# DX 강화: Store 타입 자동 추론 설계

## 배경

Frida 비개발자가 WhaLe로 트레이너 앱을 만들 때 겪는 주요 마찰:

1. `whale-store.d.ts`를 store 파일과 이중으로 유지해야 함
2. 여러 store 사용 시 타입 흐름이 끊김
3. `__whale_store__` 단일 전역 → 어떤 store인지 불명확

## 결정 사항

- Frida 스크립트에서 store별 전역 변수 (`__trainer__`, `__esp__` 등)
- `whale-store.d.ts` 삭제, `globals.d.ts`로 대체
- `globals.d.ts`에서 store 파일의 타입을 `import type`으로 직접 참조 → 이중 유지 제거
- `set()` API 유지
- Frida tsconfig에 `moduleResolution: bundler` 추가

## 변경 범위

| 파일 | 액션 |
|------|------|
| `apps/example/src/script/whale-store.d.ts` | 삭제 |
| `apps/example/src/script/globals.d.ts` | 신규 |
| `apps/example/src/script/tsconfig.json` | moduleResolution 추가 |
| `apps/example/src/script/main.ts` | `__whale_store__` → `__trainer__` |

## Frida 런타임 동작

`frida.scripts[].store: 'trainer'`를 지정하면 Rust가 스크립트 주입 전에 아래 preamble을 삽입:

```js
const __trainer__ = (function() { ... })()
```

즉 런타임에서 이미 `__trainer__` 이름으로 주입됨. 타입 선언만 맞추면 됨.
