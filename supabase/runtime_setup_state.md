# Supabase実環境設定の確認記録

- 対象プロジェクト: `kxdwcnzxrujsagljbvqe`（suzukiyoshihiko's Project）。
- 確認画面: `https://supabase.com/dashboard/project/kxdwcnzxrujsagljbvqe/integrations/data_api/settings`
- 単一SQL `supabase/catacelo_remote_battle.sql` はマイグレーションとして適用済み。
- Data APIのExposed schemasは確認時点で `public` と `extensions` の2件であり、`catacelo` は未追加。
- `pg_namespace` を対象にした確認SQLでは `catacelo` スキーマの存在を確認済み。
- Data API設定の候補一覧は作成直後に更新されず、再読み込み後も一時的に読み込み表示となっている。`catacelo` が候補へ現れた時点で追加し、Saveで確定する。

## 適用進行状況

`catacelo` はData APIの候補として表示され、公開対象へ選択済みです。選択後に保存操作を実行し、画面上は「3 of 3 schemas exposed」と表示されています。保存確定後、`catacelo` の2テーブルと5つのRPCを個別にData API公開し、公開キー設定へ進めます。

`catacelo.games`、`catacelo.moves`、`catacelo.claim_timeout_win`、`catacelo.create_rematch`、`catacelo.find_or_create_random_game`、`catacelo.join_room`、`catacelo.submit_move` を公開候補として選択済みです。設定画面には合計7件の未保存変更が表示されており、次にSaveでまとめて確定します。

設定は保存済みで、Data API設定画面は「3 of 3 schemas exposed」「10 of 10 tables exposed」「6 of 6 functions exposed」と表示しています。`catacelo` のスキーマ、2テーブル、5つのゲーム用RPCは公開済みです。

公開URLは `https://kxdwcnzxrujsagljbvqe.supabase.co`、公開用publishable keyはアプリの環境変数優先フォールバックとして設定済みです。AuthenticationのAnonymous Sign-Insも有効化し、保存済みであることを確認しました。

実環境の統合検証では、匿名ユーザー2人を使い、ルーム作成・ルーム参加・`catacelo.games` のRealtime更新受信・投了を含む `submit_move`・`create_rematch`・5分未満の `claim_timeout_win` 拒否をすべて確認しました。最終試験局は `T6EPZD` で、検証は成功しています。

## Turnstile追加の前提

Supabase公式のCAPTCHA設定では、Cloudflare DashboardでTurnstileウィジェットを作成してSitekeyとSecret Keyを取得し、SupabaseのAuthentication → Bot and Abuse ProtectionでTurnstileとSecret Keyを設定します。フロントエンドはSitekeyでウィジェットを表示し、成功時のトークンを`signInAnonymously`へ渡します。[Supabase CAPTCHA Protection](https://supabase.com/docs/guides/auth/auth-captcha)

Cloudflare Dashboardはログイン状態ではなく、Turnstileウィジェット作成には本人によるCloudflareログインが必要です。

## Turnstileを使わない代替保護

Turnstileのキー共有を行わない方針に変更したため、Supabaseの既存DBへ`catacelo.action_events`を追加しました。`create_room`、`join_room`、`find_or_create_random_game`、`join_spectator`はsecurity definer RPC内でユーザー別の操作回数を記録・制限します。直接INSERT / UPDATEは取り消し、対局の開始・参加経路をRPCに集約しています。匿名認証に備わるIP単位のレート制限に加わる補助的な保護ですが、CAPTCHAそのものの代替ではありません。

## Turnstile有効化

Cloudflare TurnstileをCAPTCHAプロバイダーとして選び、提供済みのSecret KeyをSupabase AuthenticationのAttack Protectionへ保存しました。クライアントは提供済みSitekeyでTurnstileを表示し、匿名認証時にCAPTCHAトークンを送信します。Secret Keyはこの記録やソースコードには保存していません。開発プレビューではCloudflareの許可ホスト名外となる場合があるため、本番ホスト名で確認します。

Turnstileの接続障害が匿名認証を停止したため、SupabaseのCAPTCHA保護を一時停止し、クライアントもTurnstile表示を停止しました。`catacelo`のサーバー側レート制限とRPC専用の書込み制御は維持しています。CAPTCHAは、Cloudflare側で接続障害を解消してから再有効化します。
