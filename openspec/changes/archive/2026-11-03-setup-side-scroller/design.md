# Design

## Context

- リポジトリにはまだアプリのコードがない(greenfield)。動機とスコープは proposal.md を参照。
- プロジェクト方針: ゲームロジックは描画・DOM に依存しない純粋な TypeScript とし、Canvas / キーボードは薄いアダプタに留める。テストは Vitest でロジック層のみ。
- `openspec/config.yaml` の文脈は Phaser 3 前提だが、本変更では指示により素の Canvas を使う(proposal.md の Impact 参照)。

## Goals / Non-Goals

**Goals:**
- ロジック層(`core`)と実環境依存層(`platform`)を分け、`core` を Node 上の Vitest だけで検証できるようにする
- 後続の変更(敵・アイテム・イカダ)が載せられる、更新/描画/入力の骨格を作る

**Non-Goals:**
- 敵、アイテム、サウンド、アセット読み込み、シーン遷移
- ECS などの汎用エンティティ基盤(必要になった時点で別の変更として検討する)
- タッチ操作・ゲームパッド対応、ウィンドウリサイズへの追従(キャンバスは固定論理解像度)

## Decisions

### 1. ディレクトリ構成: `core` と `platform` の分離
```
src/
  core/        # 純粋なロジック。DOM/Canvas を import しない
    config.ts      # 物理定数・画面/ワールド寸法
    input.ts       # InputState 型(left/right/jump)
    player.ts      # Player 状態と step(player, input, dt, world)
    camera.ts      # computeCameraX(player, viewWidth, worldWidth), worldToScreen
    loop.ts        # 固定タイムステップのアキュムレータ(時間は引数で受け取る)
  platform/    # ブラウザ依存
    keyboard.ts    # keydown/keyup → InputState
    renderer.ts    # Canvas への描画
  main.ts      # 組み立てと requestAnimationFrame
```
- 理由: ロジックが DOM を知らなければ Vitest(Node 環境)でそのまま検証できる。
- 代替: すべてを 1 クラスにまとめる案は、テストに DOM のモックが必要になるため却下。

### 2. 固定タイムステップはアキュムレータ方式
- `loop.ts` は「前回からの経過時間 `frameMs` を受け取り、実行すべき更新回数を返す/コールバックを呼ぶ」純粋関数(クラス)として実装する。時刻の取得(`performance.now`)は `main.ts` 側。
- 1 フレームの経過時間は上限(例: 250ms)でクランプし、更新回数の暴走を防ぐ(spec: 長い停止からの復帰)。
- 更新は常に `dt = 1/60` 秒。描画は補間なしで最新状態を描く(今回は補間は行わない)。
- 代替: 可変 dt で更新する案は、ジャンプ高さが環境のフレームレートで変わるため却下。

### 3. 物理: 半陰的オイラー法、単位は px と秒
- 各更新で `vy += g * dt; y += vy * dt;`、水平は入力に応じた一定速度(加減速なし)。
- 初期の定数案(`config.ts` に集約し、後で調整可能): 重力 2000 px/s²、ジャンプ初速 -750 px/s、移動速度 280 px/s。
- 地面は y 一定の平面とし、`y + height >= groundY` で着地して `vy = 0`、`onGround = true`。
- ジャンプは「入力が押されている かつ onGround」で発動(押しっぱなしで着地後に再ジャンプ可)。
- 代替: 加減速つきの水平移動は操作感は良いが、現時点では仕様にないため見送る。

### 4. カメラ: プレイヤー中心 + ワールド範囲でクランプ
- `cameraX = clamp(playerCenterX - viewWidth/2, 0, max(0, worldWidth - viewWidth))`。
- ワールド座標からの描画は `screenX = worldX - cameraX`。垂直方向のスクロールは行わない(ジャンプで画面外に出ない高さに論理解像度を設定する)。
- 追従はスナップ(補間なし)。滑らかな追従はゲーム感の調整として後続の変更で扱う。

### 5. 描画: 論理解像度固定の Canvas 2D
- 論理解像度は 960×540 とする。CSS で縮小表示し、`devicePixelRatio` に応じて内部バッファを拡大して滲みを防ぐ。
- ワールド幅は 3840px(画面の 4 倍)。地面は単色の長方形に、スクロールが視認できるよう一定間隔の縦線(目印)を描く。
- 地面の見た目の目印は spec の「地面の模様が流れる」シナリオを目視確認するためのもの。

### 6. 入力: `key` ではなく `code` を使う
- `event.code`(`ArrowLeft`/`ArrowRight`/`KeyA`/`KeyD`/`Space`)で判定し、キー配列や IME の影響を受けにくくする。
- 押下状態を集合で保持し、各更新の開始時に `InputState` へ変換する(spec: 現在の入力状態を参照)。
- `Space` と矢印キーはページスクロールを起こすため `preventDefault` する。ウィンドウがフォーカスを失ったときは全キーを解除して「押しっぱなし」を防ぐ。

### 7. ツールチェーン
- Vite(`vanilla-ts` 相当の構成)、TypeScript strict、Vitest(`environment: node`)、npm。
- 実行時依存はなし。`npm run dev` / `build` / `test` を用意する。

## Risks / Trade-offs

- [Phaser でなく Canvas を選んだことで、後続でアニメーション・衝突・シーン管理を自作する負担が増える] → 学習目的であることを踏まえ許容。`core` と `platform` を分けているので、将来 Phaser へ移す場合も `core` を再利用できる。
- [設定済みの `config.yaml` 文脈(Phaser 3)と食い違う] → 本変更のレビュー時に `config.yaml` を更新するか判断する。後続の proposal が誤って Phaser 前提で書かれるのを避けるため、早めに更新するのが望ましい。
- [補間なしの描画は、60Hz 以外のディスプレイで微小なカクつきが出る可能性がある] → 現段階では許容。必要になったら描画補間を追加する。
- [物理定数が体感に合わない] → 定数を `config.ts` に集約し、手動プレイで調整する。

## Open Questions

- 画面の論理解像度・ワールド幅・物理定数の最終値は、実際に動かして調整する(spec には影響しない)。
