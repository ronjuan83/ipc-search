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

function StatusBadge({ code, data }) {
  const intro = data.introduced_in[code]
  const depr = data.deprecated_to[code]
  if (depr) {
    return <span className="badge badge-deprecated">已廢棄 → {depr}</span>
  }
  if (intro) {
    return <span className="badge badge-new">新增於 {intro}</span>
  }
  return <span className="badge badge-active">現行有效</span>
}

function DonatedSection({ donated }) {
  if (!donated || donated.length === 0) return null

  // Group by version
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
                  <td className="code-cell">{item.src_group}</td>
                  <td className="code-cell">{item.dst}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function ReceivedSection({ received }) {
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
                  <td className="code-cell source-sub">{item.src_sub}</td>
                  <td className="code-cell">{item.from}</td>
                  <td className="code-cell">{item.dst}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function SubclassCard({ code, data }) {
  const entry = data.subclass_index[code] || {}
  const donated = entry.donated || []
  const received = entry.received || []
  const name = getSubclassName(code)
  const intro = data.introduced_in[code]
  const depr = data.deprecated_to[code]

  return (
    <div className="subclass-card">
      <div className="card-header">
        <div className="card-title-row">
          <span className="subclass-code">{code}</span>
          {name && <span className="subclass-name">{name}</span>}
        </div>
        <StatusBadge code={code} data={data} />
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
          <span className="info-value">{depr}</span>
        </div>
      )}

      {donated.length === 0 && received.length === 0 ? (
        <div className="no-moves">此分類在現有記錄中無跨分類異動。</div>
      ) : (
        <>
          <DonatedSection donated={donated} />
          <ReceivedSection received={received} />
        </>
      )}
    </div>
  )
}

function PrefixList({ prefix, data }) {
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
            <div key={code} className={`prefix-item ${depr ? 'is-deprecated' : ''}`}>
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

const EXAMPLES = ['H01L', 'B01J', 'G06K', 'B29D', 'H10B', 'B81B', 'G06Q', 'E21B', 'F24S', 'C40B']

export default function App() {
  const [query, setQuery] = useState('')
  const [input, setInput] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [showSugg, setShowSugg] = useState(false)
  const inputRef = useRef(null)
  const suggRef = useRef(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}ipc_data.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!data || input.length < 1) {
      setSuggestions([])
      return
    }
    const up = input.toUpperCase()
    const all = Object.keys(data.subclass_index).sort()
    const matches = all.filter(k => k.startsWith(up)).slice(0, 10)
    setSuggestions(matches)
  }, [input, data])

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
    const v = (value || input).trim().toUpperCase()
    if (!v) return
    setQuery(v)
    setInput(v)
    setShowSugg(false)
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
  if (data && query) {
    const up = query.toUpperCase()
    if (data.subclass_index[up]) {
      result = { type: 'exact', code: up }
    } else {
      // Check if it's a deprecated subclass not in index
      const depr = data.deprecated_to[up]
      const intro = data.introduced_in[up]
      if (depr || intro) {
        result = { type: 'exact', code: up }
      } else {
        // prefix search
        result = { type: 'prefix', prefix: up }
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
              placeholder="輸入 IPC 分類代碼，例如 H01L 或 B01"
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
                    {getSubclassName(code) && (
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
              <p className="empty-sub">支援完整代碼（如 <code>H01L</code>）或前綴搜尋（如 <code>H01</code> 或 <code>H</code>）</p>
            </div>
          )}
          {!loading && !error && result && result.type === 'exact' && (
            <SubclassCard code={result.code} data={data} />
          )}
          {!loading && !error && result && result.type === 'prefix' && (
            <PrefixList prefix={result.prefix} data={data} />
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
