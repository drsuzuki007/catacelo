# GitHub Pages 公開確認

- 確認日時: 2026-09-02
- リポジトリ: `drsuzuki007/catacelo`
- GitHub Pages URL: `https://drsuzuki007.github.io/catacelo/`
- 対戦ページ: `https://drsuzuki007.github.io/catacelo/catacelo-battle.html?lang=ja`

## 確認結果

GitHub Actionsの公開ワークフローは成功し、トップページと `catacelo-battle.html` は既存のManus公開URLとは別のURLで応答した。対戦ページは日本語の `?lang=ja` を反映し、ニックネーム、卓を開く、ルームコード、卓につくの操作を表示した。トップページからCatacelo Battleへのリンクも表示された。

## 配置上の注意

GitHub Pages版は静的ホスティングであるため、Manus OAuthを使う管理画面は対象外とする。ゲームのSupabase公開接続情報はクライアントに設定済みの公開キーを利用する。
