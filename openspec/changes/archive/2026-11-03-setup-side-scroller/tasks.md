# Tasks

## 1. プロジェクトのセットアップ

- [x] 1.1 `package.json`・`tsconfig.json`(strict)・`vite.config.ts`・`index.html` を作成し、`npm install` が成功することを確認する
- [x] 1.2 `typescript`・`vite`・`vitest` を開発依存に追加し、`npm run dev` / `build` / `test` のスクリプトを用意して、`npm run build` が成功することを確認する
- [x] 1.3 `src/core/config.ts` に画面寸法(960×540)・ワールド幅(3840)・物理定数(重力・ジャンプ初速・移動速度・更新間隔 1/60 秒)を定義し、`npx tsc --noEmit` が通ることを確認する

## 2. 固定タイムステップのゲームループ(game-loop)

- [x] 2.1 `src/core/loop.ts` に、経過時間を受け取って固定刻みの更新回数を返すアキュムレータを実装し、1 秒相当の入力でおよそ 60 回になる Vitest が通ることを確認する
- [x] 2.2 経過時間のクランプ(1 フレームの更新回数の上限)を実装し、10 秒停止後でも更新回数が上限内に収まる Vitest が通ることを確認する
- [x] 2.3 60Hz と 144Hz 相当のフレーム間隔で、同じ実時間あたりの更新回数が一致することを確認する Vitest を追加し、通ることを確認する

## 3. プレイヤーの移動・ジャンプ(player-movement)

- [x] 3.1 `src/core/input.ts` に `InputState` を定義し、`src/core/player.ts` に左右移動と停止(左右同時押しは停止)を実装して、移動・停止・同時押しの Vitest が通ることを確認する
- [x] 3.2 重力・ジャンプ(地面でのみ発動、二重ジャンプ禁止、空中での水平移動可)を実装し、放物線軌道と二重ジャンプ禁止の Vitest が通ることを確認する
- [x] 3.3 地面への着地(貫通しない、垂直速度 0、押しっぱなしでの再ジャンプ)を実装し、着地の Vitest が通ることを確認する
- [x] 3.4 ワールド左右端でのクランプを実装し、両端で座標が範囲を出ない Vitest が通ることを確認する

## 4. カメラ(camera-follow)

- [x] 4.1 `src/core/camera.ts` に `computeCameraX`(プレイヤー中心、`[0, worldWidth - viewWidth]` でクランプ、ワールドが画面以下なら 0)を実装し、中央・左端付近・右端付近・狭いワールドの Vitest が通ることを確認する
- [x] 4.2 `worldToScreen` を実装し、カメラ x=100 のとき world x=150 が screen x=50 になる Vitest が通ることを確認する

## 5. ブラウザ統合(platform / main)

- [x] 5.1 `src/platform/keyboard.ts` に `event.code` ベースの入力処理(矢印/A・D/Space、`preventDefault`、フォーカス喪失時の全解除)を実装し、ブラウザで各キーが反応しページがスクロールしないことを確認する
- [x] 5.2 `src/platform/renderer.ts` に Canvas 描画(`devicePixelRatio` 対応、地面、スクロールが分かる目印の縦線、四角形のプレイヤー)を実装し、`npm run dev` で地面とプレイヤーが表示されることを確認する
- [x] 5.3 `src/main.ts` で `requestAnimationFrame` とループ・入力・更新・カメラ・描画を接続し、ブラウザで操作して左右移動・ジャンプ・着地・追従スクロールが仕様どおり動くことを確認する
- [x] 5.4 手動確認: ワールド左右端でのカメラの止まりと、タブを切り替えて戻ったときにプレイヤーが飛ばないことを確認する
- [x] 5.5 `README.md` に起動・テスト・ビルドの手順と操作方法を記載し、記載どおりのコマンドが動くことを確認する

## 6. 全体確認

- [x] 6.1 `npm test`・`npx tsc --noEmit`・`npm run build` がすべて成功することを確認する

## Workflow follow-up

- 実装後に `config.yaml` の文脈(Phaser 3 前提)を Canvas に合わせて更新するか判断する。
- レビュー完了後に change をアーカイブする。
