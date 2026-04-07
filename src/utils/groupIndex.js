import { extractCodes } from './ipcParser'

// Build an index: group code → [{ type: 'donated'|'received', subclass, record }]
export function buildGroupIndex(subclass_index) {
  const idx = {}
  const SINGLE_RE = /^[A-H]\d{2}[A-Z]\s+\d+\/\d+$/
  Object.entries(subclass_index).forEach(([subclass, entry]) => {
    ;(entry.donated || []).forEach(rec => {
      const key = (rec.src_group || '').trim()
      if (!key) return
      if (!idx[key]) idx[key] = []
      idx[key].push({ type: 'donated', subclass, record: rec })
      extractCodes(key).forEach(code => {
        if (code !== key) {
          if (!idx[code]) idx[code] = []
          idx[code].push({ type: 'donated', subclass, record: rec })
        }
      })
    })
    ;(entry.received || []).forEach(rec => {
      const dst = (rec.dst || '').trim()
      extractCodes(dst).forEach(code => {
        if (!idx[code]) idx[code] = []
        idx[code].push({ type: 'received', subclass, record: rec })
      })
      const from = (rec.from || '').trim()
      extractCodes(from).forEach(code => {
        if (!idx[code]) idx[code] = []
        idx[code].push({ type: 'from', subclass, record: rec })
      })
      if (from && !SINGLE_RE.test(from)) {
        if (!idx[from]) idx[from] = []
        idx[from].push({ type: 'from', subclass, record: rec })
      }
    })
  })
  return idx
}
