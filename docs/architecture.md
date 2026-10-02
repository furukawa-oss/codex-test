# Sales Compass システム構成・実装計画

## 1. 推奨構成

```text
Zenken Google Workspace
  └─ Apps Script Web App（ドメイン内限定）
       ├─ Session.getActiveUser() で本人確認
       ├─ AccessControl で許可・ロール確認
       ├─ APIごとに顧客スコープを再検証
       └─ 時間主導トリガー（1時間ごと）
             ├─ 親の顧客台帳 P列（参照のみ）
             ├─ 顧客別 Spreadsheet（参照のみ）
             └─ 非公開データストア Spreadsheet（同期結果／ログ）
```

フロントエンドは Apps Script の HTML Service から配信します。公開 GitHub には UI、スキーマ、ダミーデータのみを置き、顧客名・メールアドレス・Spreadsheet ID・同期結果は置きません。顧客データは Workspace 内の非公開 Spreadsheet に保存し、共有範囲を運用担当者とスクリプト実行者に限定します。

## 2. 認証・認可

| ロール | 閲覧範囲 | 更新 |
| --- | --- | --- |
| `CS` | `ownerEmail` が本人の顧客 | 可 |
| `MANAGER` | `team` が本人の管轄チームと一致する顧客 | 可 |
| `EXECUTIVE` | 全顧客 | 不可（閲覧専用） |

- Web アプリを「アクセスしているユーザーとして実行」「Zenken ドメイン内のユーザーのみ」に設定します。
- `@zenken.co.jp` であることに加え、`AccessControl` シートの `enabled=true` のユーザーだけを許可します。
- ナビゲーションの非表示だけに依存せず、全取得・更新 API で `requireAuthorizedUser_()` と `canViewCustomer_()` を実行します。
- 更新項目は許可リスト方式とし、更新者・日時・対象を `AuditLog` に記録します。

## 3. 同期設計

1. 時間主導トリガーが `syncAllCustomers` を1時間ごとに実行します。
2. 親台帳の P 列から URL / Spreadsheet ID を抽出します。
3. 顧客別ファイルの `サマリー` シートを読み取ります。元ファイルに対する書き込み API は使用しません。
4. スナップショットを専用データストアへ追記します。
5. 完了または例外を `SyncLog` に記録し、最終更新日時・状態・エラー文を管理します。
6. `LockService` で同期の多重起動を防ぎます。エラーは次の顧客が分かる情報を内部ログに残し、画面には機密情報を含まない要約のみ表示します。

## 4. 必要な Google 側の設定

1. **Cloud プロジェクト**: 組織所有の標準 Google Cloud プロジェクトを作り、Apps Script と関連付ける。
2. **OAuth 同意画面**: User type を Internal に設定し、アプリ名・管理者連絡先を登録する。最小限の Spreadsheet スコープだけを承認する。
3. **Apps Script**: `gas/Code.gs` を登録し、スクリプトプロパティ `CUSTOMER_LEDGER_SPREADSHEET_ID` と `DATASTORE_SPREADSHEET_ID` を設定する。IDをソースコードへ直接記載しない。
4. **Web アプリ**: 実行ユーザーを「ウェブアプリにアクセスしているユーザー」、アクセス対象を組織内に限定する。管理コンソールの API 制御でアプリを信頼済みにする。
5. **共有設定**: 親台帳・顧客別ファイルは同期対象者に閲覧権限、データストアは運用担当者だけに編集権限を付与する。リンクを知る全員への共有を禁止する。
6. **トリガー**: 運用サービスアカウント相当の専用 Workspace ユーザーで `syncAllCustomers` の時間主導トリガーを1時間ごとに作成する。失敗通知先を運用グループにする。
7. **保持・監査**: Vault、DLP、ログ保持、端末・コンテキストアウェアアクセス、外部共有禁止など既存の Workspace 管理ポリシーを適用する。

データストアには `AccessControl(email, role, team, enabled)`、`Customers(customerId, ownerEmail, team, status, nextAction, note)`、`RawSnapshots`、`SyncLog(timestamp, status, message)`、`AuditLog(timestamp, actor, action, target)` の各シートを用意します。

## 5. 実装・リリース計画

1. **設計・検証**: データ項目、担当者・管轄の正本、保持期間、インシデント対応を情報システム部門と確定。
2. **認証・認可**: ダミーデータでログイン、許可リスト、3ロール、取得・更新拒否、監査ログを自動テスト。
3. **同期**: コピーした検証用 Spreadsheet で正常系、URL不正、権限不足、シート欠落、多重起動を試験。
4. **UI**: ダミーデータでダッシュボード、顧客一覧、タスク、同期状態を接続。
5. **セキュリティレビュー**: Workspace 管理者が OAuth スコープ、共有、ログ、権限境界、データ保持を確認。
6. **段階公開**: 認証・認可の承認後に限定テストユーザーへ公開し、監査後に対象を拡大。承認前は実顧客情報を使用せず、Web 公開もしない。

## 6. リリース判定チェック

- 未許可ユーザー、別担当CS、別管轄管理職、上層部の更新がすべてサーバー側で拒否される。
- Apps Script デプロイが組織内限定で、Git・HTML・ログに顧客情報や Spreadsheet ID がない。
- 元 Spreadsheet に変更が生じないことを監査ログと差分で確認できる。
- 同期の成功日時、エラー、通知が運用者から確認できる。
- 障害時のトリガー停止、権限剥奪、データ削除、問い合わせ先が手順化されている。
