import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const IpcNamesContext = createContext({
  subclassNames: {},
  groupTitles: {},
  groupTitlesZh: {},
  groupTitlesData: null,
  getSubclassName: () => '',
  getGroupTitle: () => '',
})

export function IpcNamesProvider({ children }) {
  const [subclassNames, setSubclassNames] = useState({})
  const [groupTitles, setGroupTitles] = useState({})
  const [groupTitlesZh, setGroupTitlesZh] = useState({})
  const [groupTitlesData, setGroupTitlesData] = useState(null) // raw array for TechClassifier

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}ipc_names.json`)
      .then(r => r.ok ? r.json() : null)
      .then(n => { if (n) setSubclassNames(n) })
      .catch(() => {})

    fetch(`${import.meta.env.BASE_URL}ipc_group_titles.json`)
      .then(r => r.ok ? r.json() : null)
      .then(arr => {
        if (!arr) return
        setGroupTitlesData(arr)
        const titles = {}
        const titlesZh = {}
        arr.forEach(g => {
          titles[g.code] = g.title
          if (g.zh) titlesZh[g.code] = g.zh
        })
        setGroupTitles(titles)
        setGroupTitlesZh(titlesZh)
      })
      .catch(() => {})
  }, [])

  const getSubclassName = useCallback((code) => {
    return subclassNames[code] || ''
  }, [subclassNames])

  const getGroupTitle = useCallback((code) => {
    const zh = groupTitlesZh[code]
    const en = groupTitles[code]
    if (zh && en) return `${zh} (${en})`
    if (zh) return zh
    if (en) return en
    const parts = code.match(/([A-H]\d{2}[A-Z])\s+(\d+)\//)
    if (parts) {
      const mainCode = `${parts[1]} ${parts[2]}/00`
      const mZh = groupTitlesZh[mainCode]
      const mEn = groupTitles[mainCode]
      if (mZh || mEn) {
        const label = mZh && mEn ? `${mZh} (${mEn})` : (mZh || mEn)
        return `[${mainCode}] ${label}`
      }
    }
    return ''
  }, [groupTitles, groupTitlesZh])

  return (
    <IpcNamesContext.Provider value={{ subclassNames, groupTitles, groupTitlesZh, groupTitlesData, getSubclassName, getGroupTitle }}>
      {children}
    </IpcNamesContext.Provider>
  )
}

export function useIpcNames() {
  return useContext(IpcNamesContext)
}

export default IpcNamesContext
