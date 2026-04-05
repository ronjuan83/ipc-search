import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Fuse from 'fuse.js'
import './App.css'

// Subclass names — loaded dynamically from ipc_names.json
let SUBCLASS_NAMES = {}
// Group titles — loaded dynamically from ipc_group_titles.json
let GROUP_TITLES = {} // "H10B 10/00" → "Static random access memory [SRAM] devices"

function getSubclassName(code) {
  return SUBCLASS_NAMES[code] || ''
}

// GROUP_TITLES_ZH populated from ipc_group_titles.json 'zh' field
let GROUP_TITLES_ZH = {}

function getGroupTitle(code) {
  // Try Chinese first, then English
  const zh = GROUP_TITLES_ZH[code]
  const en = GROUP_TITLES[code]
  if (zh && en) return `${zh} (${en})`
  if (zh) return zh
  if (en) return en
  // Fallback to main group
  const parts = code.match(/([A-H]\d{2}[A-Z])\s+(\d+)\//)
  if (parts) {
    const mainCode = `${parts[1]} ${parts[2]}/00`
    const mZh = GROUP_TITLES_ZH[mainCode]
    const mEn = GROUP_TITLES[mainCode]
    if (mZh || mEn) {
      const label = mZh && mEn ? `${mZh} (${mEn})` : (mZh || mEn)
      return `[${mainCode}] ${label}`
    }
  }
  return ''
}

// Match a single IPC code: subclass (H01L) or group (H01L 21/677)
const SINGLE_CODE_RE = /^[A-H]\d{2}[A-Z](?:\s+\d+\/\d+)?$/

// Match a code followed by a range: "H01L 21/00 - 21/06" or "H01L 21/00 -"
const RANGE_RE = /^([A-H]\d{2}[A-Z]\s+\d+\/\d+)\s*(-\s*\d*\/?\.?\d*)$/

// Expand a range like "B81C 1/00 - 5/00" into individual codes using ipcGroups
function expandRange(startCode, endPart, ipcGroups) {
  if (!ipcGroups || !endPart) return null
  const sub = startCode.slice(0, 4)
  const groups = ipcGroups[sub]
  if (!groups) return null

  // Parse start: "B81C 1/00" → main=1, sub=00
  const startMatch = startCode.match(/([A-H]\d{2}[A-Z])\s+(\d+)\/(\d+)/)
  if (!startMatch) return null
  const startMain = parseInt(startMatch[2])
  const startSub = parseInt(startMatch[3])

  // Parse end: "- 5/00" or "- 21/06"
  const endClean = endPart.replace(/^-\s*/, '').trim()
  if (!endClean) return null
  let endMain, endSub
  if (endClean.includes('/')) {
    const parts = endClean.split('/')
    endMain = parseInt(parts[0])
    endSub = parseInt(parts[1])
  } else {
    // Just a subgroup like "21/06" → same main group
    endMain = startMain
    endSub = parseInt(endClean)
  }

  // Filter groups in range
  const expanded = groups.filter(g => {
    const m = g.match(/[A-H]\d{2}[A-Z]\s+(\d+)\/(\d+)/)
    if (!m) return false
    const gMain = parseInt(m[1])
    const gSub = parseInt(m[2])
    // Compare: (main, sub) between start and end
    if (gMain < startMain || gMain > endMain) return false
    if (gMain === startMain && gSub < startSub) return false
    if (gMain === endMain && gSub > endSub) return false
    return true
  })

  return expanded.length > 0 ? expanded : null
}

// Parse a dst string into segments, marking which are clickable
// Handles: single codes, comma-separated, ranges (code - code), space-separated codes
function parseDst(dst) {
  // First split by comma
  const parts = dst.split(',')
  const segments = []
  parts.forEach((part, i) => {
    if (i > 0) segments.push({ text: ', ', link: false })
    const trimmed = part.trim()

    if (SINGLE_CODE_RE.test(trimmed)) {
      // Exact single code — fully clickable
      segments.push({ text: trimmed, link: true })
    } else {
      // Try range pattern: "H01L 21/00 - 21/06"
      const rangeMatch = trimmed.match(RANGE_RE)
      if (rangeMatch) {
        segments.push({ text: rangeMatch[1], link: true })
        segments.push({ text: ' ' + rangeMatch[2], link: false })
      } else {
        // Try to find embedded IPC codes (space-separated or other)
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

function CodeLink({ text, onSearch, showTitle }) {
  const title = getGroupTitle(text) || getSubclassName(text.slice(0, 4))
  return (
    <>
      <span className="code-link" onClick={() => onSearch(text)} title={title || undefined}>
        {text}
      </span>
      {showTitle && title && <span className="code-title-hint">{title}</span>}
    </>
  )
}

function DstCell({ dst, onSearch, ipcGroups, showTitles }) {
  const segments = parseDst(dst)
  const result = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.link) {
      // Check if next segment is a range suffix like " - 5/00"
      const next = segments[i + 1]
      if (next && !next.link && next.text.trim().startsWith('-') && ipcGroups) {
        const expanded = expandRange(seg.text, next.text.trim(), ipcGroups)
        if (expanded && expanded.length >= 1) {
          // Replace range with expanded individual codes
          result.push(
            <span key={i} className="expanded-range">
              {expanded.map((code, j) => (
                <span key={j}>
                  {j > 0 && ', '}
                  <CodeLink text={code} onSearch={onSearch} showTitle={showTitles} />
                </span>
              ))}
            </span>
          )
          i++ // skip the range suffix
          continue
        }
      }
      result.push(<CodeLink key={i} text={seg.text} onSearch={onSearch} showTitle={showTitles} />)
    } else {
      result.push(<span key={i}>{seg.text}</span>)
    }
  }
  return <>{result}</>
}

// Extract all individual IPC codes from a string (handles ranges, commas, etc.)
// e.g. "H04N 5/30 - 5/31" → ["H04N 5/30", "H04N 5/31"]
function extractCodes(str) {
  const codes = []
  let lastSub = null
  // Split by comma first, then handle each part
  str.split(',').forEach(part => {
    const trimmed = part.trim()
    // Full code: "H04N 5/30"
    const fullMatch = trimmed.match(/([A-H]\d{2}[A-Z])\s+(\d+\/\d+)/)
    if (fullMatch) {
      lastSub = fullMatch[1]
      codes.push(`${fullMatch[1]} ${fullMatch[2]}`)
      // Check for range suffix: "H04N 5/30 - 5/31"
      const rangeMatch = trimmed.match(/([A-H]\d{2}[A-Z])\s+(\d+\/\d+)\s*-\s*(\d+\/\d+)/)
      if (rangeMatch) {
        codes.push(`${rangeMatch[1]} ${rangeMatch[3]}`)
      }
    } else if (lastSub) {
      // Bare group number with range: "5/31" or "- 5/31"
      const bareMatch = trimmed.match(/(?:-\s*)?(\d+\/\d+)/)
      if (bareMatch) {
        codes.push(`${lastSub} ${bareMatch[1]}`)
      }
    }
  })
  return codes
}

// Build an index: group code → [{ type: 'donated'|'received', subclass, record }]
function buildGroupIndex(subclass_index) {
  const idx = {}
  const SINGLE_RE = /^[A-H]\d{2}[A-Z]\s+\d+\/\d+$/
  Object.entries(subclass_index).forEach(([subclass, entry]) => {
    ;(entry.donated || []).forEach(rec => {
      const key = (rec.src_group || '').trim()
      if (!key) return
      // Index the full src_group string (may be a range)
      if (!idx[key]) idx[key] = []
      idx[key].push({ type: 'donated', subclass, record: rec })
      // Also index individual codes extracted from src_group (for ranges like "H04N 5/30 - 5/31")
      extractCodes(key).forEach(code => {
        if (code !== key) {
          if (!idx[code]) idx[code] = []
          idx[code].push({ type: 'donated', subclass, record: rec })
        }
      })
    })
    ;(entry.received || []).forEach(rec => {
      // Index by dst: extract ALL individual codes (including range endpoints)
      const dst = (rec.dst || '').trim()
      extractCodes(dst).forEach(code => {
        if (!idx[code]) idx[code] = []
        idx[code].push({ type: 'received', subclass, record: rec })
      })
      // Also index the from field (may be a range)
      const from = (rec.from || '').trim()
      extractCodes(from).forEach(code => {
        if (!idx[code]) idx[code] = []
        idx[code].push({ type: 'from', subclass, record: rec })
      })
      // Also index the full from string if it's a range
      if (from && !SINGLE_RE.test(from)) {
        if (!idx[from]) idx[from] = []
        idx[from].push({ type: 'from', subclass, record: rec })
      }
    })
  })
  return idx
}

// Normalize input for group-level queries: insert space after 4th char if missing
// e.g. "H01L21/677" → "H01L 21/677"
function normalizeGroupQuery(q) {
  if (q.length > 4 && q[4] !== ' ') {
    return q.slice(0, 4) + ' ' + q.slice(4)
  }
  return q
}

// Detect if a query is group-level (>4 chars starting with valid subclass pattern)
function isGroupQuery(q) {
  return q.length > 4 && /^[A-H]\d{2}[A-Z]/.test(q)
}

function StatusBadge({ code, data, onSearch }) {
  const intro = data.introduced_in[code]
  const depr = data.deprecated_to[code]
  const deprAt = data.deprecated_at && data.deprecated_at[code]
  if (depr) {
    const target = Array.isArray(depr) ? depr.join(', ') : depr
    return (
      <span className="badge badge-deprecated">
        {deprAt && <span className="depr-version">{deprAt}</span>}
        {' '}已廢棄 → <span className="code-link code-link-badge" onClick={() => onSearch(Array.isArray(depr) ? depr[0] : depr)}>{target}</span>
      </span>
    )
  }
  if (intro) {
    return <span className="badge badge-new">新增於 {intro}</span>
  }
  return <span className="badge badge-active">現行有效</span>
}

function DonatedSection({ donated, onSearch, ipcGroups }) {
  if (!donated || donated.length === 0) return null

  const byVersion = {}
  donated.forEach(item => {
    if (!byVersion[item.version]) byVersion[item.version] = []
    byVersion[item.version].push(item)
  })

  return (
    <div className="history-section">
      <h3 className="section-title donated-title">
        <span className="section-icon">→</span>
        捐出紀錄（此分類的組移入其他分類）
        <span className="count-badge">{donated.length} 筆</span>
      </h3>
      {Object.entries(byVersion).map(([ver, items]) => (
        <div key={ver} className="version-group">
          <div className="version-label">{ver}</div>
          <table className="move-table">
            <thead>
              <tr>
                <th>原始組號</th>
                <th>移入目的地</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="code-cell"><DstCell dst={item.src_group} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                  <td className="code-cell"><DstCell dst={item.dst} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function ReceivedSection({ received, onSearch, ipcGroups }) {
  if (!received || received.length === 0) return null

  const byVersion = {}
  received.forEach(item => {
    if (!byVersion[item.version]) byVersion[item.version] = []
    byVersion[item.version].push(item)
  })

  return (
    <div className="history-section">
      <h3 className="section-title received-title">
        <span className="section-icon">←</span>
        接收紀錄（其他分類的組移入此分類）
        <span className="count-badge">{received.length} 筆</span>
      </h3>
      {Object.entries(byVersion).map(([ver, items]) => (
        <div key={ver} className="version-group">
          <div className="version-label">{ver}</div>
          <table className="move-table">
            <thead>
              <tr>
                <th>原始組號</th>
                <th>移入目的地</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="code-cell"><DstCell dst={item.from} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                  <td className="code-cell"><DstCell dst={item.dst} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// Inline flow summary shown directly in SubclassCard
function FlowSummary({ code, flowGraph, data, onSearch }) {
  if (!flowGraph) return null
  const isSubclass = /^[A-H]\d{2}[A-Z]$/.test(code)
  const rawFlow = isSubclass
    ? traceSubclassFlow(code, flowGraph, data.subclass_index)
    : traceFlow(code, flowGraph)
  if (rawFlow.edges.length === 0) return null

  const originSub = code.slice(0, 4)
  const relevantEdges = rawFlow.edges.filter(e => {
    const fromSub = e.from.slice(0, 4)
    const toSub = e.to.slice(0, 4)
    return fromSub === originSub || toSub === originSub
  })
  if (relevantEdges.length === 0) return null

  // Group by version → subclass pairs
  const byVersion = {}
  relevantEdges.forEach(e => {
    if (!byVersion[e.version]) byVersion[e.version] = []
    byVersion[e.version].push(e)
  })
  const sortedVersions = Object.keys(byVersion).sort((a, b) => versionOrder(a) - versionOrder(b))

  const palette = ['#0d6efd', '#dc3545', '#198754', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c', '#6610f2', '#ffc107', '#17a2b8']
  const allSubs = new Set()
  relevantEdges.forEach(e => { allSubs.add(e.from.slice(0, 4)); allSubs.add(e.to.slice(0, 4)) })
  const subColors = {}
  let ci = 0
  ;[...allSubs].sort().forEach(s => { subColors[s] = palette[ci++ % palette.length] })

  return (
    <div className="flow-summary-section">
      <div className="flow-summary-header">
        <span className="section-icon">⟷</span>
        跨版本流變摘要
        <span className="count-badge">{relevantEdges.length} 筆異動、{sortedVersions.length} 個版本</span>
      </div>
      <div className="flow-summary-body">
        {sortedVersions.map(ver => {
          const edges = byVersion[ver]
          const subFlows = {}
          edges.forEach(e => {
            const fromSub = e.from.slice(0, 4)
            const toSub = e.to.slice(0, 4)
            if (fromSub === toSub) return
            const key = `${fromSub}→${toSub}`
            if (!subFlows[key]) subFlows[key] = { fromSub, toSub, count: 0 }
            subFlows[key].count++
          })
          const entries = Object.values(subFlows)
          if (entries.length === 0) return null

          return (
            <div key={ver} className="flow-summary-ver">
              <span className="flow-summary-ver-label">{ver}</span>
              <div className="flow-summary-flows">
                {entries.map((sf, i) => {
                  const isOut = sf.fromSub === originSub
                  return (
                    <span key={i} className="flow-summary-item">
                      <span className={`tl-direction ${isOut ? 'out' : 'in'}`}>{isOut ? '捐出' : '移入'}</span>
                      <span className="flow-sub-chip" style={{ borderColor: subColors[sf.fromSub], color: subColors[sf.fromSub], fontSize: '0.75rem', padding: '1px 5px' }}
                            onClick={() => onSearch(sf.fromSub)}>{sf.fromSub}</span>
                      <span style={{ color: '#adb5bd', fontSize: '0.75rem' }}>→</span>
                      <span className="flow-sub-chip" style={{ borderColor: subColors[sf.toSub], color: subColors[sf.toSub], fontSize: '0.75rem', padding: '1px 5px' }}
                            onClick={() => onSearch(sf.toSub)}>{sf.toSub}</span>
                      <span style={{ fontSize: '0.7rem', color: '#6c757d' }}>{sf.count}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SubclassCard({ code, data, onSearch, ipcGroups, flowGraph, selectedVersion }) {
  const entry = data.subclass_index[code] || {}
  const allDonated = entry.donated || []
  const allReceived = entry.received || []
  const donated = selectedVersion ? allDonated.filter(r => r.version === selectedVersion) : allDonated
  const received = selectedVersion ? allReceived.filter(r => r.version === selectedVersion) : allReceived
  const name = getSubclassName(code)
  const intro = data.introduced_in[code]
  const depr = data.deprecated_to[code]
  const deprAt = data.deprecated_at && data.deprecated_at[code]
  const hasFlowData = donated.length > 0 || received.length > 0

  const [viewTab, setViewTab] = useState('summary') // 'summary' | 'list' | 'timeline'

  // Precompute flow data for list/timeline tabs
  const rawFlow = flowGraph && hasFlowData
    ? traceSubclassFlow(code, flowGraph, data.subclass_index)
    : { edges: [], nodes: [] }
  const originSub = code.slice(0, 4)
  const relevantEdges = rawFlow.edges.filter(e => {
    const fromSub = e.from.slice(0, 4)
    const toSub = e.to.slice(0, 4)
    return fromSub === originSub || toSub === originSub
  })
  const byVersion = {}
  relevantEdges.forEach(e => {
    if (!byVersion[e.version]) byVersion[e.version] = []
    byVersion[e.version].push(e)
  })
  const sortedVersions = Object.keys(byVersion).sort((a, b) => versionOrder(a) - versionOrder(b))

  const palette = ['#0d6efd', '#dc3545', '#198754', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c', '#6610f2', '#ffc107', '#17a2b8']
  const allSubs = new Set()
  relevantEdges.forEach(e => { allSubs.add(e.from.slice(0, 4)); allSubs.add(e.to.slice(0, 4)) })
  const subColors = {}
  let ci = 0
  ;[...allSubs].sort().forEach(s => { subColors[s] = palette[ci++ % palette.length] })

  const [expandedSections, setExpandedSections] = useState({})
  function toggleSection(key) {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="subclass-card">
      <div className="card-header">
        <div className="card-title-row">
          <span className="subclass-code">{code}</span>
          {name && <span className="subclass-name">{name}</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <StatusBadge code={code} data={data} onSearch={onSearch} />
          {hasFlowData && flowGraph && (
            <div className="sankey-toggle">
              <button className={`toggle-btn ${viewTab === 'summary' ? 'active' : ''}`} onClick={() => setViewTab('summary')}>摘要</button>
              <button className={`toggle-btn ${viewTab === 'list' ? 'active' : ''}`} onClick={() => setViewTab('list')}>列表</button>
              <button className={`toggle-btn ${viewTab === 'timeline' ? 'active' : ''}`} onClick={() => setViewTab('timeline')}>時間軸</button>
            </div>
          )}
        </div>
      </div>

      {intro && (
        <div className="info-row">
          <span className="info-label">引入版本：</span>
          <span className="info-value">{intro}</span>
          <span className="info-note">
            （此分類於 {intro} 版新設，在此之前不存在）
          </span>
        </div>
      )}
      {depr && (
        <div className="info-row">
          <span className="info-label">廢棄去向：</span>
          <span className="info-value">{Array.isArray(depr) ? depr.join(', ') : depr}</span>
          {deprAt && <span className="info-note">（於 {deprAt} 版廢棄）</span>}
        </div>
      )}

      {viewTab === 'summary' && (
        <FlowSummary code={code} flowGraph={flowGraph} data={data} onSearch={onSearch} />
      )}

      {viewTab === 'list' && (
        donated.length === 0 && received.length === 0 ? (
          <div className="no-moves">此分類在現有記錄中無跨分類異動。</div>
        ) : (
          <>
            <DonatedSection donated={donated} onSearch={onSearch} ipcGroups={ipcGroups} />
            <ReceivedSection received={received} onSearch={onSearch} ipcGroups={ipcGroups} />
          </>
        )
      )}

      {viewTab === 'timeline' && (
        <TimelineChart
          sortedVersions={sortedVersions}
          byVersion={byVersion}
          originSub={originSub}
          subColors={subColors}
          expandedSections={expandedSections}
          toggleSection={toggleSection}
          onSearch={onSearch}
          data={data}
          ipcGroups={ipcGroups}
        />
      )}
    </div>
  )
}

// Card for exact group-level code (4th/5th level)
function GroupCard({ code, groupIndex, onSearch, ipcGroups }) {
  const entries = groupIndex[code] || []
  const subclass = code.slice(0, 4)
  const subclassName = getSubclassName(subclass)

  const donated = entries.filter(e => e.type === 'donated')
  const received = entries.filter(e => e.type === 'received')

  const byVersionDonated = {}
  donated.forEach(e => {
    const v = e.record.version
    if (!byVersionDonated[v]) byVersionDonated[v] = []
    byVersionDonated[v].push(e)
  })

  const byVersionReceived = {}
  received.forEach(e => {
    const v = e.record.version
    if (!byVersionReceived[v]) byVersionReceived[v] = []
    byVersionReceived[v].push(e)
  })

  return (
    <div className="subclass-card">
      <div className="card-header">
        <div className="card-title-row">
          <span className="subclass-code">{code}</span>
          {subclassName && (
            <span className="subclass-name">所屬分類：<CodeLink text={subclass} onSearch={onSearch} /> {subclassName}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {donated.length > 0 && <span className="badge badge-deprecated">{donated.length} 筆移出</span>}
          {received.length > 0 && <span className="badge badge-new">{received.length} 筆移入</span>}
        </div>
      </div>

      {donated.length > 0 && (
        <div className="history-section">
          <h3 className="section-title donated-title">
            <span className="section-icon">→</span>
            此組號移出紀錄
            <span className="count-badge">{donated.length} 筆</span>
          </h3>
          {Object.entries(byVersionDonated).map(([ver, items]) => (
            <div key={ver} className="version-group">
              <div className="version-label">{ver}</div>
              <table className="move-table">
                <thead>
                  <tr>
                    <th>原始組號</th>
                    <th>移入目的地</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e, i) => (
                    <tr key={i}>
                      <td className="code-cell"><DstCell dst={e.record.src_group} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                      <td className="code-cell"><DstCell dst={e.record.dst} onSearch={onSearch} ipcGroups={ipcGroups} showTitles /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {received.length > 0 && (
        <div className="history-section">
          <h3 className="section-title received-title">
            <span className="section-icon">←</span>
            此組號接收紀錄
            <span className="count-badge">{received.length} 筆</span>
          </h3>
          {Object.entries(byVersionReceived).map(([ver, items]) => (
            <div key={ver} className="version-group">
              <div className="version-label">{ver}</div>
              <table className="move-table">
                <thead>
                  <tr>
                    <th>原始組號</th>
                    <th>移入目的地</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e, i) => (
                    <tr key={i}>
                      <td className="code-cell"><DstCell dst={e.record.from} onSearch={onSearch} ipcGroups={ipcGroups} showTitles /></td>
                      <td className="code-cell"><DstCell dst={e.record.dst} onSearch={onSearch} ipcGroups={ipcGroups} showTitles /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {donated.length === 0 && received.length === 0 && (
        <div className="no-moves">此組號在現有記錄中無跨分類異動。</div>
      )}
    </div>
  )
}

// List for prefix group-level search
function GroupList({ prefix, matches, groupIndex, onSelect }) {
  if (matches.length === 0) {
    return <div className="no-result">找不到以「{prefix}」開頭的 IPC 組號。</div>
  }

  return (
    <div className="prefix-results">
      <div className="prefix-header">
        找到 {matches.length} 個以「{prefix}」開頭的組號：
      </div>
      <div className="prefix-grid">
        {matches.map(code => {
          const entries = groupIndex[code] || []
          return (
            <div
              key={code}
              className="prefix-item"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect(code)}
            >
              <div className="prefix-item-code">{code}</div>
              <div className="prefix-item-stats">
                {entries.length > 0 && <span className="stat donated-stat">移出 {entries.length}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PrefixList({ prefix, data, onSearch, selectedVersion }) {
  // Merge all known subclass codes from subclass_index, introduced_in, and deprecated_to
  const allCodes = new Set([
    ...Object.keys(data.subclass_index),
    ...Object.keys(data.introduced_in || {}),
    ...Object.keys(data.deprecated_to || {})
  ])
  let matches = [...allCodes]
    .filter(k => k.startsWith(prefix.toUpperCase()))
    .sort()

  // Filter by version if selected
  if (selectedVersion) {
    matches = matches.filter(code => {
      const entry = data.subclass_index[code]
      if (!entry) return false
      return (entry.donated || []).some(r => r.version === selectedVersion) ||
             (entry.received || []).some(r => r.version === selectedVersion)
    })
  }

  if (matches.length === 0) {
    return <div className="no-result">找不到以「{prefix}」開頭的 IPC 分類代碼。</div>
  }

  return (
    <div className="prefix-results">
      <div className="prefix-header">
        找到 {matches.length} 個以「{prefix.toUpperCase()}」開頭的分類代碼：
      </div>
      <div className="prefix-grid">
        {matches.map(code => {
          const entry = data.subclass_index[code] || {}
          const donated = (entry.donated || []).length
          const received = (entry.received || []).length
          const depr = data.deprecated_to[code]
          const intro = data.introduced_in[code]
          return (
            <div key={code} className={`prefix-item ${depr ? 'is-deprecated' : ''}`} style={{ cursor: 'pointer' }} onClick={() => onSearch(code)}>
              <div className="prefix-item-code">{code}</div>
              {getSubclassName(code) && (
                <div className="prefix-item-name">{getSubclassName(code)}</div>
              )}
              <div className="prefix-item-stats">
                {donated > 0 && <span className="stat donated-stat">捐出 {donated}</span>}
                {received > 0 && <span className="stat received-stat">接收 {received}</span>}
                {intro && <span className="stat intro-stat">新增</span>}
                {depr && <span className="stat depr-stat">廢棄</span>}
                {donated === 0 && received === 0 && !intro && !depr && (
                  <span className="stat no-stat">無異動</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Flow Graph: build directed graph of group-level transfers ──

function buildFlowGraph(subclass_index) {
  // graph[code] = { donatedTo: [{version, dst, dstSub}], receivedFrom: [{version, from, fromSub}] }
  const graph = {}
  const SINGLE_RE = /[A-H]\d{2}[A-Z]\s+\d+\/\d+/g

  function ensure(code) {
    if (!graph[code]) graph[code] = { donatedTo: [], receivedFrom: [] }
  }

  Object.entries(subclass_index).forEach(([subclass, entry]) => {
    ;(entry.donated || []).forEach(rec => {
      const src = (rec.src_group || '').trim()
      if (!src) return
      ensure(src)
      // Parse dst into individual codes
      const dstCodes = []
      const matches = rec.dst.matchAll(SINGLE_RE)
      for (const m of matches) {
        dstCodes.push(m[0])
      }
      if (dstCodes.length === 0 && rec.dst.trim()) {
        dstCodes.push(rec.dst.trim())
      }
      const ver = rec.version
      dstCodes.forEach(dst => {
        graph[src].donatedTo.push({ version: ver, dst, dstSub: dst.slice(0, 4) })
        ensure(dst)
        graph[dst].receivedFrom.push({ version: ver, from: src, fromSub: subclass })
      })
    })
  })
  return graph
}

function traceFlow(startCode, flowGraph, direction = 'both', maxDepth = 8) {
  // Returns { nodes: [{code, depth, direction}], edges: [{from, to, version}] }
  const nodes = new Map() // code → {code, depth, direction}
  const edges = []
  const visited = new Set()

  function traceDown(code, depth) {
    if (depth > maxDepth || visited.has('down:' + code)) return
    visited.add('down:' + code)
    const entry = flowGraph[code]
    if (!entry) return
    entry.donatedTo.forEach(({ version, dst }) => {
      if (!nodes.has(dst)) nodes.set(dst, { code: dst, direction: 'downstream' })
      edges.push({ from: code, to: dst, version })
      traceDown(dst, depth + 1)
    })
  }

  function traceUp(code, depth) {
    if (depth > maxDepth || visited.has('up:' + code)) return
    visited.add('up:' + code)
    const entry = flowGraph[code]
    if (!entry) return
    entry.receivedFrom.forEach(({ version, from }) => {
      if (!nodes.has(from)) nodes.set(from, { code: from, direction: 'upstream' })
      edges.push({ from: from, to: code, version })
      traceUp(from, depth + 1)
    })
  }

  nodes.set(startCode, { code: startCode, direction: 'origin' })
  if (direction === 'both' || direction === 'down') traceDown(startCode, 0)
  if (direction === 'both' || direction === 'up') traceUp(startCode, 0)

  return { nodes: [...nodes.values()], edges }
}

function traceSubclassFlow(subclass, flowGraph, subclass_index) {
  // Aggregate all group-level flows for a subclass
  const entry = subclass_index[subclass] || {}
  const allEdges = []
  const allNodes = new Map()

  // Find all unique group codes involved with this subclass
  const groupCodes = new Set()
  ;(entry.donated || []).forEach(rec => {
    if (rec.src_group) groupCodes.add(rec.src_group.trim())
  })
  ;(entry.received || []).forEach(rec => {
    if (rec.dst) {
      const matches = rec.dst.matchAll(/[A-H]\d{2}[A-Z]\s+\d+\/\d+/g)
      for (const m of matches) {
        if (m[0].startsWith(subclass)) groupCodes.add(m[0])
      }
    }
  })

  groupCodes.forEach(code => {
    const flow = traceFlow(code, flowGraph, 'both', 4)
    flow.nodes.forEach(n => {
      if (!allNodes.has(n.code)) allNodes.set(n.code, n)
    })
    flow.edges.forEach(e => allEdges.push(e))
  })

  // Deduplicate edges
  const edgeSet = new Set()
  const uniqueEdges = allEdges.filter(e => {
    const key = `${e.from}→${e.to}@${e.version}`
    if (edgeSet.has(key)) return false
    edgeSet.add(key)
    return true
  })

  return { nodes: [...allNodes.values()], edges: uniqueEdges }
}

// ── Sankey Diagram ──

function versionOrder(verStr) {
  const m = verStr.match(/(\d{4})\.(\d{2})→(\d{4})\.(\d{2})/)
  if (m) return parseInt(m[3]) * 100 + parseInt(m[4])
  return 0
}

// Aggregate group-level flow into subclass-level: collapse codes to 4-char prefix
function aggregateToSubclass(flow, originCode) {
  const originSub = originCode.slice(0, 4)
  const edgeMap = {} // "version|fromSub|toSub" → weight
  flow.edges.forEach(e => {
    const fromSub = e.from.slice(0, 4)
    const toSub = e.to.slice(0, 4)
    if (fromSub === toSub) return // skip self-loops within same subclass
    const key = `${e.version}|${fromSub}|${toSub}`
    edgeMap[key] = (edgeMap[key] || 0) + 1
  })
  const aggEdges = Object.entries(edgeMap).map(([key, weight]) => {
    const [version, from, to] = key.split('|')
    return { from, to, version, weight }
  })
  const nodeSet = new Set()
  aggEdges.forEach(e => { nodeSet.add(e.from); nodeSet.add(e.to) })
  return {
    nodes: [...nodeSet].map(code => ({ code, direction: code === originSub ? 'origin' : 'other' })),
    edges: aggEdges
  }
}

// Compute Sankey layout with ribbon-style links
function computeSankeyLayout(flow, originCode) {
  const NODE_W = 70
  const COL_SPACING = 220  // center-to-center distance between src and tgt columns
  const VER_GAP = 60       // gap between version pairs
  const NODE_PAD = 6
  const MIN_NODE_H = 22
  const TOP_PAD = 36
  const PX_PER_WEIGHT = 6  // pixels per unit of weight for node height

  // 1. Versions → column pairs
  const versions = [...new Set(flow.edges.map(e => e.version))]
    .sort((a, b) => versionOrder(a) - versionOrder(b))
  const verToCol = {}
  versions.forEach((v, i) => { verToCol[v] = i })

  // 2. Create node instances
  const nodeInstances = []
  const nodeMap = {}
  function getOrCreate(code, col) {
    const key = `${code}@${col}`
    if (nodeMap[key] !== undefined) return nodeMap[key]
    const idx = nodeInstances.length
    nodeMap[key] = idx
    nodeInstances.push({ id: idx, code, col, weightOut: 0, weightIn: 0 })
    return idx
  }

  const layoutEdges = []
  flow.edges.forEach(e => {
    const vc = verToCol[e.version]
    const si = getOrCreate(e.from, vc * 2)
    const ti = getOrCreate(e.to, vc * 2 + 1)
    const w = e.weight || 1
    nodeInstances[si].weightOut += w
    nodeInstances[ti].weightIn += w
    layoutEdges.push({ src: si, tgt: ti, weight: w, version: e.version })
  })

  // 3. Group by column and sort
  const columns = {}
  nodeInstances.forEach((n, i) => {
    ;(columns[n.col] || (columns[n.col] = [])).push(i)
  })
  const originSub = originCode.slice(0, 4)
  Object.values(columns).forEach(col => {
    col.sort((a, b) => {
      const na = nodeInstances[a], nb = nodeInstances[b]
      const ao = na.code.startsWith(originSub) ? 0 : 1
      const bo = nb.code.startsWith(originSub) ? 0 : 1
      return ao !== bo ? ao - bo : na.code.localeCompare(nb.code)
    })
  })

  // 4. Size nodes: use sqrt scale so large nodes don't dominate
  if (nodeInstances.length === 0) {
    return { nodes: [], paths: [], versions, verToCol, totalW: 300, totalH: 100 }
  }
  const allWeights = nodeInstances.map(n => Math.max(n.weightOut, n.weightIn, 1))
  const maxW = Math.max(...allWeights, 1)
  nodeInstances.forEach(n => {
    n.totalWeight = Math.max(n.weightOut, n.weightIn, 1)
    const ratio = Math.sqrt(n.totalWeight / maxW)
    n.h = Math.max(MIN_NODE_H, Math.round(ratio * 180) + MIN_NODE_H)
    n.w = NODE_W
  })

  // 5. Position nodes: x by column, y stacked
  const colKeys = Object.keys(columns).map(Number).sort((a, b) => a - b)
  colKeys.forEach(ci => {
    const verIdx = Math.floor(ci / 2)
    const isTarget = ci % 2 === 1
    const x = verIdx * (COL_SPACING + VER_GAP) + (isTarget ? COL_SPACING - NODE_W : 0)

    let y = TOP_PAD
    columns[ci].forEach(ni => {
      const n = nodeInstances[ni]
      n.x = x
      n.y = y
      y += n.h + NODE_PAD
    })
  })

  // 6. Build ribbon paths — each link is a filled shape, not a stroked line
  // Track how much of each node's height has been used for outgoing/incoming ports
  const portOut = {}; const portIn = {}
  nodeInstances.forEach((_, i) => { portOut[i] = 0; portIn[i] = 0 })

  // Sort edges so largest ribbons are drawn first (painter's algorithm)
  layoutEdges.sort((a, b) => b.weight - a.weight)

  const paths = layoutEdges.map(e => {
    const src = nodeInstances[e.src]
    const tgt = nodeInstances[e.tgt]

    // Ribbon thickness proportional to weight, relative to the node
    const srcH = (e.weight / Math.max(src.weightOut, 1)) * src.h
    const tgtH = (e.weight / Math.max(tgt.weightIn, 1)) * tgt.h
    const thickness = Math.max(srcH, tgtH)

    // Source port: top edge of unused space on right side of src node
    const sy0 = src.y + portOut[e.src]
    const sy1 = sy0 + srcH
    portOut[e.src] += srcH

    // Target port: top edge of unused space on left side of tgt node
    const ty0 = tgt.y + portIn[e.tgt]
    const ty1 = ty0 + tgtH
    portIn[e.tgt] += tgtH

    // Control point x for bezier curves
    const x0 = src.x + src.w
    const x1 = tgt.x
    const cx = (x0 + x1) / 2

    // Ribbon: two bezier curves forming a filled shape
    const d = [
      `M${x0},${sy0}`,
      `C${cx},${sy0} ${cx},${ty0} ${x1},${ty0}`,
      `L${x1},${ty1}`,
      `C${cx},${ty1} ${cx},${sy1} ${x0},${sy1}`,
      `Z`
    ].join(' ')

    return { d, thickness, src: e.src, tgt: e.tgt, weight: e.weight, version: e.version }
  })

  // 7. Dimensions
  const allX = nodeInstances.map(n => n.x + n.w)
  const allY = nodeInstances.map(n => n.y + n.h)
  const totalW = Math.max(...allX, 300) + 20
  const totalH = Math.max(...allY, 100) + TOP_PAD

  return { nodes: nodeInstances, paths, versions, verToCol, totalW, totalH }
}

// ── Timeline Chart: git-log style vertical timeline ──

function TimelineChart({ sortedVersions, byVersion, originSub, subColors, expandedSections, toggleSection, onSearch, data, ipcGroups }) {
  return (
    <div className="timeline-chart">
      {sortedVersions.map(ver => {
        const edges = byVersion[ver]
        const subFlows = {}
        edges.forEach(e => {
          const fromSub = e.from.slice(0, 4)
          const toSub = e.to.slice(0, 4)
          if (fromSub === toSub) return
          const key = `${fromSub}→${toSub}`
          if (!subFlows[key]) subFlows[key] = { fromSub, toSub, edges: [] }
          subFlows[key].edges.push(e)
        })
        const flowEntries = Object.entries(subFlows)
        if (flowEntries.length === 0) return null

        const isOutgoing = flowEntries.some(([, sf]) => sf.fromSub === originSub)
        const isIncoming = flowEntries.some(([, sf]) => sf.toSub === originSub)
        const dotClass = isOutgoing && isIncoming ? 'both' : isOutgoing ? 'out' : 'in'

        return (
          <div key={ver} className="tl-version">
            <div className={`tl-dot ${dotClass}`} />
            <div className="tl-content">
              <div className="tl-ver-label">{ver}</div>
              {flowEntries.map(([key, sf]) => {
                const sectionKey = `${ver}|${key}`
                const isOpen = expandedSections[sectionKey]
                const isOut = sf.fromSub === originSub
                return (
                  <div key={key} className="tl-flow-row">
                    <div className="tl-flow-summary" onClick={() => toggleSection(sectionKey)}>
                      <span className={`tl-direction ${isOut ? 'out' : 'in'}`}>{isOut ? '捐出' : '移入'}</span>
                      <span className="flow-sub-chip" style={{ borderColor: subColors[sf.fromSub], color: subColors[sf.fromSub] }}
                            onClick={e => { e.stopPropagation(); onSearch(sf.fromSub) }}>{sf.fromSub}</span>
                      <span className="tl-arrow">→</span>
                      <span className="flow-sub-chip" style={{ borderColor: subColors[sf.toSub], color: subColors[sf.toSub] }}
                            onClick={e => { e.stopPropagation(); onSearch(sf.toSub) }}>{sf.toSub}</span>
                      <span className="tl-count">{sf.edges.length} 筆</span>
                      <span className={`flow-sub-toggle ${isOpen ? 'open' : ''}`}>▸</span>
                    </div>
                    {isOpen && (() => {
                      // Use original records from subclass_index instead of flowGraph edges
                      const srcEntry = data.subclass_index[sf.fromSub] || {}
                      const rawRecords = (srcEntry.donated || []).filter(r =>
                        r.version === ver && r.dst && new RegExp(sf.toSub).test(r.dst)
                      )
                      return rawRecords.length > 0 ? (
                        <table className="move-table flow-detail-table">
                          <thead><tr><th>原始組號</th><th>移入目的地</th></tr></thead>
                          <tbody>
                            {rawRecords.map((r, i) => (
                              <tr key={i}>
                                <td className="code-cell"><DstCell dst={r.src_group} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                                <td className="code-cell"><DstCell dst={r.dst} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      ) : (
                        <table className="move-table flow-detail-table">
                          <thead><tr><th>原始組號</th><th>移入目的地</th></tr></thead>
                          <tbody>
                            {sf.edges.map((e, i) => (
                              <tr key={i}>
                                <td className="code-cell"><span className="code-link" onClick={() => onSearch(e.from)}>{e.from}</span></td>
                                <td className="code-cell"><span className="code-link" onClick={() => onSearch(e.to)}>{e.to}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tech Classifier: fuzzy match tech description → IPC group code ──

function TechClassifier({ onSearch }) {
  const [techInput, setTechInput] = useState('')
  const [groupTitles, setGroupTitles] = useState(null)
  const [techKeywords, setTechKeywords] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [ipccatResults, setIpccatResults] = useState([])
  const [ipccatLoading, setIpccatLoading] = useState(false)

  useEffect(() => {
    // Load tech keywords FIRST (586KB) — enables Chinese search immediately
    fetch(`${import.meta.env.BASE_URL}tech_keywords.json`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) setTechKeywords(d)
        // THEN load group titles (7.8MB) in background — enables English search
        requestIdleCallback?.(() => {
          fetch(`${import.meta.env.BASE_URL}ipc_group_titles.json`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setGroupTitles(d) })
            .catch(() => {})
        }) ?? setTimeout(() => {
          fetch(`${import.meta.env.BASE_URL}ipc_group_titles.json`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setGroupTitles(d) })
            .catch(() => {})
        }, 100)
      })
      .catch(() => {})
  }, [])

  // Build TWO Fuse.js indexes:
  // 1. fuseEn: 81K group titles (for English keywords)
  // 2. fuseZh: 664 tech_keywords (for Chinese keywords, fast)
  const fuseEn = useMemo(() => {
    if (!groupTitles) return null
    const kwMap = {}
    if (techKeywords) techKeywords.forEach(t => { kwMap[t.code] = t })
    const corpus = groupTitles.map(g => {
      const kw = kwMap[g.sub]
      return { code: g.code, sub: g.sub, title: g.title, subName: getSubclassName(g.sub), label: kw?.label ?? '', keywords: kw?.keywords ?? [] }
    })
    return new Fuse(corpus, {
      keys: [{ name: 'code', weight: 5 }, { name: 'title', weight: 3 }, { name: 'subName', weight: 1.5 }, { name: 'label', weight: 1.5 }, { name: 'keywords', weight: 2 }],
      threshold: 0.5, minMatchCharLength: 1, ignoreLocation: true, includeScore: true, shouldSort: true,
    })
  }, [groupTitles, techKeywords])

  const fuseZh = useMemo(() => {
    if (!techKeywords) return null
    const corpus = techKeywords.map(t => ({
      code: t.code, sub: t.code, label: t.label, keywords: t.keywords,
      subName: getSubclassName(t.code), tipoDesc: t.tipoDesc || '',
    }))
    return new Fuse(corpus, {
      keys: [
        { name: 'code', weight: 5 },
        { name: 'label', weight: 3 },
        { name: 'keywords', weight: 4 },
        { name: 'subName', weight: 2 },
        { name: 'tipoDesc', weight: 2.5 },
      ],
      threshold: 0.4, minMatchCharLength: 2, ignoreLocation: true, includeScore: true, shouldSort: true,
    })
  }, [techKeywords])

  // === Improvement 3: Pre-compute TF-IDF for Chinese bigrams ===
  const zhIdf = useMemo(() => {
    if (!techKeywords) return null
    const docFreq = {} // bigram → how many subclasses contain it
    const N = techKeywords.length
    techKeywords.forEach(t => {
      const text = (t.tipoDesc || '') + (t.keywords || []).join('') + (t.label || '')
      const seen = new Set()
      for (let i = 0; i < text.length - 1; i++) {
        const bi = text.slice(i, i + 2)
        if (/^[\u4e00-\u9fff]{2}$/.test(bi) && !seen.has(bi)) {
          seen.add(bi)
          docFreq[bi] = (docFreq[bi] || 0) + 1
        }
      }
    })
    const idf = {}
    for (const [term, df] of Object.entries(docFreq)) {
      idf[term] = Math.log(N / df) // high IDF = rare = more distinctive
    }
    return { idf, maxIdf: Math.log(N) }
  }, [techKeywords])

  // === Improvement 3b: Pre-compute trigram IDF ===
  const zhTriIdf = useMemo(() => {
    if (!techKeywords) return null
    const docFreq = {}
    const N = techKeywords.length
    techKeywords.forEach(t => {
      const text = (t.tipoDesc || '') + (t.keywords || []).join('') + (t.label || '')
      const seen = new Set()
      for (let i = 0; i < text.length - 2; i++) {
        const tri = text.slice(i, i + 3)
        if (/^[\u4e00-\u9fff]{3}$/.test(tri) && !seen.has(tri)) {
          seen.add(tri)
          docFreq[tri] = (docFreq[tri] || 0) + 1
        }
      }
    })
    const idf = {}
    for (const [term, df] of Object.entries(docFreq)) {
      idf[term] = Math.log(N / df)
    }
    return idf
  }, [techKeywords])

  // === Improvement 5: Pre-compute bigram inverted index for speed ===
  const bigramIndex = useMemo(() => {
    if (!techKeywords) return null
    const idx = {} // bigram → Set of subclass indices
    techKeywords.forEach((t, i) => {
      const text = (t.tipoDesc || '') + (t.keywords || []).join('') + (t.label || '') + (getSubclassName(t.code) || '')
      const seen = new Set()
      for (let j = 0; j < text.length - 1; j++) {
        const bi = text.slice(j, j + 2)
        if (/^[\u4e00-\u9fff]{2}$/.test(bi) && !seen.has(bi)) {
          seen.add(bi)
          if (!idx[bi]) idx[bi] = []
          idx[bi].push(i)
        }
      }
    })
    return idx
  }, [techKeywords])

  // === Custom Chinese search engine (exact substring + bigram/trigram + TF-IDF + inverted index) ===
  const searchZhCustom = useCallback((q) => {
    if (!techKeywords || !zhIdf || !bigramIndex || !zhTriIdf) return []
    const { idf, maxIdf } = zhIdf

    // Extract Chinese bigrams and trigrams from query
    const qBigrams = []
    const qTrigrams = []
    for (let i = 0; i < q.length - 1; i++) {
      const bi = q.slice(i, i + 2)
      if (/^[\u4e00-\u9fff]{2}$/.test(bi)) qBigrams.push(bi)
    }
    for (let i = 0; i < q.length - 2; i++) {
      const tri = q.slice(i, i + 3)
      if (/^[\u4e00-\u9fff]{3}$/.test(tri)) qTrigrams.push(tri)
    }
    if (qBigrams.length === 0 && !/[\u4e00-\u9fff]/.test(q)) return []

    // === Improvement 3: Use inverted index to find candidate subclasses ===
    const candidateSet = new Set()
    qBigrams.forEach(bi => {
      if (bigramIndex[bi]) bigramIndex[bi].forEach(i => candidateSet.add(i))
    })
    // Also add exact substring candidates (scan all if query is short)
    if (q.length <= 6) {
      techKeywords.forEach((_, i) => candidateSet.add(i))
    }

    const results = []
    candidateSet.forEach(idx => {
      const t = techKeywords[idx]
      const allText = (t.tipoDesc || '') + '；' + (t.keywords || []).join('；') + '；' + (t.label || '') + '；' + (getSubclassName(t.code) || '')
      let score = 0
      let bigramHits = 0
      const matchedTerms = [] // Improvement 1: track what matched

      // --- Tiered exact matching with term frequency ---
      const kws = t.keywords || []
      const label = t.label || ''
      const subName = getSubclassName(t.code) || ''
      const tipoDesc = t.tipoDesc || ''
      const hasExact = q.length >= 2 && allText.includes(q)

      // Tier 1: query EXACTLY equals a keyword → strongest (e.g., "焊接" === keyword "焊接")
      const isExactKw = kws.some(k => k === q)
      // Tier 2: query exactly equals subclass name or label Chinese part
      const labelZhPart = label.split(/\s/)[0] || ''
      const isExactName = (subName.includes(q) && q.length >= 2) || labelZhPart === q
      // Tier 3: query is substring of a keyword (e.g., "焊接" in "超音波焊接")
      const isSubstrKw = !isExactKw && kws.some(k => k.includes(q) || q.includes(k))
      // Tier 4: query found in tipoDesc only
      const isInTipo = !isExactKw && !isSubstrKw && tipoDesc.includes(q)

      if (isExactKw) {
        score += 300; matchedTerms.push(q)
      } else if (isExactName) {
        score += 150; matchedTerms.push(q)
      } else if (isSubstrKw) {
        score += 100; matchedTerms.push(q)
      } else if (isInTipo) {
        score += 50; matchedTerms.push(q)
      }

      // Term frequency bonus: how often does the query appear in tipoDesc?
      if (q.length >= 2 && tipoDesc.length > 0) {
        const tf = (tipoDesc.match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
        score += Math.min(tf * 3, 30) // up to 30 pts for high frequency
      }

      // --- Bigram co-occurrence with TF-IDF weighting ---
      if (qBigrams.length > 0) {
        let idfSum = 0
        qBigrams.forEach(bi => {
          if (allText.includes(bi)) {
            bigramHits++
            idfSum += idf[bi] || 1
          }
        })
        const cov = bigramHits / qBigrams.length
        const avgIdf = bigramHits > 0 ? idfSum / bigramHits / maxIdf : 0
        score += cov * 50
        score += cov * avgIdf * 30
      }

      // --- Improvement 4: Trigram matching (solves G04C vs H02K) ---
      if (qTrigrams.length > 0) {
        let triHits = 0
        let triIdfSum = 0
        qTrigrams.forEach(tri => {
          if (allText.includes(tri)) {
            triHits++
            triIdfSum += zhTriIdf[tri] || 1
          }
        })
        const triCov = triHits / qTrigrams.length
        const triAvgIdf = triHits > 0 ? triIdfSum / triHits / maxIdf : 0
        score += triCov * 40 // trigram coverage bonus
        score += triCov * triAvgIdf * 25 // trigram TF-IDF bonus
      }

      // --- Collect matched keywords for display ---
      if (bigramHits > 0) {
        const zhKws = kws.filter(k => /[\u4e00-\u9fff]{2,}/.test(k) && k.length <= 8)
        zhKws.forEach(kw => {
          const shared = qBigrams.filter(bi => kw.includes(bi)).length
          if (q.includes(kw) || kw.includes(q) || shared >= Math.max(2, Math.ceil(qBigrams.length * 0.4))) {
            if (!matchedTerms.includes(kw) && kw !== q) matchedTerms.push(kw)
          }
        })
        if (labelZhPart && labelZhPart.length >= 2 && /[\u4e00-\u9fff]/.test(labelZhPart)) {
          const shared = qBigrams.filter(bi => labelZhPart.includes(bi)).length
          if (shared >= 1 && !matchedTerms.includes(labelZhPart)) matchedTerms.push(labelZhPart)
        }
      }

      // Short queries (≤10 bigrams): 40% coverage; long text: at least 3 bigrams
      const coverage = qBigrams.length > 0 ? bigramHits / qBigrams.length : 0
      const passFilter = hasExact || (qBigrams.length <= 10 ? coverage >= 0.4 : bigramHits >= 3)
      if (score > 0 && passFilter) {
        results.push({
          item: { code: t.code, sub: t.code, label: t.label, subName: getSubclassName(t.code),
                  matchReason: matchedTerms.slice(0, 3).join('、') },
          score: 1 / (1 + score),
          src: 'zhCustom',
        })
      }
    })
    results.sort((a, b) => a.score - b.score)
    return results.slice(0, 10)
  }, [techKeywords, zhIdf, zhTriIdf, bigramIndex])

  useEffect(() => {
    const q = techInput.trim()
    if (!q) { setSuggestions([]); return }
    // Long English text → IPCCAT only; long Chinese text → still use our engine
    const isZh = /[\u4e00-\u9fff]/.test(q)
    if (q.length > 50 && !isZh) { setSuggestions([]); return }
    const timer = setTimeout(() => {
      const allResults = []

      // Chinese: custom engine (exact substring + bigram + TF-IDF) takes priority
      if (isZh) {
        const customHits = searchZhCustom(q)
        allResults.push(...customHits)
        // Fuse.js as fallback — only add if custom found few results, with heavy penalty
        if (fuseZh && customHits.length < 4) {
          const customSubs = new Set(customHits.map(h => h.item.sub))
          fuseZh.search(q, { limit: 6 }).forEach(r => {
            if (!customSubs.has(r.item.sub)) { // skip duplicates
              allResults.push({ item: r.item, score: Math.min(r.score + 0.5, 1), src: 'zh' })
            }
          })
        }
      } else {
        // English: use Fuse.js indexes directly
        if (fuseZh) {
          fuseZh.search(q, { limit: 10 }).forEach(r => {
            allResults.push({ item: r.item, score: r.score, src: 'zh' })
          })
        }
        if (fuseEn) {
          fuseEn.search(q, { limit: 20 }).forEach(r => {
            allResults.push({ item: r.item, score: r.score, src: 'en' })
          })
        }
      }

      // Sort by score (lower = better), deduplicate by subclass
      allResults.sort((a, b) => (a.score || 1) - (b.score || 1))
      const seenSub = new Set()
      const deduped = allResults.filter(({ item }) => {
        if (seenSub.has(item.sub)) return false
        seenSub.add(item.sub)
        return true
      }).slice(0, 6)
      setSuggestions(deduped.map(({ item, score }) => ({
        code: item.code, title: item.label || item.title || item.subName, subName: item.subName, score, hits: 1,
        matchReason: item.matchReason || '',
      })))
    }, isZh ? 100 : 300) // Chinese is fast (no Fuse.js overhead), shorter debounce
    return () => clearTimeout(timer)
  }, [techInput, fuseEn, fuseZh, searchZhCustom])

  // IPCCAT API call — English only (Chinese accuracy too low ~71%, misleading users)
  useEffect(() => {
    const q = techInput.trim()
    const hasChinese = /[^\x00-\x7F]/.test(q)
    if (!q || q.length < 3 || hasChinese || q.length <= 50) { setIpccatResults([]); return }

    setIpccatLoading(true)
    const timer = setTimeout(() => {
      const encoded = encodeURIComponent(q)
      // Auto-detect language: if >30% non-ASCII chars → Chinese, else English
      const nonAscii = (q.match(/[^\x00-\x7F]/g) || []).length
      const lang = nonAscii > q.length * 0.3 ? 'zh' : 'en'
      const ipccatUrl = `https://ipcpub.wipo.int/search/ipccat/20260101/${lang}/subgroup/5/${encoded}/`
      // Try multiple CORS proxies as fallback
      const proxies = [
        url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      ]
      const tryFetch = (idx) => {
        if (idx >= proxies.length) { setIpccatResults([]); setIpccatLoading(false); return }
        fetch(proxies[idx](ipccatUrl))
          .then(r => { if (!r.ok) throw new Error(r.status); return r.text() })
          .then(processHtml)
          .catch(() => tryFetch(idx + 1))
      }
      const processHtml = (html) => {
          const codes = []
          const hrefRe = /\/([A-H]\d{2}[A-Z])(\d{4})(\d{6})\//g
          let m
          while ((m = hrefRe.exec(html)) !== null) {
            const sub = m[1]
            const main = m[2].replace(/^0+/, '') || '0'
            const subgRaw = m[3]
            const subg = subgRaw.replace(/0+$/, '')
            const decoded = `${sub} ${main}/${subg.length < 2 ? subgRaw.slice(0, 2) : subg}`
            if (!codes.includes(decoded)) codes.push(decoded)
          }
          setIpccatResults(codes)
          setIpccatLoading(false)
      }
      tryFetch(0)
    }, 800) // debounce 800ms

    return () => clearTimeout(timer)
  }, [techInput])

  if (!techKeywords) return null // Need at least techKeywords for Chinese search

  const isAbstract = techInput.trim().length > 50
  const hasChinese = /[^\x00-\x7F]/.test(techInput.trim())
  const showIpccat = isAbstract && !hasChinese

  return (
    <div className="tech-classifier">
      <div className="tech-classifier-header">
        技術特徵重分類
        {isAbstract && <span style={{ fontSize: '0.72rem', color: '#6c757d', marginLeft: 8 }}>摘要分析模式</span>}
      </div>
      <div className="tech-classifier-body">
        <textarea
          className="tech-input tech-textarea"
          placeholder="輸入中文關鍵字（如：太陽能電池）或貼入英文摘要進行 AI 分類..."
          value={techInput}
          onChange={e => setTechInput(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          rows={isAbstract ? 4 : 1}
        />
        {suggestions.length > 0 && (
          <div className="tech-suggestions">
            {suggestions.map(s => (
              <div key={s.code} className="tech-suggestion-item" onClick={() => { onSearch(s.code.slice(0, 4)); setTechInput(''); setSuggestions([]); setIpccatResults([]) }}>
                <span className="tech-sugg-code">{s.code}</span>
                <span className="tech-sugg-label">{s.title}</span>
                {s.matchReason && <span className="tech-sugg-reason">← {s.matchReason}</span>}
              </div>
            ))}
          </div>
        )}
        {showIpccat && (
          <div style={{ marginTop: 8 }}>
            <div className="tech-result-label">WIPO IPCCAT AI 預測</div>
            {ipccatLoading ? (
              <div className="tech-ipccat-loading">正在查詢 WIPO IPCCAT...</div>
            ) : ipccatResults.length > 0 ? (
              <div className="tech-suggestions">
                {ipccatResults.map((code, i) => {
                  const title = getGroupTitle(code)
                  return (
                    <div key={code} className="tech-suggestion-item" onClick={() => { onSearch(code.slice(0, 4)); setTechInput(''); setIpccatResults([]) }}>
                      <span className="tech-sugg-code">{code}</span>
                      <span className="tech-sugg-label">{title || code}</span>
                      <span className="tech-sugg-rank">#{i + 1}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="tech-ipccat-loading">貼入超過 50 字的英文摘要後自動查詢 WIPO AI 分類</div>
            )}
          </div>
        )}
        {isAbstract && hasChinese && (
          <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#e67e22' }}>
            ⚠️ WIPO IPCCAT 中文準確率偏低，建議貼入英文摘要以取得精確的 IPC 五階分類
          </div>
        )}
      </div>
    </div>
  )
}

const EXAMPLES = ['H01L', 'B01J', 'G06K', 'B29D', 'H10B', 'B81B', 'G06Q', 'E21B', 'F24S', 'C40B']

// Read ?ipc= and ?ver= from URL
function getIpcFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return (params.get('ipc') || '').trim().toUpperCase()
}
function getVerFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return params.get('ver') || ''
}

export default function App() {
  const initialIpc = getIpcFromUrl()
  const initialVer = getVerFromUrl()
  const [query, setQuery] = useState(initialIpc)
  const [input, setInput] = useState(initialIpc)
  const [data, setData] = useState(null)
  const [groupIndex, setGroupIndex] = useState(null)
  const [flowGraph, setFlowGraph] = useState(null)
  const [ipcGroups, setIpcGroups] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [showSugg, setShowSugg] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState(initialVer) // '' = all versions

  const inputRef = useRef(null)
  const suggRef = useRef(null)
  const skipPushRef = useRef(false) // avoid pushing state on popstate

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}ipc_data.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => {
        setData(d)
        setGroupIndex(buildGroupIndex(d.subclass_index))
        setFlowGraph(buildFlowGraph(d.subclass_index))
        setLoading(false)
        // Load auxiliary data (non-blocking)
        fetch(`${import.meta.env.BASE_URL}ipc_groups.json`)
          .then(r => r.ok ? r.json() : null)
          .then(g => { if (g) setIpcGroups(g) })
          .catch(() => {})
        fetch(`${import.meta.env.BASE_URL}ipc_names.json`)
          .then(r => r.ok ? r.json() : null)
          .then(n => { if (n) SUBCLASS_NAMES = n })
          .catch(() => {})
        fetch(`${import.meta.env.BASE_URL}ipc_group_titles.json`)
          .then(r => r.ok ? r.json() : null)
          .then(arr => {
            if (arr) arr.forEach(g => {
              GROUP_TITLES[g.code] = g.title
              if (g.zh) GROUP_TITLES_ZH[g.code] = g.zh
            })
          })
          .catch(() => {})
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  // Build set of subclasses that have records in the selected version
  const versionFilteredSubs = useMemo(() => {
    if (!data || !selectedVersion) return null
    const subs = new Set()
    Object.entries(data.subclass_index).forEach(([sub, entry]) => {
      const hasDonated = (entry.donated || []).some(r => r.version === selectedVersion)
      const hasReceived = (entry.received || []).some(r => r.version === selectedVersion)
      if (hasDonated || hasReceived) subs.add(sub)
    })
    return subs
  }, [data, selectedVersion])

  useEffect(() => {
    if (!data || !groupIndex || input.length < 1) {
      setSuggestions([])
      return
    }
    const up = input.toUpperCase()

    if (isGroupQuery(up)) {
      // Group-level autocomplete
      const normalized = normalizeGroupQuery(up)
      let matches = Object.keys(groupIndex)
        .filter(k => k.startsWith(normalized))
      if (versionFilteredSubs) {
        matches = matches.filter(k => versionFilteredSubs.has(k.slice(0, 4)))
      }
      setSuggestions(matches.sort().slice(0, 10))
    } else {
      // Subclass-level autocomplete (include introduced_in and deprecated_to codes)
      const allSubs = new Set([
        ...Object.keys(data.subclass_index),
        ...Object.keys(data.introduced_in || {}),
        ...Object.keys(data.deprecated_to || {})
      ])
      let all = [...allSubs].sort()
      if (versionFilteredSubs) {
        all = all.filter(k => versionFilteredSubs.has(k))
      }
      const matches = all.filter(k => k.startsWith(up)).slice(0, 10)
      setSuggestions(matches)
    }
  }, [input, data, groupIndex, versionFilteredSubs])

  useEffect(() => {
    function handleClick(e) {
      if (
        suggRef.current && !suggRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setShowSugg(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Sync URL with search state
  function pushUrl(code, ver) {
    if (skipPushRef.current) { skipPushRef.current = false; return }
    const base = window.location.pathname
    const params = new URLSearchParams()
    if (code) params.set('ipc', code)
    if (ver) params.set('ver', ver)
    const qs = params.toString()
    const url = qs ? `${base}?${qs}` : base
    window.history.pushState({ ipc: code, ver: ver || '' }, '', url)
  }

  // Listen for browser back/forward
  useEffect(() => {
    function onPopState(e) {
      const ipc = e.state?.ipc || getIpcFromUrl()
      const ver = e.state?.ver || getVerFromUrl()
      skipPushRef.current = true
      setQuery(ipc)
      setInput(ipc)
      setSelectedVersion(ver)
      setShowSugg(false)
    }
    window.addEventListener('popstate', onPopState)
    window.history.replaceState({ ipc: initialIpc, ver: initialVer }, '', window.location.href)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function handleSearch(value) {
    const raw = (value !== undefined ? value : input).trim().toUpperCase()
    if (!raw) return
    const v = isGroupQuery(raw) ? normalizeGroupQuery(raw) : raw
    setQuery(v)
    setInput(v)
    setShowSugg(false)
    pushUrl(v, selectedVersion)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSearch()
    if (e.key === 'Escape') setShowSugg(false)
  }

  function handleSuggClick(code) {
    setInput(code)
    setQuery(code)
    setShowSugg(false)
    pushUrl(code, selectedVersion)
  }

  // Compute result
  let result = null
  if (data && groupIndex && query) {
    const up = query.toUpperCase()

    if (isGroupQuery(up)) {
      // Group-level search
      const normalized = normalizeGroupQuery(up)
      if (groupIndex[normalized]) {
        result = { type: 'group-exact', code: normalized }
      } else {
        // Fallback: check if code falls within a range in subclass records
        const sub = normalized.slice(0, 4)
        const entry = data.subclass_index[sub]
        if (entry) {
          const fallbackEntries = []
          const rangeRe = /([A-H]\d{2}[A-Z]\s+\d+\/\d+)\s*-\s*(\d+\/\d+)/g
          const allRecs = [...(entry.donated || []), ...(entry.received || [])]
          for (const rec of allRecs) {
            const fields = [rec.dst, rec.src_group, rec.from].filter(Boolean)
            for (const field of fields) {
              let m
              while ((m = rangeRe.exec(field)) !== null) {
                const rangeStart = m[1]
                const rangeEndGroup = m[2]
                if (rangeStart.slice(0, 4) === sub) {
                  // Check if normalized falls within this range
                  const qGroup = normalized.split(/\s+/)[1]
                  const sGroup = rangeStart.split(/\s+/)[1]
                  if (qGroup >= sGroup && qGroup <= rangeEndGroup) {
                    // Found a range containing this code
                    const type = rec.src_group ? 'donated' : 'received'
                    fallbackEntries.push({ type, subclass: sub, record: rec })
                  }
                }
              }
              rangeRe.lastIndex = 0
            }
          }
          if (fallbackEntries.length > 0) {
            // Deduplicate and inject into groupIndex for this session
            const seen = new Set()
            groupIndex[normalized] = fallbackEntries.filter(e => {
              const key = JSON.stringify(e.record)
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
            result = { type: 'group-exact', code: normalized }
          }
        }
        if (!result) {
          const matches = Object.keys(groupIndex)
            .filter(k => k.startsWith(normalized))
            .sort()
          result = { type: 'group-prefix', prefix: normalized, matches }
        }
      }
    } else {
      // Subclass-level search (existing logic)
      if (data.subclass_index[up]) {
        result = { type: 'exact', code: up }
      } else {
        const depr = data.deprecated_to[up]
        const intro = data.introduced_in[up]
        if (depr || intro) {
          result = { type: 'exact', code: up }
        } else {
          result = { type: 'prefix', prefix: up }
        }
      }
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">IPC 分類代碼歷史查詢</h1>
        <p className="app-subtitle">
          查詢國際專利分類（IPC）各版本之跨分類異動記錄，涵蓋 1994–2026 年共 24 個版本
        </p>
      </header>

      <main className="app-main">
        <div className="search-box">
          <div className="search-input-wrap">
            <input
              ref={inputRef}
              className="search-input"
              type="text"
              placeholder="輸入 IPC 代碼，例如 H01L、H01L 21 或 H01L 21/677"
              value={input}
              onChange={e => { setInput(e.target.value); setShowSugg(true) }}
              onKeyDown={handleKeyDown}
              onFocus={() => suggestions.length > 0 && setShowSugg(true)}
              autoComplete="off"
              spellCheck={false}
            />
            <select className="version-select" value={selectedVersion} onChange={e => setSelectedVersion(e.target.value)}>
              <option value="">全部版本</option>
              {data && (() => {
                const vers = new Set()
                Object.values(data.subclass_index).forEach(e => {
                  ;(e.donated || []).forEach(r => vers.add(r.version))
                  ;(e.received || []).forEach(r => vers.add(r.version))
                })
                return [...vers].sort((a, b) => versionOrder(a) - versionOrder(b)).map(v => (
                  <option key={v} value={v}>{v}</option>
                ))
              })()}
            </select>
            <button className="search-btn" onClick={() => handleSearch()} disabled={loading}>
              搜尋
            </button>
            {showSugg && suggestions.length > 0 && (
              <ul className="suggestions" ref={suggRef}>
                {suggestions.map(code => (
                  <li key={code} className="suggestion-item" onMouseDown={() => handleSuggClick(code)}>
                    <span className="sugg-code">{code}</span>
                    {getSubclassName(code.slice(0, 4)) && !isGroupQuery(code) && (
                      <span className="sugg-name">{getSubclassName(code)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <TechClassifier onSearch={handleSearch} />

        <div className="example-chips">
          <span className="example-label">範例：</span>
          {EXAMPLES.map(ex => (
            <button key={ex} className="chip" onClick={() => handleSearch(ex)}>
              {ex}
            </button>
          ))}
        </div>

        <div className="result-area">
          {loading && <div className="loading">載入資料中…</div>}
          {error && <div className="error-msg">資料載入失敗：{error}</div>}
          {!loading && !error && !query && (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <p>輸入 IPC 分類代碼（如 <code>H01L</code>）查詢其歷史異動記錄</p>
              <p className="empty-sub">
                支援分類代碼（如 <code>H01L</code>）、組號（如 <code>H01L 21/677</code>）或前綴搜尋（如 <code>H01</code>、<code>H01L 21</code>）
              </p>
            </div>
          )}
          {!loading && !error && result && result.type === 'exact' && (
            <SubclassCard code={result.code} data={data} onSearch={handleSearch} ipcGroups={ipcGroups} flowGraph={flowGraph} selectedVersion={selectedVersion} />
          )}
          {!loading && !error && result && result.type === 'prefix' && (
            <PrefixList prefix={result.prefix} data={data} onSearch={handleSearch} selectedVersion={selectedVersion} />
          )}
          {!loading && !error && result && result.type === 'group-exact' && (
            <GroupCard code={result.code} groupIndex={groupIndex} onSearch={handleSearch} ipcGroups={ipcGroups} />
          )}
          {!loading && !error && result && result.type === 'group-prefix' && (
            <GroupList
              prefix={result.prefix}
              matches={result.matches}
              groupIndex={groupIndex}
              onSelect={code => { setInput(code); setQuery(code) }}
            />
          )}
        </div>
      </main>

      <footer className="app-footer">
        資料來源：WIPO IPC 調和表（IPC v6 → 2026.01）｜
        <a href="https://github.com/ronjuan83/ipc-search" target="_blank" rel="noreferrer">GitHub</a>
        ｜<a href={`${import.meta.env.BASE_URL}reclassify-demo.html`}>批次重分類 Demo</a>
      </footer>
    </div>
  )
}
