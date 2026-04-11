import { useState, useEffect, useMemo, useCallback } from 'react'
import Fuse from 'fuse.js'
import { useIpcNames } from '../context/IpcNamesContext'

export function TechClassifier({ onSearch }) {
  const { getSubclassName, getGroupTitle, groupTitlesData } = useIpcNames()
  const [techInput, setTechInput] = useState('')
  const [techKeywords, setTechKeywords] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [ipccatResults, setIpccatResults] = useState([])
  const [ipccatLoading, setIpccatLoading] = useState(false)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}tech_keywords.json`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setTechKeywords(d) })
      .catch(() => {})
  }, [])

  const fuseEn = useMemo(() => {
    if (!groupTitlesData) return null
    const kwMap = {}
    if (techKeywords) techKeywords.forEach(t => { kwMap[t.code] = t })
    const corpus = groupTitlesData.map(g => {
      const kw = kwMap[g.sub]
      return { code: g.code, sub: g.sub, title: g.title, subName: getSubclassName(g.sub), label: kw?.label ?? '', keywords: kw?.keywords ?? [] }
    })
    return new Fuse(corpus, {
      keys: [{ name: 'code', weight: 5 }, { name: 'title', weight: 3 }, { name: 'subName', weight: 1.5 }, { name: 'label', weight: 1.5 }, { name: 'keywords', weight: 2 }],
      threshold: 0.5, minMatchCharLength: 1, ignoreLocation: true, includeScore: true, shouldSort: true,
    })
  }, [groupTitlesData, techKeywords, getSubclassName])

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
  }, [techKeywords, getSubclassName])

  const zhIdf = useMemo(() => {
    if (!techKeywords) return null
    const docFreq = {}
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
      idf[term] = Math.log(N / df)
    }
    return { idf, maxIdf: Math.log(N) }
  }, [techKeywords])

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

  const bigramIndex = useMemo(() => {
    if (!techKeywords) return null
    const idx = {}
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
  }, [techKeywords, getSubclassName])

  const searchZhCustom = useCallback((q) => {
    if (!techKeywords || !zhIdf || !bigramIndex || !zhTriIdf) return []
    const { idf, maxIdf } = zhIdf

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

    const candidateSet = new Set()
    qBigrams.forEach(bi => {
      if (bigramIndex[bi]) bigramIndex[bi].forEach(i => candidateSet.add(i))
    })
    if (q.length <= 6) {
      techKeywords.forEach((_, i) => candidateSet.add(i))
    }

    const results = []
    candidateSet.forEach(idx => {
      const t = techKeywords[idx]
      const allText = (t.tipoDesc || '') + '；' + (t.keywords || []).join('；') + '；' + (t.label || '') + '；' + (getSubclassName(t.code) || '')
      let score = 0
      let bigramHits = 0
      const matchedTerms = []

      const kws = t.keywords || []
      const label = t.label || ''
      const subName = getSubclassName(t.code) || ''
      const tipoDesc = t.tipoDesc || ''
      const hasExact = q.length >= 2 && allText.includes(q)

      const isExactKw = kws.some(k => k === q)
      const labelZhPart = label.split(/\s/)[0] || ''
      const isExactName = (subName.includes(q) && q.length >= 2) || labelZhPart === q
      const isSubstrKw = !isExactKw && kws.some(k => k.includes(q) || q.includes(k))
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

      if (q.length >= 2 && tipoDesc.length > 0) {
        const tf = (tipoDesc.match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
        score += Math.min(tf * 3, 30)
      }

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
        score += triCov * 40
        score += triCov * triAvgIdf * 25
      }

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
  }, [techKeywords, zhIdf, zhTriIdf, bigramIndex, getSubclassName])

  useEffect(() => {
    const q = techInput.trim()
    if (!q) { setSuggestions([]); return }
    const isZh = /[\u4e00-\u9fff]/.test(q)
    if (q.length > 50 && !isZh) { setSuggestions([]); return }
    const timer = setTimeout(() => {
      const allResults = []

      if (isZh) {
        const customHits = searchZhCustom(q)
        allResults.push(...customHits)
        if (fuseZh && customHits.length < 4) {
          const customSubs = new Set(customHits.map(h => h.item.sub))
          fuseZh.search(q, { limit: 6 }).forEach(r => {
            if (!customSubs.has(r.item.sub)) {
              allResults.push({ item: r.item, score: Math.min(r.score + 0.5, 1), src: 'zh' })
            }
          })
        }
      } else {
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
    }, isZh ? 100 : 300)
    return () => clearTimeout(timer)
  }, [techInput, fuseEn, fuseZh, searchZhCustom])

  useEffect(() => {
    const q = techInput.trim()
    const hasChinese = /[^\x00-\x7F]/.test(q)
    if (!q || q.length < 3 || hasChinese || q.length <= 50) { setIpccatResults([]); return }

    setIpccatLoading(true)
    const timer = setTimeout(() => {
      const encoded = encodeURIComponent(q)
      const nonAscii = (q.match(/[^\x00-\x7F]/g) || []).length
      const lang = nonAscii > q.length * 0.3 ? 'zh' : 'en'
      const ipccatUrl = `https://ipcpub.wipo.int/search/ipccat/20260101/${lang}/subgroup/5/${encoded}/`
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
    }, 800)

    return () => clearTimeout(timer)
  }, [techInput])

  if (!techKeywords) return null

  const isAbstract = techInput.trim().length > 50
  const hasChinese = /[^\x00-\x7F]/.test(techInput.trim())
  const showIpccat = isAbstract && !hasChinese

  return (
    <div className="tech-classifier">
      <div className="tech-classifier-header">
        技術詞反查 IPC（輔助）
        {isAbstract && <span className="tech-abstract-badge">英文摘要模式</span>}
      </div>
      <div className="tech-classifier-body">
        <textarea
          className="tech-input tech-textarea"
          placeholder="輸入中文技術詞（如：太陽能電池）或貼入英文摘要，輔助定位相關 IPC 分類..."
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
          <div className="tech-ipccat-section">
            <div className="tech-result-label">WIPO IPCCAT 輔助建議</div>
            {ipccatLoading ? (
              <div className="tech-ipccat-loading">正在查詢 WIPO IPCCAT 建議...</div>
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
              <div className="tech-ipccat-loading">貼入超過 50 字的英文摘要後，可自動查詢 WIPO IPCCAT 建議</div>
            )}
          </div>
        )}
        {isAbstract && hasChinese && (
          <div className="tech-zh-warning">
            ⚠️ WIPO IPCCAT 對中文輸入的準確率較低，建議貼入英文摘要以取得較穩定的 IPC 五階建議
          </div>
        )}
      </div>
    </div>
  )
}
