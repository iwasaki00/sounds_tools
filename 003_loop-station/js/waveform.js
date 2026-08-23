export function drawWaveform(canvas, audioBuffer, color = '#b9ff4b') {
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#0c0f13';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#28303a';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();

  if (!audioBuffer) {
    context.fillStyle = '#59636f';
    context.font = '600 18px ui-monospace, monospace';
    context.textAlign = 'center';
    context.fillText('NO LOOP DATA', width / 2, height / 2 + 6);
    return;
  }

  const samples = audioBuffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(samples.length / width));
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  for (let x = 0; x < width; x += 1) {
    let min = 1;
    let max = -1;
    const start = x * blockSize;
    for (let index = start; index < Math.min(start + blockSize, samples.length); index += 1) {
      min = Math.min(min, samples[index]);
      max = Math.max(max, samples[index]);
    }
    context.moveTo(x, (1 + min) * height / 2);
    context.lineTo(x, (1 + max) * height / 2);
  }
  context.stroke();
}
