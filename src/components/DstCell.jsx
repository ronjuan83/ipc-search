import { useIpcNames } from '../context/IpcNamesContext'
import { parseDst, expandRange } from '../utils/ipcParser'

export function CodeLink({ text, onSearch, showTitle }) {
  const { getSubclassName, getGroupTitle } = useIpcNames()
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

export function DstCell({ dst, onSearch, ipcGroups, showTitles }) {
  const segments = parseDst(dst)
  const result = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.link) {
      const next = segments[i + 1]
      if (next && !next.link && next.text.trim().startsWith('-') && ipcGroups) {
        const expanded = expandRange(seg.text, next.text.trim(), ipcGroups)
        if (expanded && expanded.length >= 1) {
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
          i++
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
