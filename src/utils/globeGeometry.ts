import type { Arc } from 'cobe'

type Coordinate = [number, number]

/** 同一个球面位置不生成弧线，覆盖同地区、经度 ±180° 及极点等退化情况。 */
export function buildGlobeArcs(origins: readonly Coordinate[], destination: Coordinate | null): Arc[] {
  if (!destination) return []
  const radians = Math.PI / 180
  return origins
    .filter(origin => {
      const latitude = ((origin[0] - destination[0]) * radians) / 2
      const longitude = ((origin[1] - destination[1]) * radians) / 2
      const separation =
        Math.sin(latitude) ** 2 +
        Math.cos(origin[0] * radians) * Math.cos(destination[0] * radians) * Math.sin(longitude) ** 2
      return separation > 1e-12
    })
    .map(from => ({ from, to: destination }))
}
