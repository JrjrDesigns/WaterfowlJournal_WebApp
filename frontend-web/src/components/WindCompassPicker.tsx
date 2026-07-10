import React from 'react'

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export interface WindCompassValue {
  directions: string[]
  center: string | null
}

interface Props {
  value: WindCompassValue
  onChange: (value: WindCompassValue) => void
}

/** Sweet spot = circular mean of the selected directions, snapped to the nearest cardinal.
 *  For a contiguous range this is exactly the geometric middle; for a symmetric/cancelling
 *  selection (e.g. only N+S) the mean is undefined, so fall back to whichever is first. */
function computeCenter(directions: string[]): string | null {
  if (directions.length === 0) return null
  if (directions.length === 1) return directions[0]
  let sumX = 0
  let sumY = 0
  for (const d of directions) {
    const bearing = DIRS.indexOf(d) * 45 * (Math.PI / 180)
    sumX += Math.sin(bearing)
    sumY += Math.cos(bearing)
  }
  const magnitude = Math.sqrt(sumX * sumX + sumY * sumY)
  if (magnitude < 0.05) return directions[0]
  let meanBearing = Math.atan2(sumX, sumY) * (180 / Math.PI)
  if (meanBearing < 0) meanBearing += 360
  return DIRS[Math.round(meanBearing / 45) % 8]
}

const R = 56
const LABEL_R = 90
const CX = 98
const CY = 108
const SVG_W = 196
const SVG_H = 216
const ARROW_SIZE = 28

/** Directions walking clockwise from startIdx to endIdx, inclusive. */
function arcFromTo(startIdx: number, endIdx: number): number[] {
  const len = ((endIdx - startIdx + 8) % 8) + 1
  const arc: number[] = []
  for (let i = 0; i < len; i++) arc.push((startIdx + i) % 8)
  return arc
}

function pointAt(idx: number, radius: number) {
  const angle = (idx * 45 - 90) * (Math.PI / 180)
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) }
}

export default function WindCompassPicker({ value, onChange }: Props) {
  // Selection is always kept contiguous: growing extends whichever end of the
  // current arc is closer to the new click (filling the gap between), and
  // shrinking only ever removes from an endpoint — never punches a hole in
  // the middle, so "not contiguous" is simply not a reachable state.
  const handleClick = (dir: string) => {
    const dirIdx = DIRS.indexOf(dir)

    if (value.directions.length === 0) {
      onChange({ directions: [dir], center: dir })
      return
    }

    const startIdx = DIRS.indexOf(value.directions[0])
    const endIdx = DIRS.indexOf(value.directions[value.directions.length - 1])

    if (value.directions.includes(dir)) {
      if (dirIdx === startIdx && dirIdx === endIdx) {
        onChange({ directions: [], center: null })
      } else if (dirIdx === startIdx) {
        const arc = arcFromTo((startIdx + 1) % 8, endIdx).map(i => DIRS[i])
        onChange({ directions: arc, center: computeCenter(arc) })
      } else if (dirIdx === endIdx) {
        const arc = arcFromTo(startIdx, (endIdx - 1 + 8) % 8).map(i => DIRS[i])
        onChange({ directions: arc, center: computeCenter(arc) })
      }
      // Clicking an already-selected interior point would break contiguity — no-op.
      return
    }

    // Extend whichever end of the arc is closer to the new direction, filling the gap.
    const distFromEnd = (dirIdx - endIdx + 8) % 8
    const distFromStart = (startIdx - dirIdx + 8) % 8
    const arc = (distFromEnd <= distFromStart
      ? arcFromTo(startIdx, dirIdx)
      : arcFromTo(dirIdx, endIdx)
    ).map(i => DIRS[i])
    onChange({ directions: arc, center: computeCenter(arc) })
  }

  const handleClear = () => onChange({ directions: [], center: null })

  return (
    <div className="flex flex-col items-center py-2">
      <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}>
        {DIRS.map((dir, i) => {
          const arrowP = pointAt(i, R)
          const labelP = pointAt(i, LABEL_R)
          const selected = value.directions.includes(dir)
          const isCenter = value.center === dir
          // Tip points inward, toward the blind: this represents wind blowing
          // FROM the named direction TOWARD the center, which is how a hunter
          // actually thinks about it ("NE wind" = wind flowing in from the NE).
          const rotation = (i * 45 + 180) % 360
          const color = isCenter ? '#D4A94A' : selected ? '#1B5E45' : '#E4E5E3'
          return (
            <g key={dir} onClick={() => handleClick(dir)} style={{ cursor: 'pointer' }}>
              <circle cx={arrowP.x} cy={arrowP.y} r={24} fill="transparent" />
              <circle cx={labelP.x} cy={labelP.y} r={12} fill="transparent" />
              <g transform={`translate(${arrowP.x}, ${arrowP.y}) rotate(${rotation})`}>
                <path
                  d={`M0,${-ARROW_SIZE / 2} L${ARROW_SIZE / 3},${ARROW_SIZE / 2} L0,${ARROW_SIZE / 3} L${-ARROW_SIZE / 3},${ARROW_SIZE / 2} Z`}
                  fill={color}
                  stroke={selected || isCenter ? 'none' : '#797B7E'}
                  strokeWidth={selected ? 0 : 1}
                />
              </g>
              <text
                x={labelP.x} y={labelP.y + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={selected ? '#13141A' : '#797B7E'}
                style={{ fontFamily: '"Work Sans", sans-serif' }}
              >
                {dir}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="text-xs text-muted text-center mt-1">
        {value.directions.length === 0
          ? 'No wind preference set — tap one or more directions'
          : value.directions.length === 1
          ? `Ideal: ${value.directions[0]}`
          : `Ideal: ${value.directions.join(', ')} · sweet spot ${value.center}`}
      </p>
      {value.directions.length > 0 && (
        <button type="button" onClick={handleClear} className="text-xs text-muted hover:text-ink underline underline-offset-2 mt-1">
          Clear
        </button>
      )}
    </div>
  )
}
