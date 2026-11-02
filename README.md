# GeorgeReader

九条丈二の記事リンクを自動収集するPWA（v0.4）。iPhone Safariでホーム画面に追加できます。本文の転載はせず、各媒体の公式ページで開きます。

GitHub Pages: Settings → Pages → Deploy from a branch → main / (root)。

## 自動更新

`Collect articles` Actionsが6時間ごと（日本時間 00:17 / 06:17 / 12:17 / 18:17 頃、GitHub側の遅延あり）に実行されます。Actions画面から手動実行もできます。標準Pythonのみを使用し、外部サービス登録・秘密鍵は不要です。

- アゴラ：九条丈二の著者ページ。記事カード内の著者リンクも照合します。
- note：`g_kujo_ir` の公開RSS。
- Yahoo!ニュース：公開検索の候補から記事の構造化データで著者名を照合します。検索や掲載期限、取得制限により全記事を網羅するものではありません。

`data/articles.json` にタイトル・URL・公開日、媒体別の取得状況と最終成功時刻を保存します。本文は保存しません。同一URLを統合し、新しい順で表示します。転載は別媒体のリンクとして残します。RSSや著者一覧に出なくなった過去記事は保持しますが、初回から全履歴を取得する機能はありません。

一部媒体の取得失敗時も保存済みの記事を維持し、アプリに媒体ごとの取得状況を表示します。全媒体失敗時はActionsを失敗にし、診断用JSONを成果物に残します。

main上でのみJSONをコミットし、既存のブランチ方式のPagesビルドを明示的に要求します（ActionsによるコミットだけではPages更新が始まらないため）。公式サイトのリポジトリ・DNS・CNAME・Pages設定は変更しません。

## PWAと端末データ

起動時・再表示時・「一覧を更新」でJSONを取得します。通信できない時はService Workerのキャッシュを使用します。v0.3の保存キーを維持し、既読・お気に入り・手動登録を引き継ぎます。自動収集した記事を削除すると、その端末では以後非表示になります。JSONバックアップと復元も利用できます。

## 検証

```sh
python -m unittest discover -s tests
node --test tests/app.test.cjs
python scripts/collect.py
```
