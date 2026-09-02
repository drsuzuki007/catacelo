# 添付Cataceloサイトの統合要件メモ

## 参照した添付ファイル

- `/home/ubuntu/upload/index.html`: フェルトグリーンのトップページ兼遊び方ガイド。STEP 2リンクは `catacelo-battle.html`。
- `/home/ubuntu/upload/catacelo-battle.html`: 既存のSTEP 2案内ページ。外部のテスト版を新規タブで開くリンクを、同一サイト内で動作する対戦ゲームへ置き換える必要がある。
- `/home/ubuntu/upload/catacelostart.html`: STEP 1のAI対戦ページ。`16; トップへ戻る` の固定ボタン、6言語選択、`catacelo_lang`のlocalStorageと`?lang=`のURLパラメータによるリンク連携を含む。
- `/home/ubuntu/upload/catacelo-2pre.html` / `catacelo-3pre.html`: STEP 3 / STEP 4のAI対戦ページ。各ページ間の言語連携と、トップ帰還ボタンを含む。
- `/home/ubuntu/upload/terms.html` / `privacy.html` / `tokushoho.html`: 規約ページ。公開用ディレクトリへそのまま取り込む。

## デザイントークン

```css
--felt-deep: #0E3B22;
--felt: #14522F;
--cell: #1E8C3A;
--wood: #5A3921;
--ivory: #F6F1E3;
--gold: #D9A441;
```

本文書の添付トップは、`Hiragino Kaku Gothic ProN`、`Hiragino Sans`、`Noto Sans JP`、`Yu Gothic`の順でフォントを指定し、フェルトの深緑背景に格子模様を重ねている。

## 添付サイトの言語連携仕様

- 対応言語は `ja`, `en`, `zh`, `ko`, `es`, `fr`。
- `?lang=` を最優先し、次にlocalStorageキー `catacelo_lang` を参照する。
- 利用者が切替ボタンで選んだ言語は `catacelo_lang` へ保存する。
- `index.html`、`catacelostart.html`、`catacelo-battle.html`、`catacelo-2pre.html`、`catacelo-3pre.html`、`terms.html`、`privacy.html`、`tokushoho.html` へのサイト内リンクに `?lang=` を付加する。

## 対戦ページの必須統合仕様

- `catacelo-battle.html` は `Catacelo Battle` をタイトル・h1とし、外部サイトへのリンクを残さない。
- 現行対戦アプリのルーム作成、ランダムマッチ、ルームコード参加、Realtime同期、配置・駒移動、スコア、パス、投了、再戦、Presence、復元、タイムアウト、履歴、通信エラー処理を引き継ぐ。
- 左上に固定の `#catacelo-home-btn` と同じ位置・スタイルのトップ帰還操作を設置する。
- 対局進行中にトップへ戻る操作には確認ダイアログを表示する。
