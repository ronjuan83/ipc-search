import { useState, useEffect, useRef } from 'react'
import './App.css'

// Known subclass descriptions (partial — covers commonly searched ones)
const SUBCLASS_NAMES = {
  A01B: '農業；土壤耕作',
  A01C: '種植；播種；施肥',
  A01D: '收割；割草',
  A01F: '農產品加工；脫穀',
  A01G: '園藝；蔬菜、花卉、稻米、果樹、葡萄栽培',
  A01H: '植物新品種',
  A01K: '畜牧業；捕魚；誘捕',
  A01L: '蹄鐵',
  A01M: '病蟲害防治',
  A01N: '殺蟲劑；除草劑',
  A61B: '診斷；手術；識別',
  A61C: '牙科',
  A61F: '可植入血管的濾器；假體；矯形器',
  A61K: '醫用製劑',
  A61L: '材料或物品滅菌',
  A61M: '將介質引入人體或從人體取出',
  A61N: '電療法；磁療法；放射療法',
  A61P: '化合物或藥物製劑的治療活性',
  B01D: '分離',
  B01J: '化學或物理過程；催化劑',
  B02C: '碎裂、研磨或粉碎',
  B21D: '金屬板材的加工',
  B22F: '金屬粉末的加工',
  B23K: '焊接；釺焊或脫焊',
  B29B: '橡膠或塑膠的預處理',
  B29C: '橡膠或塑膠的成型加工',
  B29D: '由橡膠或塑膠製造特定形狀製品',
  B32B: '層狀產品',
  B41J: '打字機；選擇性印刷',
  B60L: '電動車輛的電氣設備',
  B60W: '混合動力車輛',
  B62D: '機動車輛；拖車',
  B81B: '微結構裝置或系統',
  B81C: '微結構裝置或系統的製造或處理',
  C01B: '非金屬元素；無機化合物',
  C01G: '含金屬元素的化合物',
  C07D: '雜環化合物',
  C08F: '高分子化合物：含碳-碳不飽和鍵的單體聚合物',
  C08G: '高分子化合物：其他聚合物',
  C08L: '高分子化合物的組合物',
  C09K: '各種用途的材料',
  C10L: '燃料；潤滑油',
  C12N: '微生物或酶；組合物',
  C12Q: '包含酶或微生物的測量或測試',
  C22C: '合金',
  C23C: '對金屬材料的塗覆',
  C23F: '非機械法去除金屬材料',
  C30B: '單晶生長',
  C40B: '組合化學技術',
  E01D: '橋樑',
  E04G: '脚手架；模板；支柱',
  E21B: '地層鑽探；採礦',
  F02M: '向燃燒發動機供給燃料',
  F24J: '其他產熱或使用熱的方法和設備',
  F24S: '太陽能集熱器',
  G01C: '測量距離、水準或方位',
  G01N: '調查或分析材料的物理或化學性質',
  G01S: '無線電定向；無線電導航',
  G06C: '數字計算機（機械型）',
  G06E: '光學計算機',
  G06F: '電數字數據處理',
  G06G: '類比計算機',
  G06K: '圖形數據的讀取；數據呈現；記錄載體',
  G06N: '基於特定計算模型的計算方案',
  G06Q: '數據處理系統或方法（行政、商業、金融、管理）',
  G06T: '一般圖像數據處理或生成',
  G06V: '圖像或視頻識別或理解',
  G11B: '基於記錄載體與換能器之間相對運動的信息存儲',
  G11C: '靜態存儲器',
  H01L: '半導體器件',
  H01M: '電池；燃料電池；儲氫',
  H01Q: '天線',
  H01R: '電連接器',
  H01S: '利用激光或激射原理的器件',
  H02J: '供電或配電的電路裝置',
  H02M: '電力轉換裝置',
  H04B: '傳輸',
  H04L: '數字信息的傳輸',
  H04N: '圖像通信',
  H04W: '無線通信網絡',
  H10B: '半導體存儲器件',
  H10K: '有機電子器件',
}

function getSubclassName(code) {
  return SUBCLASS_NAMES[code] || ''
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

function CodeLink({ text, onSearch }) {
  return (
    <span className="code-link" onClick={() => onSearch(text)}>
      {text}
    </span>
  )
}

function DstCell({ dst, onSearch, ipcGroups }) {
  const segments = parseDst(dst)
  const result = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.link) {
      // Check if next segment is a range suffix like " - 5/00"
      const next = segments[i + 1]
      if (next && !next.link && next.text.trim().startsWith('-') && ipcGroups) {
        const expanded = expandRange(seg.text, next.text.trim(), ipcGroups)
        if (expanded && expanded.length > 1) {
          // Replace range with expanded individual codes
          result.push(
            <span key={i} className="expanded-range">
              {expanded.map((code, j) => (
                <span key={j}>
                  {j > 0 && ', '}
                  <CodeLink text={code} onSearch={onSearch} />
                </span>
              ))}
            </span>
          )
          i++ // skip the range suffix
          continue
        }
      }
      result.push(<CodeLink key={i} text={seg.text} onSearch={onSearch} />)
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
      // Index by dst: extract individual codes from dst string
      const dst = (rec.dst || '').trim()
      // Only index single exact codes (not ranges)
      dst.split(',').forEach(part => {
        const t = part.trim().split(' - ')[0].trim()
        if (SINGLE_RE.test(t)) {
          if (!idx[t]) idx[t] = []
          idx[t].push({ type: 'received', subclass, record: rec })
        }
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
                <th>來源分類</th>
                <th>原始組號</th>
                <th>移入目的地</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="code-cell source-sub"><CodeLink text={item.src_sub} onSearch={onSearch} /></td>
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

function SubclassCard({ code, data, onSearch, onFlowView, ipcGroups }) {
  const entry = data.subclass_index[code] || {}
  const donated = entry.donated || []
  const received = entry.received || []
  const name = getSubclassName(code)
  const intro = data.introduced_in[code]
  const depr = data.deprecated_to[code]
  const deprAt = data.deprecated_at && data.deprecated_at[code]

  return (
    <div className="subclass-card">
      <div className="card-header">
        <div className="card-title-row">
          <span className="subclass-code">{code}</span>
          {name && <span className="subclass-name">{name}</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <StatusBadge code={code} data={data} onSearch={onSearch} />
          {onFlowView && (donated.length > 0 || received.length > 0) && (
            <button className="flow-btn" onClick={() => onFlowView(code)}>查看流變</button>
          )}
        </div>
      </div>

      {intro && (
        <div className="info-row">
          <span className="info-label">引入版本：</span>
          <span className="info-value">{intro}</span>
          <span className="info-note">（此分類在 IPC 第 6 版以前不存在）</span>
        </div>
      )}
      {depr && (
        <div className="info-row">
          <span className="info-label">廢棄去向：</span>
          <span className="info-value">{Array.isArray(depr) ? depr.join(', ') : depr}</span>
          {deprAt && <span className="info-note">（於 {deprAt} 版廢棄）</span>}
        </div>
      )}

      {donated.length === 0 && received.length === 0 ? (
        <div className="no-moves">此分類在現有記錄中無跨分類異動。</div>
      ) : (
        <>
          <DonatedSection donated={donated} onSearch={onSearch} ipcGroups={ipcGroups} />
          <ReceivedSection received={received} onSearch={onSearch} ipcGroups={ipcGroups} />
        </>
      )}
    </div>
  )
}

// Card for exact group-level code (4th/5th level)
function GroupCard({ code, groupIndex, onSearch, onFlowView, ipcGroups }) {
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
          {onFlowView && (donated.length > 0 || received.length > 0) && (
            <button className="flow-btn" onClick={() => onFlowView(code)}>查看流變</button>
          )}
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
                      <td className="code-cell"><DstCell dst={e.record.dst} onSearch={onSearch} /></td>
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
                    <th>來源分類</th>
                    <th>原始組號</th>
                    <th>移入目的地</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e, i) => (
                    <tr key={i}>
                      <td className="code-cell source-sub"><CodeLink text={e.record.src_sub} onSearch={onSearch} /></td>
                      <td className="code-cell"><DstCell dst={e.record.from} onSearch={onSearch} ipcGroups={ipcGroups} /></td>
                      <td className="code-cell"><DstCell dst={e.record.dst} onSearch={onSearch} /></td>
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

function PrefixList({ prefix, data, onSearch }) {
  const matches = Object.keys(data.subclass_index)
    .filter(k => k.startsWith(prefix.toUpperCase()))
    .sort()

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

// Parse version string "1995.01→2000.01" into the target version for ordering
function versionOrder(verStr) {
  const m = verStr.match(/(\d{4})\.(\d{2})→(\d{4})\.(\d{2})/)
  if (m) return parseInt(m[3]) * 100 + parseInt(m[4])
  return 0
}

function FlowChart({ code, flowGraph, data, onSearch, onBack }) {
  const isSubclass = /^[A-H]\d{2}[A-Z]$/.test(code)
  const flow = isSubclass
    ? traceSubclassFlow(code, flowGraph, data.subclass_index)
    : traceFlow(code, flowGraph)

  if (flow.edges.length === 0) {
    return (
      <div className="subclass-card">
        <div className="card-header">
          <span className="subclass-code">{code}</span>
          <button className="flow-back-btn" onClick={onBack}>← 返回</button>
        </div>
        <div className="no-moves">此代碼在現有記錄中無跨版本流變紀錄。</div>
      </div>
    )
  }

  // Group edges by version, sorted chronologically
  const byVersion = {}
  flow.edges.forEach(e => {
    if (!byVersion[e.version]) byVersion[e.version] = []
    byVersion[e.version].push(e)
  })
  const sortedVersions = Object.keys(byVersion).sort((a, b) => versionOrder(a) - versionOrder(b))

  // Collect unique subclasses for color coding
  const subclasses = new Set()
  flow.nodes.forEach(n => subclasses.add(n.code.slice(0, 4)))

  const subColors = {}
  const palette = ['#0d6efd', '#dc3545', '#198754', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c', '#6610f2', '#ffc107', '#17a2b8']
  let ci = 0
  subclasses.forEach(s => { subColors[s] = palette[ci++ % palette.length] })

  return (
    <div className="subclass-card flow-card">
      <div className="card-header">
        <div className="card-title-row">
          <span className="subclass-code">{code}</span>
          {getSubclassName(code.slice(0, 4)) && (
            <span className="subclass-name">
              {isSubclass ? getSubclassName(code) : `所屬分類：${code.slice(0, 4)} ${getSubclassName(code.slice(0, 4))}`}
            </span>
          )}
        </div>
        <button className="flow-back-btn" onClick={onBack}>← 返回</button>
      </div>

      <div className="flow-legend">
        {[...subclasses].map(s => (
          <span key={s} className="flow-legend-item" style={{ borderColor: subColors[s], color: subColors[s] }}>
            {s}{getSubclassName(s) ? ` ${getSubclassName(s)}` : ''}
          </span>
        ))}
      </div>

      <div className="flow-timeline-wrap">
        <div className="flow-timeline">
          {sortedVersions.map(ver => (
            <div key={ver} className="flow-version-col">
              <div className="flow-version-header">{ver}</div>
              <div className="flow-edges">
                {byVersion[ver].map((e, i) => (
                  <div key={i} className="flow-edge">
                    <span
                      className="flow-node"
                      style={{ borderLeftColor: subColors[e.from.slice(0, 4)] }}
                      onClick={() => onSearch(e.from)}
                    >
                      {e.from}
                    </span>
                    <span className="flow-arrow">→</span>
                    <span
                      className="flow-node"
                      style={{ borderLeftColor: subColors[e.to.slice(0, 4)] }}
                      onClick={() => onSearch(e.to)}
                    >
                      {e.to}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flow-stats">
        共 {flow.nodes.length} 個節點、{flow.edges.length} 筆異動、橫跨 {sortedVersions.length} 個版本
      </div>
    </div>
  )
}

const EXAMPLES = ['H01L', 'B01J', 'G06K', 'B29D', 'H10B', 'B81B', 'G06Q', 'E21B', 'F24S', 'C40B']

export default function App() {
  const [query, setQuery] = useState('')
  const [input, setInput] = useState('')
  const [data, setData] = useState(null)
  const [groupIndex, setGroupIndex] = useState(null)
  const [flowGraph, setFlowGraph] = useState(null)
  const [ipcGroups, setIpcGroups] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [showSugg, setShowSugg] = useState(false)
  const [flowCode, setFlowCode] = useState(null) // non-null = show flow chart
  const inputRef = useRef(null)
  const suggRef = useRef(null)

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
        // Load IPC groups for range expansion (non-blocking)
        fetch(`${import.meta.env.BASE_URL}ipc_groups.json`)
          .then(r => r.ok ? r.json() : null)
          .then(g => { if (g) setIpcGroups(g) })
          .catch(() => {})
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!data || !groupIndex || input.length < 1) {
      setSuggestions([])
      return
    }
    const up = input.toUpperCase()

    if (isGroupQuery(up)) {
      // Group-level autocomplete
      const normalized = normalizeGroupQuery(up)
      const matches = Object.keys(groupIndex)
        .filter(k => k.startsWith(normalized))
        .sort()
        .slice(0, 10)
      setSuggestions(matches)
    } else {
      // Subclass-level autocomplete
      const all = Object.keys(data.subclass_index).sort()
      const matches = all.filter(k => k.startsWith(up)).slice(0, 10)
      setSuggestions(matches)
    }
  }, [input, data, groupIndex])

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

  function handleSearch(value) {
    const raw = (value !== undefined ? value : input).trim().toUpperCase()
    if (!raw) return
    const v = isGroupQuery(raw) ? normalizeGroupQuery(raw) : raw
    setQuery(v)
    setInput(v)
    setShowSugg(false)
    setFlowCode(null) // exit flow view on new search
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSearch()
    if (e.key === 'Escape') setShowSugg(false)
  }

  function handleSuggClick(code) {
    setInput(code)
    setQuery(code)
    setShowSugg(false)
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
        const matches = Object.keys(groupIndex)
          .filter(k => k.startsWith(normalized))
          .sort()
        result = { type: 'group-prefix', prefix: normalized, matches }
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
          {!loading && !error && flowCode && flowGraph && (
            <FlowChart
              code={flowCode}
              flowGraph={flowGraph}
              data={data}
              onSearch={handleSearch}
              onBack={() => setFlowCode(null)}
            />
          )}
          {!loading && !error && !flowCode && result && result.type === 'exact' && (
            <SubclassCard code={result.code} data={data} onSearch={handleSearch} onFlowView={setFlowCode} ipcGroups={ipcGroups} />
          )}
          {!loading && !error && !flowCode && result && result.type === 'prefix' && (
            <PrefixList prefix={result.prefix} data={data} onSearch={handleSearch} />
          )}
          {!loading && !error && !flowCode && result && result.type === 'group-exact' && (
            <GroupCard code={result.code} groupIndex={groupIndex} onSearch={handleSearch} onFlowView={setFlowCode} ipcGroups={ipcGroups} />
          )}
          {!loading && !error && !flowCode && result && result.type === 'group-prefix' && (
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
      </footer>
    </div>
  )
}
