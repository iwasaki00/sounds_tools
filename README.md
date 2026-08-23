# sounds_tools

ブラウザで動作するサウンド関連ツール集です。

## 収録ツール

- `020_sound-sampler` — 効果音を再生できるサウンドサンプラー
- `023_wav_sequencer` — WAV素材を組み合わせるシーケンサー

## ローカルでの実行

リポジトリ直下で静的HTTPサーバーを起動し、各ツールの `index.html` を開きます。

```powershell
py -3 -m http.server 8000
```

- `http://localhost:8000/020_sound-sampler/`
- `http://localhost:8000/023_wav_sequencer/`

## GitHub Pages

GitHubの `Settings > Pages` で `Deploy from a branch` を選び、`main` ブランチの `/ (root)` を公開元に指定します。

