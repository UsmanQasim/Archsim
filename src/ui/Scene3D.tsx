import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Grid, Html, Line, OrbitControls, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { CATALOG } from '../sim/catalog'
import { GLOBAL, getLocation } from '../sim/regions'
import { MARKERS, fmtNum, fmtPct, mixHex, utilColor, utilHex } from '../format'
import { useApp, useSim, type SEdge, type SNode } from '../store'

const SCALE = 1 / 56
const NODE_W = 190
const NODE_H = 90
const to3 = (n: SNode): [number, number, number] => [(n.position.x + NODE_W / 2) * SCALE, 0, (n.position.y + NODE_H / 2) * SCALE]
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// ------------------------------------------------------------------ shapes
function Mat({ color, emissive, intensity, opacity = 1 }: { color: string; emissive: string; intensity: number; opacity?: number }) {
  // matte, model-making card / clay finish
  return <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={intensity} metalness={0} roughness={0.78} transparent={opacity < 1} opacity={opacity} />
}

function Shape({ n, instances, color, glow, gi, backlog }: { n: SNode; instances: number; color: string; glow: string; gi: number; backlog: number }) {
  const k = n.data.kind
  const cfg = n.data.config
  const m = <Mat color={color} emissive={glow} intensity={gi} />
  switch (k) {
    case 'client': {
      const pts: [number, number, number][] = [[0, 0.35, 0], [0.45, 0.3, 0.2], [-0.45, 0.3, 0.2], [0.25, 0.3, -0.4], [-0.25, 0.3, -0.4]]
      return (
        <group>
          {pts.map((p, i) => (
            <group key={i} position={p}>
              <mesh position={[0, 0.28, 0]}><sphereGeometry args={[0.14, 16, 16]} />{m}</mesh>
              <mesh position={[0, 0, 0]}><capsuleGeometry args={[0.12, 0.22, 4, 12]} />{m}</mesh>
            </group>
          ))}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><ringGeometry args={[0.75, 0.85, 40]} /><meshBasicMaterial color={color} transparent opacity={0.5} /></mesh>
        </group>
      )
    }
    case 'dns':
      return <mesh position={[0, 0.7, 0]}><octahedronGeometry args={[0.6]} />{m}</mesh>
    case 'cdn':
      return (
        <group position={[0, 0.8, 0]}>
          <mesh><icosahedronGeometry args={[0.55, 1]} />{m}</mesh>
          <mesh><icosahedronGeometry args={[0.75, 1]} /><meshBasicMaterial color={color} wireframe transparent opacity={0.35} /></mesh>
        </group>
      )
    case 'waf':
      return <mesh position={[0, 0.65, 0]}><boxGeometry args={[1.1, 1.3, 0.18]} />{m}</mesh>
    case 'ratelimiter':
      return (
        <group position={[0, 0.3, 0]}>
          <mesh><cylinderGeometry args={[0.55, 0.55, 0.3, 32]} />{m}</mesh>
          <mesh position={[0, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.45, 0.06, 12, 40]} />{m}</mesh>
        </group>
      )
    case 'lb':
      return (
        <group position={[0, 0.2, 0]}>
          <mesh><cylinderGeometry args={[0.75, 0.8, 0.28, 40]} />{m}</mesh>
          <mesh position={[0, 0.3, 0]}><coneGeometry args={[0.25, 0.35, 3]} />{m}</mesh>
        </group>
      )
    case 'gateway':
      return (
        <group position={[0, 0.35, 0]}>
          <mesh><boxGeometry args={[1.4, 0.5, 0.8]} />{m}</mesh>
          <mesh position={[0, 0.4, 0]}><boxGeometry args={[0.9, 0.3, 0.6]} />{m}</mesh>
        </group>
      )
    case 'app':
    case 'worker': {
      const shown = Math.min(instances, k === 'app' ? 10 : 8)
      const cols = shown > 5 ? 2 : 1
      const perCol = Math.ceil(shown / cols)
      return (
        <group>
          {Array.from({ length: shown }).map((_, i) => {
            const c = Math.floor(i / perCol)
            const r = i % perCol
            const w = k === 'app' ? 1.1 : 0.7
            return (
              <mesh key={i} position={[(c - (cols - 1) / 2) * (w + 0.12), 0.1 + r * 0.22, 0]}>
                <boxGeometry args={[w, 0.17, 0.75]} />
                {m}
              </mesh>
            )
          })}
        </group>
      )
    }
    case 'serverless':
      return <mesh position={[0, 0.55, 0]} rotation={[0, Math.PI / 4, 0]}><tetrahedronGeometry args={[0.65]} />{m}</mesh>
    case 'sql': {
      const shards = Math.min(4, Math.max(1, cfg.shards))
      const reps = Math.min(4, cfg.replicas)
      return (
        <group>
          {Array.from({ length: shards }).map((_, s) => (
            <group key={s} position={[(s - (shards - 1) / 2) * 0.95, 0, 0]}>
              {[0, 1, 2].map((d) => (
                <mesh key={d} position={[0, 0.15 + d * 0.27, 0]}><cylinderGeometry args={[0.4, 0.4, 0.22, 32]} />{m}</mesh>
              ))}
              {Array.from({ length: reps }).map((_, r) => (
                <mesh key={`r${r}`} position={[0, 0.1 + r * 0.18, 0.62]}><cylinderGeometry args={[0.18, 0.18, 0.14, 20]} /><Mat color={color} emissive={glow} intensity={gi} opacity={0.75} /></mesh>
              ))}
            </group>
          ))}
        </group>
      )
    }
    case 'nosql':
      return <mesh position={[0, 0.45, 0]}><cylinderGeometry args={[0.65, 0.65, 0.9, 6]} />{m}</mesh>
    case 'cache': {
      const shown = Math.min(instances, 5)
      return (
        <group>
          {Array.from({ length: shown }).map((_, i) => (
            <mesh key={i} position={[(i - (shown - 1) / 2) * 0.5, 0.2, 0]}><cylinderGeometry args={[0.22, 0.22, 0.4, 24]} />{m}</mesh>
          ))}
        </group>
      )
    }
    case 'storage':
      return (
        <group position={[0, 0.35, 0]}>
          <mesh><boxGeometry args={[1.3, 0.7, 0.9]} />{m}</mesh>
          <mesh position={[0, 0.37, 0]}><boxGeometry args={[1.38, 0.05, 0.98]} /><Mat color="#e2e8f0" emissive={glow} intensity={gi * 0.5} /></mesh>
        </group>
      )
    case 'search':
      return (
        <group position={[0, 0.6, 0]}>
          <mesh rotation={[0, 0, 0]}><torusGeometry args={[0.38, 0.1, 16, 40]} />{m}</mesh>
          <mesh position={[0.38, -0.38, 0]} rotation={[0, 0, Math.PI / 4]}><cylinderGeometry args={[0.08, 0.08, 0.5, 12]} />{m}</mesh>
        </group>
      )
    case 'queue': {
      const lit = backlog > 0 ? Math.min(8, 1 + Math.floor(Math.log10(backlog + 1) * 1.5)) : 1
      return (
        <group position={[0, 0.35, 0]}>
          <mesh><boxGeometry args={[1.8, 0.5, 0.6]} /><meshStandardMaterial color={color} transparent opacity={0.18} /></mesh>
          {Array.from({ length: lit }).map((_, i) => (
            <mesh key={i} position={[-0.75 + i * 0.21, 0, 0]}><boxGeometry args={[0.16, 0.32, 0.4]} />{m}</mesh>
          ))}
        </group>
      )
    }
    case 'stream':
      return (
        <group position={[0, 0.25, 0]}>
          {[-0.3, 0, 0.3].map((z) => (
            <mesh key={z} position={[0, 0, z]}><boxGeometry args={[1.7, 0.18, 0.2]} />{m}</mesh>
          ))}
        </group>
      )
    case 'container': {
      const shown = Math.min(instances, 9)
      return (
        <group>
          {Array.from({ length: shown }).map((_, i) => (
            <mesh key={i} position={[((i % 3) - 1) * 0.42, 0.18 + Math.floor(i / 3) * 0.36, 0]}><boxGeometry args={[0.36, 0.3, 0.6]} />{m}</mesh>
          ))}
        </group>
      )
    }
    case 'k8s': {
      const shown = Math.min(instances, 8)
      return (
        <group position={[0, 0.2, 0]}>
          <mesh><cylinderGeometry args={[0.45, 0.45, 0.3, 7]} />{m}</mesh>
          {Array.from({ length: shown }).map((_, i) => {
            const a = (i / shown) * Math.PI * 2
            return <mesh key={i} position={[Math.cos(a) * 0.85, 0.05, Math.sin(a) * 0.85]}><boxGeometry args={[0.28, 0.28, 0.28]} />{m}</mesh>
          })}
        </group>
      )
    }
    case 'edgefn':
      return (
        <group position={[0, 0.8, 0]}>
          <mesh><icosahedronGeometry args={[0.35, 0]} />{m}</mesh>
          <mesh rotation={[Math.PI / 2.4, 0, 0]}><torusGeometry args={[0.7, 0.04, 8, 48]} />{m}</mesh>
          <mesh rotation={[Math.PI / 2, 0.6, 0]}><torusGeometry args={[0.55, 0.03, 8, 48]} /><meshBasicMaterial color={color} transparent opacity={0.6} /></mesh>
        </group>
      )
    case 'auth':
      return (
        <group position={[0, 0.35, 0]}>
          <mesh><boxGeometry args={[0.8, 0.6, 0.35]} />{m}</mesh>
          <mesh position={[0, 0.45, 0]}><torusGeometry args={[0.25, 0.07, 12, 32, Math.PI]} />{m}</mesh>
        </group>
      )
    case 'websocket':
      return (
        <group>
          <mesh position={[0, 0.45, 0]}><cylinderGeometry args={[0.06, 0.12, 0.9, 12]} />{m}</mesh>
          {[0.35, 0.6, 0.85].map((r, i) => (
            <mesh key={r} position={[0, 0.95, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[r * 0.6, 0.03, 8, 40, Math.PI]} /><Mat color={color} emissive={glow} intensity={gi} opacity={1 - i * 0.25} /></mesh>
          ))}
        </group>
      )
    case 'pubsub':
      return (
        <group position={[0, 0.5, 0]}>
          <mesh><sphereGeometry args={[0.3, 20, 20]} />{m}</mesh>
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4
            return (
              <group key={i}>
                <mesh position={[Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4]} rotation={[0, -a, Math.PI / 2]}><cylinderGeometry args={[0.03, 0.03, 0.5, 6]} />{m}</mesh>
                <mesh position={[Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72]}><sphereGeometry args={[0.14, 12, 12]} />{m}</mesh>
              </group>
            )
          })}
        </group>
      )
    case 'notify':
      return (
        <group position={[0, 0.5, 0]}>
          <mesh><coneGeometry args={[0.5, 0.7, 32, 1, true]} /><meshStandardMaterial color={color} emissive={glow} emissiveIntensity={gi} side={THREE.DoubleSide} metalness={0} roughness={0.78} /></mesh>
          <mesh position={[0, -0.38, 0]}><sphereGeometry args={[0.12, 12, 12]} />{m}</mesh>
          <mesh position={[0, 0.38, 0]}><sphereGeometry args={[0.08, 12, 12]} />{m}</mesh>
        </group>
      )
    case 'globaldb': {
      const regions = Math.min(6, Math.max(2, cfg.replicas))
      return (
        <group position={[0, 0.8, 0]}>
          <mesh><sphereGeometry args={[0.55, 24, 16]} /><meshStandardMaterial color={color} wireframe /></mesh>
          {Array.from({ length: regions }).map((_, i) => {
            const a = (i / regions) * Math.PI * 2
            return <mesh key={i} position={[Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62]}><cylinderGeometry args={[0.13, 0.13, 0.22, 16]} />{m}</mesh>
          })}
        </group>
      )
    }
    case 'warehouse':
      return (
        <group>
          {[0.9, 0.6, 1.1, 0.75, 0.5].map((h, i) => (
            <mesh key={i} position={[(i - 2) * 0.28, h / 2, 0]}><boxGeometry args={[0.22, h, 0.7]} />{m}</mesh>
          ))}
        </group>
      )
    case 'streamproc':
      return (
        <group position={[0, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh><cylinderGeometry args={[0.5, 0.5, 0.25, 10]} />{m}</mesh>
          <mesh><torusGeometry args={[0.55, 0.08, 8, 10]} />{m}</mesh>
        </group>
      )
    case 'inference': {
      const shown = Math.min(instances, 6)
      return (
        <group>
          {Array.from({ length: shown }).map((_, i) => (
            <group key={i} position={[((i % 3) - 1) * 0.5, 0.12 + Math.floor(i / 3) * 0.42, 0]}>
              <mesh><boxGeometry args={[0.42, 0.3, 0.8]} />{m}</mesh>
              {[-0.12, 0, 0.12].map((x) => (
                <mesh key={x} position={[x, 0.2, 0]}><boxGeometry args={[0.04, 0.1, 0.7]} /><Mat color="#e2e8f0" emissive={glow} intensity={gi * 0.6} /></mesh>
              ))}
            </group>
          ))}
        </group>
      )
    }
    case 'external':
      return (
        <group position={[0, 0.5, 0]}>
          {([[0, 0.1, 0, 0.38], [-0.38, -0.05, 0, 0.28], [0.38, -0.05, 0, 0.3], [0, -0.1, 0.15, 0.3]] as const).map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]}><sphereGeometry args={[r, 18, 18]} />{m}</mesh>
          ))}
        </group>
      )
    default:
      return <mesh position={[0, 0.4, 0]}><boxGeometry args={[0.8, 0.8, 0.8]} />{m}</mesh>
  }
}

// ------------------------------------------------------------------ nodes
const NO_UTIL = ['lb', 'gateway', 'waf', 'queue', 'pubsub', 'dns', 'cdn', 'edgefn', 'auth']

function Node3D({ n }: { n: SNode }) {
  const m = useSim((s) => s.result?.nodes[n.id])
  const failed = useApp((s) => s.chaos.failedNodes.includes(n.id) || (n.data.kind !== 'client' && n.data.config.region !== GLOBAL && s.chaos.failedRegions.includes(n.data.config.region)))
  const selected = useApp((s) => s.selection?.type === 'node' && s.selection.id === n.id)
  const select = useApp((s) => s.select)
  const theme = useApp((s) => s.theme)
  const group = useRef<THREE.Group>(null)
  const def = CATALOG[n.data.kind]
  const load = m ? m.inRead + m.inWrite : 0
  const isClient = n.data.kind === 'client'
  const idle = !isClient && load < 0.01
  const u = m?.util ?? 0
  const mk = MARKERS[theme]
  const health = failed ? mk.bad : isClient ? mk.ok : utilHex(u, idle, theme)
  // pieces are painted model parts: the component colour, softened toward the table
  const color = failed ? (theme === 'light' ? '#c9c3be' : '#4a4f53') : mixHex(def.color, theme === 'light' ? '#ffffff' : '#d5d9da', theme === 'light' ? 0.38 : 0.12)
  const emissive = failed ? mk.bad : '#000000'
  const ei = failed ? 0.25 : 0

  useLayoutEffect(() => {
    group.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true
    })
  })

  useFrame(({ clock }) => {
    if (!group.current) return
    const t = clock.getElapsedTime()
    if (failed) {
      group.current.position.y = 0
      group.current.rotation.z = -0.06
    } else if (!reduceMotion && u > 1) {
      group.current.position.y = Math.abs(Math.sin(t * 14)) * 0.035
      group.current.rotation.z = 0
    } else {
      group.current.position.y = 0
      group.current.rotation.z = 0
    }
    if (n.data.kind === 'cdn' || n.data.kind === 'dns' || n.data.kind === 'globaldb') group.current.rotation.y = reduceMotion ? 0 : t * 0.25
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select({ type: 'node', id: n.id })
  }
  const pos = to3(n)
  const stats = failed
    ? 'Down'
    : isClient
      ? `${fmtNum(m?.offered ?? 0)}/s, ${m?.e2eLatency ? Math.round(m.e2eLatency) + ' ms' : '—'}`
      : `${fmtNum(load)}/s${!NO_UTIL.includes(n.data.kind) ? `, ${fmtPct(u, 0)} busy` : ''}${m?.azDegraded ? ', zone down' : ''}`
  return (
    <group position={pos}>
      <group ref={group} onClick={onClick} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }} onPointerOut={() => (document.body.style.cursor = '')}>
        <Shape n={n} instances={m?.instances ?? n.data.config.instances} color={color} glow={emissive} gi={ei} backlog={m?.backlog ?? 0} />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <ringGeometry args={[0.92, 1.05, 56]} />
        <meshBasicMaterial color={selected ? mk.ok : health} transparent opacity={selected ? 0.9 : idle ? 0.35 : 0.75} />
      </mesh>
      <Html position={[0, 2.05, 0]} center distanceFactor={18} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`label3d ${failed ? 'down' : ''} ${selected ? 'sel' : ''}`} style={{ ['--h' as string]: failed ? 'var(--red)' : isClient ? 'var(--blue)' : utilColor(u, idle) }}>
          <div className="l3-name">{n.data.label}</div>
          <div className="l3-stats">{stats}</div>
        </div>
      </Html>
    </group>
  )
}

// ------------------------------------------------------------------ edges: marker string with beads
const MAXP = 40
const tmpObj = new THREE.Object3D()

function Edge3D({ e, a, b }: { e: SEdge; a: THREE.Vector3; b: THREE.Vector3 }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const em = useSim((s) => s.result?.edges[e.id])
  const cut = useApp((s) => s.chaos.cutEdges.includes(e.id))
  const selected = useApp((s) => s.selection?.type === 'edge' && s.selection.id === e.id)
  const select = useApp((s) => s.select)
  const theme = useApp((s) => s.theme)
  const mk = MARKERS[theme]
  const cOk = useMemo(() => new THREE.Color(mk.ok), [mk.ok])
  const cErr = useMemo(() => new THREE.Color(mk.bad), [mk.bad])
  const curve = useMemo(() => {
    const d = a.distanceTo(b)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    mid.y += 0.5 + d * 0.16
    const start = a.clone().setY(0.55)
    const end = b.clone().setY(0.55)
    return new THREE.QuadraticBezierCurve3(start, mid, end)
  }, [a, b])
  const points = useMemo(() => curve.getPoints(40), [curve])
  const offsets = useMemo(() => Array.from({ length: MAXP }, () => Math.random()), [])
  const rps = em?.rps ?? 0
  const err = em?.errRate ?? 0
  const lineColor = cut || err > 0.05 ? mk.bad : err > 0.001 ? mk.warn : rps > 0 ? mk.ok : mk.idle

  useFrame(({ clock }) => {
    const im = mesh.current
    if (!im) return
    const r = useSim.getState().result?.edges[e.id]
    const isCut = useApp.getState().chaos.cutEdges.includes(e.id)
    const flow = r?.rps ?? 0
    const count = flow <= 0 ? 0 : Math.min(MAXP, Math.round(3 + Math.log10(flow + 1) * 6))
    const errFrac = isCut ? 1 : r?.errRate ?? 0
    const speed = reduceMotion ? 0 : 0.22 / (1 + (r?.latencyMs ?? 0) / 80)
    const t = clock.getElapsedTime()
    for (let i = 0; i < MAXP; i++) {
      if (i < count) {
        let u = (offsets[i] + t * speed) % 1
        const bad = i / count < errFrac
        if (bad) u = Math.min(u, 0.55 + offsets[i] * 0.1) // failing requests pile up before the target
        curve.getPoint(u, tmpObj.position)
        tmpObj.scale.setScalar(bad ? 0.1 : 0.075)
        im.setColorAt(i, bad ? cErr : cOk)
      } else tmpObj.scale.setScalar(0)
      tmpObj.updateMatrix()
      im.setMatrixAt(i, tmpObj.matrix)
    }
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <Line
        points={points}
        color={selected ? (theme === 'light' ? '#1f2a2e' : '#ebeae6') : lineColor}
        lineWidth={selected ? 3 : 1.6 + Math.min(2, Math.log10(rps + 1) * 0.45)}
        dashed={cut}
        dashSize={0.3}
        gapSize={0.2}
        transparent
        opacity={rps > 0 || cut ? 0.55 : 0.7}
        onClick={(ev) => {
          ev.stopPropagation()
          select({ type: 'edge', id: e.id })
        }}
      />
      <instancedMesh ref={mesh} args={[undefined, undefined, MAXP]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

// ------------------------------------------------------------------ regions: foam-board bases
const REGION_COLORS = ['#2457c5', '#1e8a4c', '#7e57c2', '#b86e0a', '#1f8a80', '#a8418f', '#3d58b0', '#c0602b']

function RegionPlatforms({ nodes }: { nodes: SNode[] }) {
  const failedRegions = useApp((s) => s.chaos.failedRegions)
  const theme = useApp((s) => s.theme)
  const groups = useMemo(() => {
    const m = new Map<string, SNode[]>()
    nodes.forEach((n) => {
      const key = n.data.kind === 'client' ? `users:${n.data.config.region}` : n.data.config.region
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(n)
    })
    let ri = 0
    return [...m.entries()].map(([key, list]) => {
      const xs = list.map((n) => to3(n)[0])
      const zs = list.map((n) => to3(n)[2])
      const pad = 1.4
      const minX = Math.min(...xs) - pad
      const maxX = Math.max(...xs) + pad
      const minZ = Math.min(...zs) - pad
      const maxZ = Math.max(...zs) + pad
      const isUsers = key.startsWith('users:')
      const region = isUsers ? key.slice(6) : key
      const name = region === GLOBAL ? 'Global edge network' : `${isUsers ? 'Users in ' : ''}${getLocation(region)?.name ?? region}`
      const color = region === GLOBAL ? '#7e57c2' : isUsers ? '#65727a' : REGION_COLORS[ri++ % REGION_COLORS.length]
      return { key, region, isUsers, name, minX, maxX, minZ, maxZ, color }
    })
  }, [nodes])
  const base = theme === 'light' ? '#ffffff' : '#2a2f33'
  return (
    <>
      {groups.map((g) => {
        const down = !g.isUsers && failedRegions.includes(g.region)
        const w = g.maxX - g.minX
        const d = g.maxZ - g.minZ
        const h = g.isUsers ? 0.08 : 0.18
        const tint = down ? mixHex(MARKERS[theme].bad, base, 0.7) : mixHex(g.color, base, g.isUsers ? 0.94 : theme === 'light' ? 0.86 : 0.8)
        return (
          <group key={g.key} position={[(g.minX + g.maxX) / 2, -h / 2 - 0.02, (g.minZ + g.maxZ) / 2]}>
            <RoundedBox args={[w, h, d]} radius={Math.min(0.08, h / 2 - 0.001)} smoothness={3} receiveShadow castShadow={false}>
              <meshStandardMaterial color={tint} roughness={0.92} metalness={0} />
            </RoundedBox>
            <Html position={[-w / 2 + 0.2, h / 2 + 0.02, d / 2 - 0.2]} distanceFactor={14} style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
              <div className={`region3d ${down ? 'down' : ''}`}>{down ? `${g.name} is offline` : g.name}</div>
            </Html>
          </group>
        )
      })}
    </>
  )
}

// ------------------------------------------------------------------ camera fit
function CameraRig({ center, span, fitKey }: { center: THREE.Vector3; span: number; fitKey: string }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const size = useThree((s) => s.size)
  useEffect(() => {
    const aspect = Math.max(0.3, size.width / Math.max(1, size.height))
    const vfov = (camera.fov * Math.PI) / 180
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    const fit = Math.min(vfov, hfov)
    const dist = Math.max(16, (Math.max(14, span) / 2 / Math.tan(fit / 2)) * (aspect < 1.3 ? 1.12 : 0.8))
    const dir = new THREE.Vector3(-0.08, 0.72, 0.69).normalize()
    camera.position.copy(center).addScaledVector(dir, dist)
    camera.lookAt(center)
    if (controls) {
      controls.target.copy(center)
      controls.update()
    }
    // refit when the design changes identity or the pane is resized — not on every drag
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, controls, size.width, size.height])
  return null
}

function KeyLight({ center, span, intensity }: { center: THREE.Vector3; span: number; intensity: number }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const l = light.current
    if (!l) return
    scene.add(l.target)
    l.target.position.copy(center)
    l.position.set(center.x + 10, 26, center.z + 12)
    const half = span * 0.75 + 6
    const cam = l.shadow.camera
    cam.left = -half
    cam.right = half
    cam.top = half
    cam.bottom = -half
    cam.near = 1
    cam.far = 80
    cam.updateProjectionMatrix()
    l.target.updateMatrixWorld()
    return () => {
      scene.remove(l.target)
    }
  }, [center, span, scene])
  return <directionalLight ref={light} castShadow intensity={intensity} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} />
}

function SceneContents() {
  const nodes = useApp((s) => s.nodes)
  const edges = useApp((s) => s.edges)
  const title = useApp((s) => s.title)
  const select = useApp((s) => s.select)
  const theme = useApp((s) => s.theme)
  const pos = useMemo(() => new Map(nodes.map((n) => [n.id, new THREE.Vector3(...to3(n))])), [nodes])
  const { center, span } = useMemo(() => {
    if (!nodes.length) return { center: new THREE.Vector3(0, 0, 0), span: 12 }
    const xs = nodes.map((n) => to3(n)[0])
    const zs = nodes.map((n) => to3(n)[2])
    const c = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2)
    return { center: c, span: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + 4 }
  }, [nodes])
  const fitKey = `${title}:${nodes.length > 0 ? nodes[0].id : ''}:${nodes.length}`
  const light = theme === 'light'
  const table = light ? '#eceeea' : '#1a1d20'
  return (
    <>
      <color attach="background" args={[table]} />
      <fog attach="fog" args={[table, 55, 150]} />
      <hemisphereLight args={light ? ['#ffffff', '#cfd4cf', 1.25] : ['#c9d1dc', '#1b1e21', 0.75]} />
      <KeyLight center={center} span={span} intensity={light ? 1.5 : 1.1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.21, 0]} receiveShadow onClick={() => select(null)}>
        <planeGeometry args={[1000, 1000]} />
        <meshStandardMaterial color={table} roughness={1} metalness={0} />
      </mesh>
      <Grid args={[300, 300]} cellSize={1} cellThickness={0.6} cellColor={light ? '#dde1dc' : '#262a2e'} sectionSize={5} sectionThickness={1} sectionColor={light ? '#d0d6d1' : '#30353a'} fadeDistance={90} fadeStrength={1.6} infiniteGrid position={[0, -0.2, 0]} />
      <RegionPlatforms nodes={nodes} />
      {edges.map((e) => {
        const a = pos.get(e.source)
        const b = pos.get(e.target)
        return a && b ? <Edge3D key={e.id} e={e} a={a} b={b} /> : null
      })}
      {nodes.map((n) => <Node3D key={n.id} n={n} />)}
      <OrbitControls makeDefault enableDamping dampingFactor={0.1} maxPolarAngle={Math.PI / 2.15} minDistance={4} maxDistance={160} />
      <CameraRig center={center} span={span} fitKey={fitKey} />
    </>
  )
}

export function Scene3D() {
  return (
    <div className="scene-wrap">
      <Canvas shadows flat dpr={[1, 2]} camera={{ fov: 40, position: [0, 18, 24], near: 0.1, far: 500 }} gl={{ antialias: true }}>
        <SceneContents />
      </Canvas>
      <div className="scene-hint">Drag to turn the model, right-drag to move it, scroll to zoom, click a piece to inspect it.</div>
    </div>
  )
}
