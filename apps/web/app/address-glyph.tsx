/// A flat 4×4 mark for an address, mirrored left to right, so two saved accounts are easy to tell apart. Each of the
/// eight left-half cells reads one nibble spread across the address: empty, ink-2 or bronze. Decorative only.
export function AddressGlyph({ value, size = 40 }: { value: string; size?: number }) {
  const hex = value.toLowerCase().replace(/^0x/, "").padEnd(40, "0");
  const cells: { x: number; y: number; c: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const n = parseInt(hex[i * 5], 16) % 3;
    if (!n) continue;
    const x = i % 2, y = Math.floor(i / 2), c = n === 1 ? "fill-ink-2" : "fill-bronze";
    cells.push({ x, y, c }, { x: 3 - x, y, c });
  }
  return (
    <svg viewBox="0 0 4 4" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true" className="flex-none border border-rule">
      {cells.map((s) => (
        <rect key={`${s.x}-${s.y}`} x={s.x} y={s.y} width="1" height="1" className={s.c} />
      ))}
    </svg>
  );
}
