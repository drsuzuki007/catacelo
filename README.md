# Catacelo リモート対人戦

Catacelo は、通常のオセロに**駒移動**を加えた2人対戦ゲームです。このリモート対人戦版は、AI思考処理を除去し、Supabase の匿名認証、Realtime、PostgreSQL RPCで2人の着手を同期します。

## データ配置とアクセス制御

ゲーム用データは共用Supabaseプロジェクト内の専用スキーマ **`catacelo`** にだけ作成します。アプリケーションはすべて `supabase.schema('catacelo')` 経由で `games`・`moves`・RPCを参照し、Realtime購読も `schema: 'catacelo'` を指定します。これにより、同一プロジェクトの他アプリの `public` テーブルと混在しません。

| 項目 | 実装 |
|---|---|
| テーブル | `catacelo.games`、`catacelo.moves` |
| Realtime | `catacelo.games` の UPDATE と `catacelo.moves` の INSERTを購読 |
| 認証 | メール不要の匿名認証 |
| 着手検証 | `catacelo.submit_move` が参加者・手番・連番・指し手形式を検証 |
| アクセス制御 | RLSで参加者のみ読み取り可能にし、状態更新をRPCへ集約 |

> 匿名サインインはメールアドレスを収集せずに認証済みユーザーとして動作しますが、ブラウザデータの消去後は同じ匿名IDには戻れません。[1]

## Supabase の初期設定

Supabase Dashboardで新規または既存のプロジェクトを開き、Authenticationの **Anonymous Sign-Ins** を有効にします。次に **Settings → API → Exposed schemas** へ `catacelo` を追加してください。この設定を行わない場合、ブラウザの `supabase.schema('catacelo')` からテーブルやRPCへアクセスできません。

その後、SQL Editorで **`supabase/catacelo_remote_battle.sql` の内容全体を一度だけ実行**します。この1ファイルには、スキーマ作成、テーブル、`GRANT`、RLS、Realtime publication、ルーム参加・ランダム対戦・投了・再戦・タイムアウト・`catacelo.submit_move` の各RPCを含みます。

RealtimeでPostgresの更新をクライアントに配信するには、対象テーブルを `supabase_realtime` publicationへ追加する必要があります。本SQLはその設定も含みます。[2]

## 接続値の設定

Supabase Dashboardの **Project Settings → API** から、公開URLと publishable key（または legacy anon key）を取得します。`service_role` キーは絶対にクライアントへ設定しません。

| 環境変数 | 設定値 |
|---|---|
| `VITE_SUPABASE_URL` | `https://＜project-ref＞.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_...` または anon key |

ローカルではプロジェクト直下の `.env` に設定します。Cloudflare Pagesでは **Settings → Environment variables** に、同じ2つの値をProductionとPreviewの両方へ設定します。Cloudflare Pagesはビルド時の環境変数を設定できます。[3]

```bash
VITE_SUPABASE_URL=https://example.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxx
```

## Cloudflare Pages への配置

本プロジェクトをGitリポジトリへ追加し、Cloudflare Pagesでリポジトリを接続します。Build commandは `pnpm build`、Build output directoryは **`dist/public`** を指定してください。本プロジェクトのVite設定では出力先を `dist/public` に明示しています。デプロイURLを確認したら、SupabaseのAuthentication URL ConfigurationでそのURLを許可URLへ追加します。

Cloudflare Pagesの一般的なVite設定は `npm run build` と `dist` ですが、本プロジェクトではテンプレート設定に合わせて `dist/public` を使います。[3]

## ブラウザ2窓での動作確認

別々の匿名ユーザーを作るため、通常ウィンドウとシークレットウィンドウなど、異なるブラウザプロファイルでアプリを2窓開きます。窓Aでニックネームを入力して卓を開き、表示された6桁のルームコードを窓Bに伝えます。窓Bでコードを入力して参加し、黒番から配置・移動・パスを行ってください。相手側の盤面、直前の着手、手番が更新されれば同期は正常です。

その後、`?room=XXXXXX` を含むURLで再読み込みし、局面復元を確認します。Presence表示、投了、再戦、ランダム対戦、そして相手番の着手や同じ手番での連続送信がRPCにより拒否されることも確認してください。

## セキュリティ運用

`catacelo.submit_move` は、参加者であること、手番であること、手数が連番であることをサーバー側で確認します。完全な反転判定は、指示書に従い既存のクライアント盤面ロジックに委ねています。匿名認証を公開運用する場合は、SupabaseのCAPTCHA / Turnstileとレート制限を併用して濫用対策を検討してください。[1]

Cloudflare TurnstileをSupabaseのBot and Abuse Protectionで有効にしています。匿名認証前にTurnstileウィジェットを完了し、発行されたトークンを `signInAnonymously({ options: { captchaToken } })` へ渡します。Cloudflareのウィジェット設定では、本番ホスト名 **`catacelo-btl-qxfrqdcy.manus.space`** を許可してください。ローカル／開発プレビュー用に検証する場合は、そのホスト名もCloudflare側の許可リストへ追加します。[1]

補助的に、`catacelo.create_room` とランダム対戦は**10分間に6回**、ルーム参加は**10分間に12回**、観戦参加は**10分間に20回**までにサーバー側で制限します。直接のテーブル書込みは許可せず、対局開始・参加は必ずRPCを経由します。

対局中または待機中に表示される**観戦リンク**は、`?watch=XXXXXX` 形式です。リンクを開いたユーザーには閲覧専用のRLS権限が記録され、盤面と着手履歴をRealtimeで確認できます。参加者本人は、ヘッダーの**対局帳**から自分が参加した過去50局を閲覧できます。

## 参考資料

[1]: https://supabase.com/docs/guides/auth/auth-anonymous "Supabase Docs — Anonymous Sign-Ins"
[2]: https://supabase.com/docs/guides/realtime/postgres-changes "Supabase Docs — Postgres Changes"
[3]: https://developers.cloudflare.com/pages/configuration/build-configuration/ "Cloudflare Pages Docs — Build configuration"
