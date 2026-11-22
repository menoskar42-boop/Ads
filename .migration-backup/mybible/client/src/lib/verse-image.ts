const WIDTH = 1080;
const HEIGHT = 1080;
const PADDING = 80;
const FONT_FAMILY = "'Amiri', 'Noto Naskh Arabic', serif";

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}

function getThemeColors() {
  const dark = isDarkMode();
  return {
    bg: dark ? '#1a6fa0' : '#b5e2f7',
    bgGradientEnd: dark ? '#2a8fc8' : '#8fd4f0',
    text: dark ? '#ffffff' : '#1a1a2e',
    primary: dark ? '#bf3f5a' : '#8b2a3a',
    subtle: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.25)',
    gridLine: dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.15)',
    quoteColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.30)',
    refColor: dark ? '#f0c060' : '#8b6b3d',
    footerColor: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
    urlColor: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
  };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function createVerseCanvas(verseText: string, reference: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const colors = getThemeColors();

  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  grad.addColorStop(0, colors.bg);
  grad.addColorStop(1, colors.bgGradientEnd);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = colors.gridLine;
  ctx.lineWidth = 1;
  for (let i = 0; i < WIDTH; i += 60) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, HEIGHT);
    ctx.stroke();
  }
  for (let i = 0; i < HEIGHT; i += 60) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(WIDTH, i);
    ctx.stroke();
  }

  ctx.fillStyle = colors.subtle;
  ctx.beginPath();
  ctx.arc(WIDTH * 0.8, HEIGHT * 0.2, 200, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(WIDTH * 0.2, HEIGHT * 0.8, 150, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.direction = 'rtl';

  ctx.font = `120px ${FONT_FAMILY}`;
  ctx.fillStyle = colors.quoteColor;
  ctx.fillText('❝', WIDTH / 2 + 300, 180);
  ctx.fillText('❞', WIDTH / 2 - 300, HEIGHT - 220);

  const maxTextWidth = WIDTH - PADDING * 2;

  ctx.font = `bold 66px ${FONT_FAMILY}`;
  ctx.fillStyle = colors.text;
  const lines = wrapText(ctx, verseText, maxTextWidth);

  const lineHeight = 104;
  const totalTextHeight = lines.length * lineHeight;
  const startY = (HEIGHT - totalTextHeight) / 2 - 20;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], WIDTH / 2, startY + i * lineHeight);
  }

  const refY = startY + totalTextHeight + 50;
  ctx.font = `44px ${FONT_FAMILY}`;
  ctx.fillStyle = colors.refColor;
  ctx.fillText(`─── ${reference} ───`, WIDTH / 2, refY);

  ctx.font = `22px ${FONT_FAMILY}`;
  ctx.fillStyle = colors.footerColor;
  ctx.fillText('الكتاب المقدس رفيقي', WIDTH / 2, HEIGHT - 80);
  ctx.font = `18px sans-serif`;
  ctx.fillStyle = colors.urlColor;
  ctx.fillText('mybible.oscardevs.com', WIDTH / 2, HEIGHT - 50);

  return canvas;
}

export async function downloadVerseImage(verseText: string, reference: string): Promise<void> {
  const canvas = createVerseCanvas(verseText, reference);
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `آية-اليوم-${reference.replace(/[:\s]/g, '-')}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function shareVerseImage(verseText: string, reference: string): Promise<boolean> {
  const canvas = createVerseCanvas(verseText, reference);

  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(false);
        return;
      }

      const file = new File([blob], `آية-اليوم.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: 'آية اليوم من الكتاب المقدس',
            text: `${verseText} - ${reference}\n\nhttps://mybible.oscardevs.com`,
            files: [file],
          });
          resolve(true);
          return;
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            resolve(true);
            return;
          }
        }
      }

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `آية-اليوم-${reference.replace(/[:\s]/g, '-')}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      resolve(false);
    }, 'image/png');
  });
}
