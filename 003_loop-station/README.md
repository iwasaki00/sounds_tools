# Live Looper — Phase 1

iPhone Safari上で、マイク入力の録音、即時ループ再生、オーバーダブ、長時間の同期精度を検証するVanilla JavaScript製のライブ・ルーパーです。

## 起動方法

リポジトリ直下で静的HTTPサーバーを起動します。

```powershell
py -3 -m http.server 8000
```

PCでは `http://localhost:8000/003_loop-station/` を開きます。iPhoneから確認する場合はGitHub PagesなどのHTTPS URLを使用してください。

## HTTPSが必要な理由

`getUserMedia()` によるマイク入力はSecure Contextでのみ利用できます。localhostはPC開発用の例外ですが、LAN内のHTTP URLをiPhoneで開いてもマイクは使用できません。

## iPhone Safariでの操作

1. 縦画面でページを開き、「オーディオ開始」をタップします。
2. Safariのマイク使用確認で「許可」を選びます。
3. 大型ボタンの「REC」をタップし、声や楽器を録音します。
4. 初期設定では1小節の「1・2・3・4」カウント後、次の1拍目から自動録音します。
5. 「STOP & LOOP」をタップすると、初期設定のSMARTがSTOP位置に最も近い小節境界を選び、その長さがMaster Loopになって再生が始まります。
6. 再生中に「OVERDUB」をタップすると次の小節頭から追加録音し、「END OVERDUB」で次の小節頭にレイヤーを確定します。

マイクモニターはハウリング防止のため初期値OFFです。イヤホンを使用しない状態でのONには注意してください。

## テンポ・カウントイン

- **BPM**: 40〜200。初期値100 BPMです。−5／−1／+1／+5またはTAP TEMPOで変更できます。
- **拍子**: Phase 1では4/4固定です。画面の4つのビート表示で現在の拍を確認できます。
- **COUNT IN**: OFF／1 BAR／2 BAR。初期値は1 BARです。
- **METRONOME**: OFF／COUNT-IN ONLY／ALWAYS。初期値はクリック音の録音混入を抑えるCOUNT-IN ONLYです。
- **RECORD END**: SMART／NEXT BAR／FREE。初期値はSMARTです。
- **QUANTIZED OVERDUB**: 次の小節頭から開始し、Master Loopの最寄り周回境界で終了します。初期値ONです。

メトロノーム音はWeb Audio APIで生成し、AudioContextの時間軸へ先読み予約します。iPhone本体スピーカーのクリック音を本体マイクが拾う場合があるため、メトロノーム使用時はイヤホンを推奨します。

### RECORD END

- **SMART**: STOP位置が小節前半なら直前の小節境界へ戻し、後半なら現在小節の終端まで録音します。判定閾値は50%です。最低1小節を保証します。
- **NEXT BAR**: STOP後、従来どおり次の小節終端まで録音します。
- **FREE**: 小節補正を行わず、STOP位置をそのままループ終端にします。

SMARTは音量や無音を解析しません。カウントイン終了後の実録音開始時刻とSTOP要求時刻だけから保存小節数を決定し、最終AudioBufferを正確な小節長へトリミングします。

## 操作

- **UNDO**: 最後のオーバーダブだけを削除します。First Loopは削除しません。
- **STOP / PLAY**: 全レイヤーを停止し、同じタイミング基準で再開します。
- **CLEAR**: 確認後、すべてのループデータを削除します。
- **MASTER**: GainNode経由の出力音量を0〜100%で調整します。
- **TEST SOUND**: 現在のBPMで1小節のクリックループを生成し、10周・20周・50周の同期確認に使えます。
- **EXPORT TEST**: 現在の1周分をモノラルWAVとして書き出します。

## タイミング設計

JavaScriptタイマーは約250ms先までのイベントを確認するためだけに使用します。発音時刻は `AudioContext.currentTime` を基準に算出し、各 `AudioBufferSourceNode.start(when)` へ事前予約します。そのため、一時的にUIスレッドが遅延しても、予約済みのループ境界はJavaScriptタイマーの誤差に引っ張られません。

録音はAudioWorkletでPCMを取得します。AudioWorkletを利用できない環境ではScriptProcessorNodeへフォールバックします。オーバーダブはMaster Loopと同じ長さの独立AudioBufferとして保持し、録音開始時のループ内位置へ配置します。

## デバッグ

画面下部のDEBUGを開くと、次の情報を確認できます。

- AudioContext state、sample rate、base/output latency
- マイクのデバイス情報と実際の `getSettings()`
- 要求した音声補正OFFと、Safariが採用した実値
- Master Loop長、周回数、現在位置、録音・再生時刻、先読み時間
- BPM、1拍の秒数、現在の拍・小節、次の予約拍、カウントイン、クオンタイズ待機時刻
- STOP要求時刻、Raw Bar Position、Completed Bars、Bar Progress、SMART判定結果、録音前後のBuffer長
- User Agent、画面サイズ、DPR、visibility state
- 最大150件のイベントログとLOG COPY
- レイテンシーAPI参考値

Safariをバックグラウンドへ移動してAudioContextが停止した場合は警告と「RESUME AUDIO」を表示します。

## iPhone Safari特有の注意点

- マイク権限とAudioContext初期化は必ず「オーディオ開始」のタップを起点にします。
- 画面ロック、別アプリへの切替、着信などでAudioContextが停止することがあります。
- `baseLatency` / `outputLatency`、マイク設定値は機種やSafariの版によって取得できずN/Aになることがあります。
- 内蔵スピーカーでマイクモニターをONにするとハウリングする可能性があります。
- Bluetooth機器は遅延が大きいため、同期精度の評価時は有線または本体マイクを推奨します。

## 既知の制約

- Phase 1は1つのMaster Loopへ複数レイヤーを重ねる検証版です。
- 自動BPM解析、拍・小節への量子化、個別Mute/Solo、エフェクト、保存はありません。
- オーバーダブの開始・終了操作には端末固有の入出力遅延が含まれます。内部配置はオーディオクロック基準ですが、音響的な往復遅延を自動補正するものではありません。
- バックグラウンド再生は保証しません。
- ScriptProcessorフォールバックはAudioWorkletより大きい録音境界誤差が生じる場合があります。

## Phase 2予定

4〜8トラック、トラック別Mute/Solo/Volume、BPM・メトロノーム・Count-in、Loop Assist、Beat/Bar Quantize、Redo、エフェクト、保存と完成音源Export、外部コントローラー対応を予定しています。
