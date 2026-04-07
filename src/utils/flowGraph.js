export function buildFlowGraph(subclass_index) {
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

export function traceFlow(startCode, flowGraph, direction = 'both', maxDepth = 8) {
  const nodes = new Map()
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

export function traceSubclassFlow(subclass, flowGraph, subclass_index) {
  const entry = subclass_index[subclass] || {}
  const allEdges = []
  const allNodes = new Map()

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

  const edgeSet = new Set()
  const uniqueEdges = allEdges.filter(e => {
    const key = `${e.from}→${e.to}@${e.version}`
    if (edgeSet.has(key)) return false
    edgeSet.add(key)
    return true
  })

  return { nodes: [...allNodes.values()], edges: uniqueEdges }
}

export function versionOrder(verStr) {
  const m = verStr.match(/(\d{4})\.(\d{2})→(\d{4})\.(\d{2})/)
  if (m) return parseInt(m[3]) * 100 + parseInt(m[4])
  return 0
}

export function aggregateToSubclass(flow, originCode) {
  const originSub = originCode.slice(0, 4)
  const edgeMap = {}
  flow.edges.forEach(e => {
    const fromSub = e.from.slice(0, 4)
    const toSub = e.to.slice(0, 4)
    if (fromSub === toSub) return
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

export function computeSankeyLayout(flow, originCode) {
  const NODE_W = 70
  const COL_SPACING = 220
  const VER_GAP = 60
  const NODE_PAD = 6
  const MIN_NODE_H = 22
  const TOP_PAD = 36

  const versions = [...new Set(flow.edges.map(e => e.version))]
    .sort((a, b) => versionOrder(a) - versionOrder(b))
  const verToCol = {}
  versions.forEach((v, i) => { verToCol[v] = i })

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

  const portOut = {}; const portIn = {}
  nodeInstances.forEach((_, i) => { portOut[i] = 0; portIn[i] = 0 })

  layoutEdges.sort((a, b) => b.weight - a.weight)

  const paths = layoutEdges.map(e => {
    const src = nodeInstances[e.src]
    const tgt = nodeInstances[e.tgt]

    const srcH = (e.weight / Math.max(src.weightOut, 1)) * src.h
    const tgtH = (e.weight / Math.max(tgt.weightIn, 1)) * tgt.h
    const thickness = Math.max(srcH, tgtH)

    const sy0 = src.y + portOut[e.src]
    const sy1 = sy0 + srcH
    portOut[e.src] += srcH

    const ty0 = tgt.y + portIn[e.tgt]
    const ty1 = ty0 + tgtH
    portIn[e.tgt] += tgtH

    const x0 = src.x + src.w
    const x1 = tgt.x
    const cx = (x0 + x1) / 2

    const d = [
      `M${x0},${sy0}`,
      `C${cx},${sy0} ${cx},${ty0} ${x1},${ty0}`,
      `L${x1},${ty1}`,
      `C${cx},${ty1} ${cx},${sy1} ${x0},${sy1}`,
      `Z`
    ].join(' ')

    return { d, thickness, src: e.src, tgt: e.tgt, weight: e.weight, version: e.version }
  })

  const allX = nodeInstances.map(n => n.x + n.w)
  const allY = nodeInstances.map(n => n.y + n.h)
  const totalW = Math.max(...allX, 300) + 20
  const totalH = Math.max(...allY, 100) + TOP_PAD

  return { nodes: nodeInstances, paths, versions, verToCol, totalW, totalH }
}
