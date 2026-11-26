import { CATALOG, defaultConfig } from './catalog'
import { DEFAULT_EDGE } from './engine'
import type { GraphEdge, GraphNode, NodeConfig, NodeKind, SimEdgeData } from './types'

export interface Graph {
  nodes: (GraphNode & { type: string })[]
  edges: (GraphEdge & { type: string; data: SimEdgeData })[]
}

let seq = 0
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`

function builder() {
  const g: Graph = { nodes: [], edges: [] }
  const X = 235
  const Y = 150
  const add = (kind: NodeKind, col: number, row: number, label?: string, patch: Partial<NodeConfig> = {}, locked = false) => {
    const id = uid(kind)
    g.nodes.push({ id, type: 'sim', position: { x: col * X, y: row * Y }, data: { kind, label: label ?? CATALOG[kind].label, config: defaultConfig(kind, patch), locked } })
    return id
  }
  const link = (a: string, b: string, data: Partial<SimEdgeData> = {}) => {
    g.edges.push({ id: uid('e'), source: a, target: b, type: 'sim', data: { ...DEFAULT_EDGE, ...data } })
  }
  return { g, add, link }
}

export interface Template {
  id: string
  title: string
  blurb: string
  build: () => Graph
}

export const TEMPLATES: Template[] = [
  {
    id: 'blank', title: 'Blank canvas', blurb: 'Start from nothing.',
    build: () => ({ nodes: [], edges: [] }),
  },
  {
    id: 'single', title: '1 · Single server', blurb: 'Where everyone starts: one box, one database. Kill it and watch.',
    build: () => {
      const { g, add, link } = builder()
      const u = add('client', 0, 1, 'Users · N. Virginia', { users: 3000, reqPerUserMin: 6, pattern: 'daily' })
      const a = add('app', 1, 1, 'Web server', { instances: 1, size: 'S', minInstances: 1 })
      const d = add('sql', 2, 1, 'Postgres', { size: 'M' })
      link(u, a)
      link(a, d)
      return g
    },
  },
  {
    id: 'three-tier', title: '2 · Classic 3-tier web app', blurb: 'DNS → LB → autoscaling app tier → cache → SQL with a replica.',
    build: () => {
      const { g, add, link } = builder()
      const u = add('client', 0, 1, 'Users · US', { users: 100000, reqPerUserMin: 6, pattern: 'daily', region: 'city-nyc' })
      const dns = add('dns', 1, 1)
      const lb = add('lb', 2, 1, 'Load Balancer', { region: 'us-east-1' })
      const app = add('app', 3, 1, 'API servers', { region: 'us-east-1', autoscale: true, instances: 8, minInstances: 4, maxInstances: 40 })
      const c = add('cache', 4, 0.4, 'Redis', { region: 'us-east-1' })
      const db = add('sql', 5, 1, 'Postgres', { region: 'us-east-1', replicas: 1 })
      link(u, dns)
      link(dns, lb)
      link(lb, app)
      link(app, c, { filter: 'read' })
      link(c, db)
      link(app, db, { filter: 'write' })
      return g
    },
  },
  {
    id: 'global-feed', title: '3 · Global read-heavy feed', blurb: 'Three continents, GeoDNS routing to two regions, CDN, caches, one NoSQL store.',
    build: () => {
      const { g, add, link } = builder()
      const us = add('client', 0, 0, 'Users · New York', { users: 150000, reqPerUserMin: 8, readRatio: 0.95, region: 'city-nyc' })
      const eu = add('client', 0, 1, 'Users · London', { users: 120000, reqPerUserMin: 8, readRatio: 0.95, region: 'city-london' })
      const as = add('client', 0, 2, 'Users · Karachi', { users: 90000, reqPerUserMin: 8, readRatio: 0.95, region: 'city-karachi' })
      const dns = add('dns', 1, 1)
      const cdn = add('cdn', 2, 1, 'CDN', { hitRate: 0.6 })
      const lbU = add('lb', 3, 0.3, 'LB · us-east', { region: 'us-east-1' })
      const lbE = add('lb', 3, 1.7, 'LB · eu-central', { region: 'eu-central-1' })
      const aU = add('app', 4, 0.3, 'Feed API · US', { region: 'us-east-1', autoscale: true, instances: 6, minInstances: 3, maxInstances: 40 })
      const aE = add('app', 4, 1.7, 'Feed API · EU', { region: 'eu-central-1', autoscale: true, instances: 6, minInstances: 3, maxInstances: 40 })
      const cU = add('cache', 5, 0.3, 'Redis · US', { region: 'us-east-1', hitRate: 0.85 })
      const cE = add('cache', 5, 1.7, 'Redis · EU', { region: 'eu-central-1', hitRate: 0.85 })
      const db = add('nosql', 6, 1, 'Posts DB', { region: 'us-east-1', shards: 8 })
      ;[us, eu, as].forEach((u) => link(u, dns))
      link(dns, cdn)
      link(cdn, lbU)
      link(cdn, lbE)
      link(lbU, aU)
      link(lbE, aE)
      link(aU, cU)
      link(aE, cE)
      link(cU, db)
      link(cE, db)
      return g
    },
  },
  {
    id: 'async-orders', title: '4 · Async order pipeline', blurb: 'Flash-sale traffic absorbed by a queue; workers drain it into the database.',
    build: () => {
      const { g, add, link } = builder()
      const u = add('client', 0, 1, 'Shoppers', { users: 400000, reqPerUserMin: 1.5, readRatio: 0.6, pattern: 'spike', region: 'us-east-1' })
      const gw = add('gateway', 1, 1, 'API Gateway', { region: 'us-east-1' })
      const rl = add('ratelimiter', 2, 1, 'Rate Limiter', { region: 'us-east-1', rateLimit: 60000 })
      const app = add('app', 3, 1, 'Shop API', { region: 'us-east-1', autoscale: true, instances: 6, minInstances: 4, maxInstances: 60 })
      const c = add('cache', 4, 0, 'Catalog cache', { region: 'us-east-1', hitRate: 0.9 })
      const q = add('queue', 4, 2, 'Orders queue', { region: 'us-east-1' })
      const w = add('worker', 5, 2, 'Order workers', { region: 'us-east-1', instances: 6, autoscale: true, minInstances: 2, maxInstances: 40 })
      const db = add('sql', 6, 1, 'Orders DB', { region: 'us-east-1', replicas: 1, size: 'XL' })
      link(u, gw)
      link(gw, rl)
      link(rl, app)
      link(app, c, { filter: 'read' })
      link(c, db)
      link(app, q, { filter: 'write' })
      link(q, w)
      link(w, db)
      return g
    },
  },
  {
    id: 'video', title: '5 · Video streaming', blurb: 'Huge payloads: the CDN carries the bytes, the API only serves metadata.',
    build: () => {
      const { g, add, link } = builder()
      const u = add('client', 0, 1, 'Viewers · São Paulo', { users: 40000, reqPerUserMin: 2, readRatio: 0.99, payloadKB: 800, region: 'sa-east-1' })
      const cdn = add('cdn', 1, 0.3, 'Video CDN', { hitRate: 0.95 })
      const st = add('storage', 2, 0.3, 'Video bucket', { region: 'us-east-1', storageGB: 500000 })
      const lb = add('lb', 1, 1.7, 'LB', { region: 'us-east-1' })
      const app = add('app', 2, 1.7, 'Metadata API', { region: 'us-east-1', instances: 3 })
      const db = add('nosql', 3, 1.7, 'Catalog', { region: 'us-east-1' })
      link(u, cdn, { weight: 9 })
      link(u, lb, { weight: 1 })
      link(cdn, st)
      link(lb, app)
      link(app, db)
      return g
    },
  },
]

export { CHALLENGES, TOPICS, type Challenge, type DesignCheck } from './challenges'
