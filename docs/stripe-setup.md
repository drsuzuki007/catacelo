# Stripe 課金セットアップ手順（Catacelo）

コイン 50 枚パック ¥1,000（税込）を Stripe Checkout で販売し、Cloudflare Pages Functions と
Supabase でコイン残高を管理する構成の手順書。

## 全体像

```
ブラウザ (catacelo-2pre.html / 3pre.html)
  │  ① 匿名サインイン（Supabase Auth）
  │  ② POST /api/checkout  ← Bearer <access_token>
  ▼
Cloudflare Pages Function  functions/api/checkout.js
  │  ③ トークン検証 → Stripe Checkout セッション作成
  ▼
Stripe Checkout（カード情報は Stripe 側でのみ扱う）
  │  ④ 決済完了
  ▼
Cloudflare Pages Function  functions/api/stripe-webhook.js
  │  ⑤ 署名検証 → catacelo.credit_purchase() で付与（冪等）
  ▼
Supabase  catacelo.coin_lots / coin_ledger
  │  ⑥ ブラウザが get_coin_balance() で残高を取得
```

カード番号がアプリ側のサーバーやコードを通ることは一切ない。付与の判断は Stripe からの
Webhook のみが行い、ブラウザからの申告では残高は増えない。

## 1. Supabase にウォレットを作る

Supabase Dashboard → SQL Editor で **`supabase/008_coin_wallet_stripe.sql` 全体を一度だけ実行**する。

作成されるもの:

| オブジェクト | 役割 |
|---|---|
| `catacelo.coin_lots` | 購入・付与のロット。有効期限（150日）と残数を持つ |
| `catacelo.coin_ledger` | 付与・消費の監査ログ |
| `catacelo.stripe_checkouts` | Stripe セッションの記録（突合用） |
| `catacelo.get_coin_balance()` | 残高照会（期限切れを除外） |
| `catacelo.get_coin_lots()` | 期限別の内訳（失効予告の表示用） |
| `catacelo.spend_coins(amount, reason)` | 期限が近いロットから消費。残高不足なら失敗 |
| `catacelo.grant_starter_bonus(coins)` | 初回ボーナス。1ユーザー1回 |
| `catacelo.credit_purchase(...)` | **service_role 専用**。Webhook からの付与。`stripe_session_id` で冪等 |

適用後、**Settings → API → Exposed schemas** に `catacelo` が入っていること、
新しいテーブルと関数が Data API に公開されていることを確認する。

## 2. Stripe 側の設定（テストモード）

1. Stripe ダッシュボード右上のトグルを **テストモード** にする
2. **商品カタログ → 商品を追加**
   - 商品名: `Catacelo コイン 50枚パック`
   - 価格: **1,000 JPY**、**一回限り**（サブスクリプションではない）
   - 作成後に表示される **価格ID（`price_...`）** を控える
3. **開発者 → APIキー** から **シークレットキー（`sk_test_...`）** を控える
4. **開発者 → Webhook → エンドポイントを追加**
   - URL: `https://catacelo.com/api/stripe-webhook`
     （ドメイン移行前に試すなら `https://catacelo.pages.dev/api/stripe-webhook`）
   - 送信イベント: **`checkout.session.completed`** のみ
   - 作成後の **署名シークレット（`whsec_...`）** を控える

## 3. Cloudflare Pages に環境変数を設定

Cloudflare ダッシュボード → Workers & Pages → **catacelo** → 設定 → **変数とシークレット**。
本番（Production）とプレビュー（Preview）の両方に設定する。

| 変数名 | 種別 | 値 |
|---|---|---|
| `STRIPE_SECRET_KEY` | **シークレット** | `sk_test_...`（本番移行時に `sk_live_...`） |
| `STRIPE_PRICE_ID` | テキスト | `price_...` |
| `STRIPE_WEBHOOK_SECRET` | **シークレット** | `whsec_...` |
| `SUPABASE_URL` | テキスト | `https://kxdwcnzxrujsagljbvqe.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **シークレット** | Supabase の service_role キー |

> `SUPABASE_SERVICE_ROLE_KEY` は RLS を無視できる全権キー。**必ず「シークレット」種別**で登録し、
> クライアント側のコードや `VITE_` 接頭辞の変数には絶対に入れない。

設定後、**再デプロイして初めて反映される**（Pages → デプロイ → 最新デプロイを再試行）。

## 4. テスト決済の確認

1. `https://catacelo.pages.dev/catacelo-2pre.html` を開く
2. コインショップ → 購入 → Stripe Checkout へ遷移
3. テストカード **`4242 4242 4242 4242`**、有効期限は将来の任意の日付、CVC は任意の3桁
4. 決済完了後にゲーム画面へ戻り、残高が **+50** になることを確認
5. Stripe ダッシュボード → 開発者 → Webhook でイベントが **200** で処理されたことを確認
6. Supabase で `select * from catacelo.coin_lots order by created_at desc limit 5;` を確認

### 二重付与が起きないことの確認

Stripe の Webhook 画面から同じイベントを「再送信」しても、`stripe_session_id` の一意制約により
コインは増えない。これは必ず確認しておく。

## 5. 本番モードへの切り替え

1. Stripe の本人確認・審査を完了させる
2. 本番モードで商品・価格・Webhook エンドポイントを**作り直す**（テストと本番でIDは別物）
3. Cloudflare の環境変数を `sk_live_...` / 本番の `price_...` / 本番の `whsec_...` に差し替える
4. 再デプロイ
5. 実カードで少額のテスト購入を行い、Stripe 側で返金する

## 未解決の論点（本番前に判断が必要）

### 匿名認証と購入済みコインの喪失

現在の認証は Supabase の**匿名サインイン**で、コインの持ち主はブラウザに保存された
リフレッシュトークンだけで決まる。ブラウザのデータを消す、別の端末を使う、
シークレットウィンドウを使う——いずれの場合も**購入済みコインへ戻れなくなる**。

有償のコインでこれが起きると返金・苦情の原因になるため、本番前に次のいずれかが必要:

- **推奨**: 購入時にメールアドレスでのログイン（Supabase の Magic Link）を必須にし、
  匿名アカウントを `updateUser({ email })` でそのアカウントへ昇格させる。
  匿名時代の残高がそのまま引き継がれる
- 代替: 購入直後に「復元コード」を発行して控えてもらう（利便性は落ちる）

### 前払式支払手段としての扱い

コインは資金決済法上の前払式支払手段に当たりうる。有効期限を発行から6か月以内
（現在の設計は150日）にすることで届出・供託の対象外とする整理が一般的だが、
**発行残高の規模によって義務が変わる**ため、実際の運用開始前に専門家へ確認すること。
私は弁護士ではないため、この点は法的助言ではない。

### 表示の整合性

`terms.html` と `tokushoho.html` は既に「Stripe利用」「50コイン/1,000円」「有効期限150日」を
記載している。実装の数値（`008_coin_wallet_stripe.sql` の `interval '150 days'`、
`functions/api/checkout.js` の `COINS_PER_PACK`）と**必ず一致させ続ける**こと。
