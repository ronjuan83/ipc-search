import { useState, useEffect, useRef, useMemo } from 'react'
import './App.css'
import { IpcNamesProvider, useIpcNames } from './context/IpcNamesContext'
import { normalizeGroupQuery, isGroupQuery } from './utils/ipcParser'
import { buildGroupIndex } from './utils/groupIndex'
import { buildFlowGraph, traceFlow, traceSubclassFlow, versionOrder } from './utils/flowGraph'
import { CodeLink, DstCell } from './components/DstCell'
import { StatusBadge } from './components/StatusBadge'
import { TechClassifier } from './components/TechClassifier'


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
                      <span className="flow-sub-chip flow-sub-chip-sm" style={{ borderColor: subColors[sf.fromSub], color: subColors[sf.fromSub] }}
                            onClick={() => onSearch(sf.fromSub)}>{sf.fromSub}</span>
                      <span className="flow-arrow-sm">→</span>
                      <span className="flow-sub-chip flow-sub-chip-sm" style={{ borderColor: subColors[sf.toSub], color: subColors[sf.toSub] }}
                            onClick={() => onSearch(sf.toSub)}>{sf.toSub}</span>
                      <span className="flow-count-sm">{sf.count}</span>
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
  const { getSubclassName } = useIpcNames()
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
        <div className="card-header-actions">
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
  const { getSubclassName } = useIpcNames()
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
        <div className="group-card-badges">
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
  const { getSubclassName } = useIpcNames()
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
            <div key={code} className={`prefix-item ${depr ? 'is-deprecated' : ''}`} onClick={() => onSearch(code)}>
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

const initialIpc = getIpcFromUrl()
const initialVer = getVerFromUrl()

function AppInner() {
  const { getSubclassName, loadGroupTitles } = useIpcNames()
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
    const base = import.meta.env.BASE_URL
    Promise.all([
      fetch(`${base}ipc_data.json`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),
      fetch(`${base}ipc_groups.json`).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([d, g]) => {
        setData(d)
        setGroupIndex(buildGroupIndex(d.subclass_index))
        setFlowGraph(buildFlowGraph(d.subclass_index))
        if (g) setIpcGroups(g)
        setLoading(false)
        if (initialIpc) loadGroupTitles() // preload if URL has query
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

  // Memoize version dropdown options (avoid re-computing on every render)
  const versionOptions = useMemo(() => {
    if (!data) return []
    const vers = new Set()
    Object.values(data.subclass_index).forEach(e => {
      ;(e.donated || []).forEach(r => vers.add(r.version))
      ;(e.received || []).forEach(r => vers.add(r.version))
    })
    return [...vers].sort((a, b) => versionOrder(a) - versionOrder(b))
  }, [data])

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
    loadGroupTitles() // lazy load 7.8MB group titles on first search
    const v = isGroupQuery(raw) ? normalizeGroupQuery(raw) : raw
    setQuery(v)
    setInput(v)
    setShowSugg(false)
    pushUrl(v, selectedVersion)
    // Scroll to results after a short delay for rendering
    setTimeout(() => {
      const card = document.querySelector('.subclass-card, .prefix-results')
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
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
            const deduped = fallbackEntries.filter(e => {
              const key = JSON.stringify(e.record)
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
            setGroupIndex(prev => ({ ...prev, [normalized]: deduped }))
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
    <>
    <nav className="site-nav">
      <div className="site-nav-inner">
        <span className="site-nav-brand">IPC 工具</span>
        <a href={import.meta.env.BASE_URL} className="site-nav-link active">歷史查詢</a>
        <a href={`${import.meta.env.BASE_URL}reclassify.html`} className="site-nav-link">批次重分類</a>
        <a href={`${import.meta.env.BASE_URL}reclassify-class.html`} className="site-nav-link">重分類二階</a>
        <a href={`${import.meta.env.BASE_URL}reclassify-subclass.html`} className="site-nav-link">重分類三階</a>
        <a href="https://github.com/ronjuan83/ipc-conversion" target="_blank" rel="noreferrer" className="site-nav-github">GitHub</a>
      </div>
    </nav>
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
              aria-label="搜尋 IPC 分類代碼"
            />
            <select className="version-select" value={selectedVersion} onChange={e => setSelectedVersion(e.target.value)} aria-label="選擇 IPC 版本">
              <option value="">全部版本</option>
              {versionOptions.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <button className="search-btn" onClick={() => handleSearch()} disabled={loading} aria-label="搜尋">
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
        資料來源：WIPO IPC 調和表（IPC v6 → 2026.01）｜ 更新日期：2026-04-06
      </footer>
    </div>
    </>
  )
}

export default function App() {
  return (
    <IpcNamesProvider>
      <AppInner />
    </IpcNamesProvider>
  )
}
