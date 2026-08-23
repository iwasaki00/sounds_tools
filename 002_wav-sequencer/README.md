# SFX Sequencer Tool

このフォルダーだけで、作成済みWAVを使ったシーケンサーツールを管理できます。

## 構成

- `index.html`: シーケンサー本体
- `app.js`: 再生、ジャンル切り替え、ランダム、セーブ／ロード処理
- `genre-data.js`: Originalと10ジャンルの楽器・BPM・初期パターン定義
- `generate_genre_sfx.py`: ジャンル用WAVの生成スクリプト
- `assets/sfx/*.wav`: シーケンサーで使うWAV素材
- `assets/theme/*.png`: 見た目テーマ用の背景画像

## ジャンル

- Original
- Techno
- House
- Eurobeat
- Drum'n'Bass
- Trance
- Big Beat
- Breakbeats
- Hip Hop
- World Groove
- Jazz

Original以外は、`DRUMS`、`BASS`、`SYNTH`、`FX`などのバンクを切り替えて編集します。
表示していないバンクも再生対象です。

## 操作画面

タイトルは非表示にして編集領域を確保し、セーブ、ロード、デザイン切り替えは設定画面に集約しています。
上段の一括操作は`ランダム`／`クリア`、各トラックの操作は`RND`／`CLR`と表示します。
iPhoneでは縦向き・横向きのどちらも、各トラックの16ステップを横1列に収め、
ステップ列の横スクロールなしで操作できます。

## WAVの再生成

外部素材を使わず、Python標準ライブラリだけでジャンル用WAVを再生成できます。

```powershell
cd C:\_wk\github\sounds_tools\002_wav-sequencer
py -3 generate_genre_sfx.py
```

生成されるWAVは44.1kHz、16bit、モノラル、0.1～1.0秒で、ピーク音量を0.38に正規化しています。

## 確認方法

このフォルダーをHTTPサーバーで開いてください。

```powershell
cd C:\_wk\github\sounds_tools\002_wav-sequencer
py -3 -m http.server 8000
```

ブラウザで開くURL:

```text
http://127.0.0.1:8000/
```

iPhoneで確認する場合は、PCと同じWi-Fiに接続し、iPhoneのSafariで
`http://<PCのIPv4アドレス>:8000/` を開いてください。縦向きと横向きの両方で、
表示、タップ操作、音声再生を実機確認してください。
操作画面はダブルタップ拡大を抑止しつつ、ピンチズームは利用できます。

編集内容は自動保存され、次回起動時に自動復元されます。`セーブ`ボタンでも明示的に保存できます。
セーブデータはジャンル、バンク、BPM、音色、音量、全トラックのステップを保存します。
以前のセーブデータはOriginalとしてロードされます。
保存先はブラウザのローカルストレージで、端末、ブラウザ、オリジン
（プロトコル、ホスト、ポート）ごとに分かれます。
