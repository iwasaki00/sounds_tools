const games = {
  sampler: {
    number: '001', type: 'SOUND PAD', title: '効果音サンプラー',
    description: 'カラフルなパッドをタップして効果音をすばやく再生。端末内の音声追加や録音、パッドの並べ替え、バックリズムにも対応します。',
    features: ['ワンタップ再生', '音声追加・録音', 'バックリズム'],
    href: './001_sound-sampler/', image: 'assets/icons/sound-sampler.webp',
    imageAlt: '発光する16個のパッドを描いた効果音サンプラーのアイコン'
  },
  sequencer: {
    number: '002', type: 'STEP SEQUENCER', title: 'WAVシーケンサー',
    description: 'WAV音源を16ステップで組み合わせてビートを制作。11種類のジャンルや音色を切り替え、ランダム生成やパターン保存も楽しめます。',
    features: ['16ステップ', '11ジャンル', '自動保存'],
    href: './002_wav-sequencer/', image: 'assets/icons/wav-sequencer.webp',
    imageAlt: '16ステップの音楽グリッドを描いたWAVシーケンサーのアイコン'
  },
  looper: {
    number: '003', type: 'LIVE LOOPER', title: 'ループステーション',
    description: '声や楽器をその場で録音して即ループ。8つの内蔵パッドでも演奏でき、再生を止めずにオーバーダブを重ねられます。',
    features: ['マイク録音', '8パッド', 'オーバーダブ'],
    href: './003_loop-station/', image: 'assets/icons/loop-station.webp',
    imageAlt: '3本の発光する音声リングを描いたループステーションのアイコン'
  }
};

const dialog = document.querySelector('#detailDialog');
const detailImage = document.querySelector('#detailImage');
const detailNumber = document.querySelector('#detailNumber');
const detailType = document.querySelector('#detailType');
const detailTitle = document.querySelector('#detailTitle');
const detailDescription = document.querySelector('#detailDescription');
const detailFeatures = document.querySelector('#detailFeatures');
const detailLaunch = document.querySelector('#detailLaunch');
const dialogClose = document.querySelector('#dialogClose');

function openDetails(gameKey) {
  const game = games[gameKey];
  if (!game) return;
  detailImage.src = game.image;
  detailImage.alt = game.imageAlt;
  detailNumber.textContent = game.number;
  detailType.textContent = game.type;
  detailTitle.textContent = game.title;
  detailDescription.textContent = game.description;
  detailFeatures.replaceChildren(...game.features.map((feature) => {
    const item = document.createElement('li');
    item.textContent = feature;
    return item;
  }));
  detailLaunch.href = game.href;
  if (!dialog.open) dialog.showModal();
}

document.querySelectorAll('.game-tile').forEach((tile) => {
  const link = tile.querySelector('.game-link');
  const detailButton = tile.querySelector('.detail-trigger');
  const gameKey = tile.dataset.game;
  let pressTimer = 0;
  let startX = 0;
  let startY = 0;
  let suppressNextClick = false;

  const cancelPress = () => {
    window.clearTimeout(pressTimer);
    pressTimer = 0;
    link.classList.remove('is-pressing');
  };

  link.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    startX = event.clientX;
    startY = event.clientY;
    link.classList.add('is-pressing');
    pressTimer = window.setTimeout(() => {
      suppressNextClick = true;
      cancelPress();
      navigator.vibrate?.(24);
      openDetails(gameKey);
    }, 560);
  });

  link.addEventListener('pointermove', (event) => {
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 10) cancelPress();
  });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => {
    link.addEventListener(eventName, cancelPress);
  });

  link.addEventListener('click', (event) => {
    if (!suppressNextClick) return;
    event.preventDefault();
    suppressNextClick = false;
  });

  link.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    cancelPress();
    suppressNextClick = true;
    openDetails(gameKey);
  });

  detailButton.addEventListener('click', () => openDetails(gameKey));
});

dialogClose.addEventListener('click', () => dialog.close());

dialog.addEventListener('click', (event) => {
  const bounds = dialog.getBoundingClientRect();
  const inside = event.clientX >= bounds.left && event.clientX <= bounds.right
    && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
  if (!inside) dialog.close();
});
