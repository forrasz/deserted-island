# 無人島脱出

無人島から脱出する横スクロール2Dアクションゲーム(開発中)。
TypeScript + Vite + HTML5 Canvas で実装しています。

## 必要なもの

- Node.js 20 以上、npm

## 使い方

```bash
npm install      # 依存関係のインストール
npm run dev      # 開発サーバを起動 (http://localhost:5173)
npm test         # ゲームロジックのユニットテスト (Vitest)
npm run build    # 型チェックと本番ビルド (dist/)
```

## 操作

| 操作 | キー |
|---|---|
| 左へ移動 | `←` / `A` |
| 右へ移動 | `→` / `D` |
| ジャンプ | `Space` |

## 構成

- `src/core/`: 描画・DOM に依存しないゲームロジック(Vitest でテスト)
- `src/platform/`: Canvas 描画とキーボード入力
- `src/main.ts`: ゲームループの組み立て
- `openspec/`: OpenSpec による仕様・変更管理
