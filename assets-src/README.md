# 素材の元データ

このフォルダのファイルは、**ゲームには配信されません**(`public/` の外にあります)。ゲームで使う素材は、ここから作って `public/assets/` に置きます。

| ファイル | 内容 |
|---|---|
| `player-sheet-source.jpeg` | プレイヤーのスプライトシートの元画像(1376×768 の JPEG。32 ビット風。待機・歩く・走る・ジャンプ・着地・被弾・やられの約 40 コマ) |

## プレイヤーのスプライトシートの作り方

元画像は、透明ではなく、背景の市松模様が画像に焼き込まれています。次のツールで、背景を透明にして、コマを切り出し、`public/assets/playersheet.png` と `public/assets/playersheet.json` を作ります。

```sh
# Chrome と puppeteer-core が必要です(プロジェクトの依存関係には入っていません)
npm i --no-save puppeteer-core
node tools/build-player-sheet.mjs
```

詳しい手順と、確認用のプレビューの出し方は、`tools/build-player-sheet.mjs` の先頭のコメントを見てください。

## 権利について

画像の権利(著作権・ライセンス)は、利用者が確認してください。このリポジトリは公開されるので、使ってよい画像だけを置いてください。
