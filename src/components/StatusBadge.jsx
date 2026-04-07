export function StatusBadge({ code, data, onSearch }) {
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
  const entry = data.subclass_index[code]
  if (entry && ((entry.donated && entry.donated.length > 0) || (entry.received && entry.received.length > 0))) {
    const dCount = (entry.donated || []).length
    const rCount = (entry.received || []).length
    return <span className="badge badge-moved">有版本異動 ({dCount}出 {rCount}入)</span>
  }
  return <span className="badge badge-active">現行有效</span>
}
