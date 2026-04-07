// Match a single IPC code: subclass (H01L) or group (H01L 21/677)
export const SINGLE_CODE_RE = /^[A-H]\d{2}[A-Z](?:\s+\d+\/\d+)?$/

// Match a code followed by a range: "H01L 21/00 - 21/06" or "H01L 21/00 -"
export const RANGE_RE = /^([A-H]\d{2}[A-Z]\s+\d+\/\d+)\s*(-\s*\d*\/?\.?\d*)$/

// Expand a range like "B81C 1/00 - 5/00" into individual codes using ipcGroups
export function expandRange(startCode, endPart, ipcGroups) {
  if (!ipcGroups || !endPart) return null
  const sub = startCode.slice(0, 4)
  const groups = ipcGroups[sub]
  if (!groups) return null

  const startMatch = startCode.match(/([A-H]\d{2}[A-Z])\s+(\d+)\/(\d+)/)
  if (!startMatch) return null
  const startMain = parseInt(startMatch[2])
  const startSub = parseInt(startMatch[3])

  const endClean = endPart.replace(/^-\s*/, '').trim()
  if (!endClean) return null
  let endMain, endSub
  if (endClean.includes('/')) {
    const parts = endClean.split('/')
    endMain = parseInt(parts[0])
    endSub = parseInt(parts[1])
  } else {
    endMain = startMain
    endSub = parseInt(endClean)
  }

  const expanded = groups.filter(g => {
    const m = g.match(/[A-H]\d{2}[A-Z]\s+(\d+)\/(\d+)/)
    if (!m) return false
    const gMain = parseInt(m[1])
    const gSub = parseInt(m[2])
    if (gMain < startMain || gMain > endMain) return false
    if (gMain === startMain && gSub < startSub) return false
    if (gMain === endMain && gSub > endSub) return false
    return true
  })

  return expanded.length > 0 ? expanded : null
}

// Parse a dst string into segments, marking which are clickable
export function parseDst(dst) {
  const parts = dst.split(',')
  const segments = []
  parts.forEach((part, i) => {
    if (i > 0) segments.push({ text: ', ', link: false })
    const trimmed = part.trim()

    if (SINGLE_CODE_RE.test(trimmed)) {
      segments.push({ text: trimmed, link: true })
    } else {
      const rangeMatch = trimmed.match(RANGE_RE)
      if (rangeMatch) {
        segments.push({ text: rangeMatch[1], link: true })
        segments.push({ text: ' ' + rangeMatch[2], link: false })
      } else {
        const codePattern = /[A-H]\d{2}[A-Z](?:\s+\d+\/\d+)?/g
        let lastIdx = 0
        let match
        let found = false
        while ((match = codePattern.exec(trimmed)) !== null) {
          found = true
          if (match.index > lastIdx) {
            segments.push({ text: trimmed.slice(lastIdx, match.index), link: false })
          }
          segments.push({ text: match[0], link: true })
          lastIdx = match.index + match[0].length
        }
        if (found && lastIdx < trimmed.length) {
          segments.push({ text: trimmed.slice(lastIdx), link: false })
        }
        if (!found) {
          segments.push({ text: trimmed, link: false })
        }
      }
    }
  })
  return segments
}

// Extract all individual IPC codes from a string (handles ranges, commas, etc.)
export function extractCodes(str) {
  const codes = []
  let lastSub = null
  str.split(',').forEach(part => {
    const trimmed = part.trim()
    const fullMatch = trimmed.match(/([A-H]\d{2}[A-Z])\s+(\d+\/\d+)/)
    if (fullMatch) {
      lastSub = fullMatch[1]
      codes.push(`${fullMatch[1]} ${fullMatch[2]}`)
      const rangeMatch = trimmed.match(/([A-H]\d{2}[A-Z])\s+(\d+\/\d+)\s*-\s*(\d+\/\d+)/)
      if (rangeMatch) {
        codes.push(`${rangeMatch[1]} ${rangeMatch[3]}`)
      }
    } else if (lastSub) {
      const bareMatch = trimmed.match(/(?:-\s*)?(\d+\/\d+)/)
      if (bareMatch) {
        codes.push(`${lastSub} ${bareMatch[1]}`)
      }
    }
  })
  return codes
}

// Normalize input for group-level queries: insert space after 4th char if missing
export function normalizeGroupQuery(q) {
  if (q.length > 4 && q[4] !== ' ') {
    return q.slice(0, 4) + ' ' + q.slice(4)
  }
  return q
}

// Detect if a query is group-level (>4 chars starting with valid subclass pattern)
export function isGroupQuery(q) {
  return q.length > 4 && /^[A-H]\d{2}[A-Z]/.test(q)
}
