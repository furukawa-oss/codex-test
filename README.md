# Sales Compass

Zenken 社内向け営業支援ダッシュボードの UI プロトタイプと Google Apps Script バックエンド設計です。画面に表示している会社名・数値はすべてダミーです。

## ローカル確認

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開いてください。

## 構成

- `index.html` / `styles.css` / `app.js`: レスポンシブなダッシュボード UI
- `gas/Code.gs`: Workspace 認証、ロール別データ制御、時間同期のサーバー実装例
- `docs/architecture.md`: システム構成、Google 側の設定、段階的な実装・公開計画

> **重要:** 認証・認可のテストと社内セキュリティレビューが完了するまで、実際の顧客情報を利用したデプロイや Web 公開を行わないでください。
