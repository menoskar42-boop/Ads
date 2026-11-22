import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { puzzleImages, randomPuzzleImage, type PuzzleImage } from '@/lib/kids-puzzle-data';

type Level = '3x3' | '4x4';

interface Edges {
  h: boolean[][];  // h[r][c]: tab points down from row r to r+1
  v: boolean[][];  // v[r][c]: tab points right from col c to c+1
}

function generateEdges(n: number): Edges {
  return {
    h: Array.from({ length: n - 1 }, () => Array.from({ length: n }, () => Math.random() > 0.5)),
    v: Array.from({ length: n }, () => Array.from({ length: n - 1 }, () => Math.random() > 0.5)),
  };
}

function hSeg(fromX: number, toX: number, y: number, tabDir: number, cs: number): string {
  // going right (fromX < toX) or left (fromX > toX)
  const going = toX > fromX ? 1 : -1;
  const mid = (fromX + toX) / 2;
  const bw = cs * 0.18;
  const T = cs * 0.25 * tabDir;
  return (
    ` L ${mid - going * bw},${y}` +
    ` Q ${mid - going * bw},${y + T} ${mid},${y + T}` +
    ` Q ${mid + going * bw},${y + T} ${mid + going * bw},${y}` +
    ` L ${toX},${y}`
  );
}

function vSeg(fromY: number, toY: number, x: number, tabDir: number, cs: number): string {
  const going = toY > fromY ? 1 : -1;
  const mid = (fromY + toY) / 2;
  const bw = cs * 0.18;
  const T = cs * 0.25 * tabDir;
  return (
    ` L ${x},${mid - going * bw}` +
    ` Q ${x + T},${mid - going * bw} ${x + T},${mid}` +
    ` Q ${x + T},${mid + going * bw} ${x},${mid + going * bw}` +
    ` L ${x},${toY}`
  );
}

function jigsawPath(row: number, col: number, n: number, cs: number, edges: Edges): string {
  // coordinates relative to piece top-left (0,0); tabs may go negative or beyond cs
  let d = `M 0,0`;

  // top edge (left→right)
  if (row === 0) {
    d += ` L ${cs},0`;
  } else {
    const tabDown = edges.h[row - 1][col]; // true = piece above has tab down = this piece has blank (indent up)
    d += hSeg(0, cs, 0, tabDown ? 1 : -1, cs); // indent = +y = downward into piece
  }

  // right edge (top→bottom)
  if (col === n - 1) {
    d += ` L ${cs},${cs}`;
  } else {
    const tabRight = edges.v[row][col]; // true = tab extends right
    d += vSeg(0, cs, cs, tabRight ? 1 : -1, cs);
  }

  // bottom edge (right→left)
  if (row === n - 1) {
    d += ` L 0,${cs}`;
  } else {
    const tabDown = edges.h[row][col]; // true = tab extends down
    // نفس اتجاه النتوء المستخدم في الحافة العلوية للقطعة السفلية → تطابق الحد المشترك
    d += hSeg(cs, 0, cs, tabDown ? 1 : -1, cs);
  }

  // left edge (bottom→top)
  if (col === 0) {
    d += ` L 0,0`;
  } else {
    const tabRight = edges.v[row][col - 1]; // true = piece to left has tab right = this piece has blank
    // نفس اتجاه النتوء المستخدم في الحافة اليمنى للقطعة المجاورة → تطابق الحد المشترك
    d += vSeg(cs, 0, 0, tabRight ? 1 : -1, cs);
  }

  return d + ' Z';
}

interface JigsawGame {
  image: PuzzleImage;
  level: Level;
  edges: Edges;
  tray: number[];
  placed: Set<number>;
  uid: number;
}

function PieceSVG({
  row, col, n, cs, T, edges, thumbUrl, uid, small,
}: {
  row: number; col: number; n: number; cs: number; T: number;
  edges: Edges; thumbUrl: string; uid: number; small?: boolean;
}) {
  const id = `jig-${uid}-${row}-${col}`;
  const pad = T;
  const svgSize = cs + 2 * pad;
  const scale = small ? 0.65 : 1;
  const path = jigsawPath(row, col, n, cs, edges);

  return (
    <svg
      width={svgSize * scale}
      height={svgSize * scale}
      viewBox={`${-pad} ${-pad} ${svgSize} ${svgSize}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <clipPath id={id}>
          <path d={path} />
        </clipPath>
        <filter id={`shadow-${id}`}>
          <feDropShadow dx="1" dy="1" stdDeviation="2" floodOpacity="0.4" />
        </filter>
      </defs>
      <image
        href={thumbUrl}
        x={-col * cs}
        y={-row * cs}
        width={n * cs}
        height={n * cs}
        clipPath={`url(#${id})`}
        filter={`url(#shadow-${id})`}
      />
      <path
        d={path}
        fill="none"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="1.5"
        clipPath={`url(#${id})`}
      />
    </svg>
  );
}

export default function KidsJigsawPuzzle() {
  const [game, setGame] = useState<JigsawGame | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const startGame = useCallback((level: Level) => {
    const n = level === '3x3' ? 3 : 4;
    const total = n * n;
    const all = Array.from({ length: total }, (_, i) => i);
    // Fisher-Yates shuffle tray
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    setGame({
      image: randomPuzzleImage(),
      level,
      edges: generateEdges(n),
      tray: all,
      placed: new Set(),
      uid: Date.now(),
    });
    setDragPos(null);
    dragRef.current = null;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent, pieceId: number) => {
    if (!game) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = {
      id: pieceId,
      ox: e.clientX - rect.left,
      oy: e.clientY - rect.top,
    };
    setDragPos({ x: e.clientX, y: e.clientY });
  }, [game]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setDragPos({ x: e.clientX, y: e.clientY });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragPos(null);
    if (!d || !game || !boardRef.current) return;

    const n = game.level === '3x3' ? 3 : 4;
    const boardRect = boardRef.current.getBoundingClientRect();
    const cs = boardRect.width / n;

    const dropX = e.clientX - boardRect.left;
    const dropY = e.clientY - boardRect.top;

    const col = Math.floor(dropX / cs);
    const row = Math.floor(dropY / cs);

    if (row < 0 || row >= n || col < 0 || col >= n) return;

    const targetId = row * n + col;
    if (d.id !== targetId) return; // wrong slot
    if (game.placed.has(targetId)) return; // already filled

    setGame(g => {
      if (!g) return g;
      const newPlaced = new Set(g.placed);
      newPlaced.add(targetId);
      const newTray = g.tray.filter(id => id !== targetId);
      return { ...g, placed: newPlaced, tray: newTray };
    });
  }, [game]);

  // ── شاشة البداية ──────────────────────────────────────────────────
  if (!game) {
    return (
      <Card className="p-6 text-center">
        <div className="text-5xl mb-3">🧩</div>
        <h3 className="text-xl font-bold mb-1">لغز التجميع</h3>
        <p className="text-muted-foreground mb-6 text-sm">
          رتّب قطع البازل لتكتشف صورة من قصص الكتاب المقدس
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => startGame('3x3')} className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2">
            😊 سهل — ٣×٣
          </Button>
          <Button onClick={() => startGame('4x4')} className="bg-violet-500 hover:bg-violet-600 text-white gap-2">
            🔥 صعب — ٤×٤
          </Button>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          {puzzleImages.map(img => (
            <img
              key={img.id}
              src={`https://img.youtube.com/vi/${img.youtubeId}/default.jpg`}
              alt={img.title}
              title={img.title}
              className="w-12 h-9 rounded object-cover opacity-60 hover:opacity-100 transition-opacity"
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">تُختار الصورة عشوائياً في كل لعبة</p>
      </Card>
    );
  }

  const n = game.level === '3x3' ? 3 : 4;
  const total = n * n;
  const thumbUrl = `https://img.youtube.com/vi/${game.image.youtubeId}/hqdefault.jpg`;
  const BOARD_SIZE = Math.min(300, typeof window !== 'undefined' ? window.innerWidth * 0.88 : 300);
  const cs = BOARD_SIZE / n;
  const T = cs * 0.25;
  const won = game.placed.size === total;

  const draggingId = dragRef.current?.id ?? null;

  return (
    <Card className="p-4" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      {/* رأس */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧩</span>
          <span className="font-bold text-sm">{game.image.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{game.placed.size}/{total}</span>
          <Button variant="outline" size="sm" onClick={() => setGame(null)} className="text-xs h-7">تغيير المستوى</Button>
          <Button variant="outline" size="sm" onClick={() => startGame(game.level)} className="text-xs h-7">🔀 جديد</Button>
        </div>
      </div>

      {/* شاشة الفوز */}
      {won && (
        <div className="text-center py-6">
          <div className="text-5xl mb-2">🎉</div>
          <h3 className="text-xl font-bold mb-1">أحسنت!</h3>
          <p className="text-muted-foreground mb-4">جمّعت لغز <strong>{game.image.title}</strong></p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => startGame(game.level)} className="bg-emerald-500 hover:bg-emerald-600 text-white">العب مرة أخرى</Button>
            <Button variant="outline" onClick={() => setGame(null)}>تغيير المستوى</Button>
          </div>
        </div>
      )}

      {!won && (
        <div className="flex flex-col items-center gap-3">
          {/* اللوح */}
          <div
            ref={boardRef}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${n}, 1fr)`,
              gap: 0,
              width: BOARD_SIZE,
              height: BOARD_SIZE,
              position: 'relative',
            }}
          >
            {Array.from({ length: total }, (_, id) => {
              const r = Math.floor(id / n);
              const c = id % n;
              const isPlaced = game.placed.has(id);
              return (
                <div
                  key={id}
                  style={{ width: cs, height: cs, position: 'relative', overflow: 'visible' }}
                >
                  {/* ghost slot */}
                  {!isPlaced && (
                    <div style={{
                      position: 'absolute', inset: 1,
                      backgroundImage: `url(${thumbUrl})`,
                      backgroundSize: `${n * 100}% ${n * 100}%`,
                      backgroundPosition: `${c * 100 / (n - 1)}% ${r * 100 / (n - 1)}%`,
                      opacity: 0.12,
                      borderRadius: 2,
                    }} />
                  )}
                  {isPlaced && (
                    <div style={{ position: 'absolute', top: -T, left: -T, pointerEvents: 'none' }}>
                      <PieceSVG
                        row={r} col={c} n={n} cs={cs} T={T}
                        edges={game.edges} thumbUrl={thumbUrl} uid={game.uid}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* الـ Tray */}
          <div className="w-full">
            <p className="text-xs text-muted-foreground mb-2 text-center">اسحب القطع إلى مكانها الصحيح</p>
            <div
              className="flex flex-wrap gap-1 justify-center overflow-y-auto"
              style={{ maxHeight: 200 }}
            >
              {game.tray.map(id => {
                const r = Math.floor(id / n);
                const c = id % n;
                const isDragging = draggingId === id;
                return (
                  <div
                    key={id}
                    style={{
                      cursor: 'grab',
                      opacity: isDragging ? 0.3 : 1,
                      touchAction: 'none',
                      userSelect: 'none',
                    }}
                    onPointerDown={(e) => onPointerDown(e, id)}
                  >
                    <PieceSVG
                      row={r} col={c} n={n} cs={cs} T={T}
                      edges={game.edges} thumbUrl={thumbUrl} uid={game.uid} small
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* القطعة المسحوبة (floating) */}
      {dragPos && dragRef.current && (() => {
        const id = dragRef.current!.id;
        const r = Math.floor(id / n);
        const c = id % n;
        const svgSize = (cs + 2 * T) * 0.65;
        return (
          <div
            style={{
              position: 'fixed',
              left: dragPos.x - svgSize / 2,
              top: dragPos.y - svgSize / 2,
              pointerEvents: 'none',
              zIndex: 9999,
              transform: 'scale(1.1)',
              filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))',
            }}
          >
            <PieceSVG
              row={r} col={c} n={n} cs={cs} T={T}
              edges={game.edges} thumbUrl={thumbUrl} uid={game.uid} small
            />
          </div>
        );
      })()}
    </Card>
  );
}
