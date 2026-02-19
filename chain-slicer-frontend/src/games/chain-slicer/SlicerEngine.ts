/*
    This file is part of xray-games project.
    Licensed under the MIT License.
    Author: Fred Kyung-jin Rezeau (오경진 吳景振) <hello@kyungj.in>
*/

const MAX_LEVELS = 1;
const ENDPOINT = 'https://api.xray.games';

const GameStatus = { Paused: 0, Running: 1, Success: 2, Failed: 3 } as const;

interface Vertex {
  x: number;
  y: number;
  intersection?: boolean;
  cut?: boolean;
}

interface Polygon {
  vertices: Vertex[];
  outlineVertices: any[];
  valid: boolean;
  formTime: number;
  center: { x: number; y: number };
  offset: { x: number; y: number };
  lifeTime: number;
  lastBreathTime: number;
  angle: number;
  rotationSpeed: number;
  scaleFactor: number;
  isCut: boolean;
  heartBeats: { time: number; direction: number; maxTime: number; speed1: number; speed2: number }[];
}

interface LevelData {
  polygons: { x: number; y: number }[][];
  objects: { type: number; x: number; y: number }[];
  segmentCount: number;
  hints?: { x1: number; y1: number; x2: number; y2: number }[];
}

interface Object {
  type: number; x: number; y: number; valid: boolean; scale: number; targetScale: number;
  popTime?: number; flyX?: number; flyY?: number; targetX?: number; targetY?: number; flyDone?: boolean;
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function vectorAngle(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

function vectorRotate(x: number, y: number, angle: number) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

function isInsidePolygon(point: { x: number; y: number }, vertices: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    if (((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function lineLineIntersect(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return { intersect: false, x: 0, y: 0 };
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { intersect: true, x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }
  return { intersect: false, x: 0, y: 0 };
}

function segmentPolygon(polygon: Vertex[], x1: number, y1: number, x2: number, y2: number): Vertex[][] {
  const segment = (vertices: Vertex[], segments: { x1: number; y1: number; x2: number; y2: number }[]): Vertex[][] => {
    const r1: Vertex[] = [];
    const r2: Vertex[] = [];
    const r: Vertex[][] = [];
    let end: Vertex | null = null;
    let seg = false;

    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      if (!seg && v.intersection) {
        end = segments.reduce<Vertex | null>((found, s) => {
          if (s.x1 === v.x && s.y1 === v.y) return { x: s.x2, y: s.y2, intersection: false };
          if (s.x2 === v.x && s.y2 === v.y) return { x: s.x1, y: s.y1, intersection: false };
          return found;
        }, null);

        if (end) {
          r1.push({ x: v.x, y: v.y, intersection: false, cut: true }, { ...end, cut: true });
          seg = true;
          r2.push({ x: v.x, y: v.y, intersection: false });

          for (let u = i + 1; u < vertices.length; u++) {
            const vv = vertices[u];
            const isEnd = end!.x === vv.x && end!.y === vv.y;
            r2.push({ x: vv.x, y: vv.y, intersection: isEnd ? false : vv.intersection, cut: isEnd || undefined });
            if (isEnd) break;
          }
          r.push(...segment(r2, segments));
        }
      } else if (!end) {
        r1.push({ x: v.x, y: v.y, intersection: v.intersection, cut: v.cut });
      } else if (end.x === v.x && end.y === v.y) {
        end = null;
      }
    }

    return seg ? [...r, ...segment(r1, segments)] : [...r, r1];
  };

  const vertices: Vertex[] = polygon.map(v => ({ x: v.x, y: v.y, intersection: v.intersection }));
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const excluded: Vertex[] = [];

  let prev = vertices[vertices.length - 1];
  for (let i = 0; i < vertices.length; i++) {
    const curr = vertices[i];
    if (!curr.intersection) {
      const hit = lineLineIntersect(prev.x, prev.y, curr.x, curr.y, x1, y1, x2, y2);
      if (hit.intersect) {
        vertices.splice(i, 0, { x: hit.x, y: hit.y, intersection: true });
        i++;
      }
      prev = curr;
    }
  }

  for (const curr of vertices) {
    if (!curr.intersection) continue;
    let closest: Vertex | null = null;
    let minDist = Infinity;
    for (const v of vertices) {
      if (!v.intersection || v === curr || excluded.includes(v)) continue;
      const d = distance(curr.x, curr.y, v.x, v.y);
      if (d < minDist) { minDist = d; closest = v; }
    }
    if (closest) {
      const mid = { x: (closest.x + curr.x) / 2, y: (closest.y + curr.y) / 2 };
      if (isInsidePolygon(mid, vertices)) {
        segments.push({ x1: curr.x, y1: curr.y, x2: closest.x, y2: closest.y });
      }
      excluded.push(curr);
    }
  }

  return segment(vertices, segments);
}

export class SliceSolver {
  polygons: Polygon[] = [];
  objects: Object[] = [];
  status: number = GameStatus.Paused;
  segmentStart: { x: number; y: number } | null = null;
  segmentEnd: { x: number; y: number } | null = null;
  segmentTime: number = 0;
  completed: boolean = false;
  segmentCount: number = 0;
  maxSegments: number = 3;

  private zkProofData: any = { originalLevel: null, segments: [], finalPieces: [] };

  reset(level?: LevelData | null) {
    this.polygons = [];
    this.objects = [];
    this.status = GameStatus.Paused;
    this.segmentStart = null;
    this.segmentEnd = null;
    this.segmentTime = 0;
    this.completed = false;
    this.segmentCount = 0;
    this.maxSegments = 3;
    this.zkProofData = { originalLevel: null, segments: [], finalPieces: [] };
    if (level) this.loadLevel(level);
  }

  loadLevel(level: LevelData) {
    this.maxSegments = level.segmentCount || 3;
    this.segmentCount = this.maxSegments;
    this.polygons = level.polygons.map(polyData => {
      const poly = this.createPolygon(polyData.map(v => ({ x: v.x, y: v.y, intersection: false })));
      this.initializePolygon(poly);
      return poly;
    });
    this.objects = level.objects.map(o => ({
      type: o.type, x: o.x, y: o.y, valid: false, scale: 1, targetScale: 1
    }));
    this.zkProofData = {
      originalLevel: {
        polygons: level.polygons.map(poly => poly.map(v => ({ x: v.x, y: v.y }))),
        objects: level.objects.map(o => ({ x: o.x, y: o.y })),
        segment_count: level.segmentCount
      },
      segments: [],
      finalPieces: []
    };
    this.status = GameStatus.Running;
  }

  createPolygon(vertices: Vertex[], formTime = 0.6): Polygon {
    return {
      vertices, outlineVertices: [], valid: false, formTime,
      center: { x: 0, y: 0 }, offset: { x: 0, y: 0 },
      lifeTime: 1.3, lastBreathTime: 0.3, angle: 0,
      rotationSpeed: Math.random() > 0.5 ? -3 : 3, scaleFactor: 1, isCut: false,
      heartBeats: [
        { time: Math.random() * 1.5, direction: 0, maxTime: 1.5, speed1: 1, speed2: 1.5 },
        { time: Math.random(), direction: 0, maxTime: 1, speed1: 1, speed2: 1.5 },
        { time: Math.random() * 0.5, direction: 0, maxTime: 0.5, speed1: 1, speed2: 1.5 }
      ]
    };
  }

  initializePolygon(polygon: Polygon) {
    const verts = polygon.vertices;
    if (verts.length <= 2) return;
    let prev = { x: verts[verts.length - 1].x, y: verts[verts.length - 1].y };
    for (let i = 0; i < verts.length;) {
      if (verts.length > 3 && distance(prev.x, prev.y, verts[i].x, verts[i].y) < 0.1) {
        verts.splice(i, 1);
      } else {
        prev = { x: verts[i].x, y: verts[i].y };
        i++;
      }
    }
    this.buildOutlineVertices(polygon, 0.15);
    const sum = verts.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), { x: 0, y: 0 });
    polygon.center = { x: sum.x / verts.length, y: sum.y / verts.length };
    this.applyOutlineScaling(polygon);
  }

  rebuildOutlineVertices(polygon: Polygon) {
    if (polygon.vertices.length <= 2) return;
    const ft = polygon.formTime;
    let factor = 0.15;
    if (ft < 0.3) factor = 0.15 + ft;
    else if (ft < 0.6) factor = 0.15 + (0.6 - ft);
    else if (ft < 0.9) factor = 0.15 + (ft - 0.6);
    this.buildOutlineVertices(polygon, factor);
    this.applyOutlineScaling(polygon);
  }

  buildOutlineVertices(polygon: Polygon, cutFactor: number) {
    const verts = polygon.vertices;
    polygon.outlineVertices = [];
    polygon.isCut = false;
    let prev = { x: verts[verts.length - 1].x, y: verts[verts.length - 1].y };
    for (let i = 0; i < verts.length; i++) {
      const curr = verts[i];
      const angle = vectorAngle(prev.x, prev.y, curr.x, curr.y);
      const dist = distance(prev.x, prev.y, curr.x, curr.y);
      const qdf = curr.cut ? cutFactor : 0.15;
      const end = vectorRotate(dist * qdf, 0, angle);
      const start = vectorRotate(-dist * qdf, 0, angle);
      const endB = vectorRotate(dist * 0.35, 0, angle);
      const startB = vectorRotate(-dist * 0.35, 0, angle);
      polygon.outlineVertices.push(
        { x: prev.x + end.x, y: prev.y + end.y, bx: prev.x + endB.x, by: prev.y + endB.y, cx: prev.x + end.x, cy: prev.y + end.y, quad: 3, cut: verts[verts.length - 1].cut },
        { x: curr.x + start.x, y: curr.y + start.y, bx: curr.x + startB.x, by: curr.y + startB.y, cx: curr.x + start.x, cy: curr.y + start.y, quad: 1, cut: curr.cut },
        { x: curr.x, y: curr.y, bx: curr.x, by: curr.y, cx: curr.x, cy: curr.y, quad: 2, cut: curr.cut }
      );
      prev = { x: curr.x, y: curr.y };
      if (curr.cut) polygon.isCut = true;
    }
  }

  applyOutlineScaling(polygon: Polygon) {
    const s1 = 0.75, s2 = 0.97;
    const { x: cx, y: cy } = polygon.center;
    for (const ov of polygon.outlineVertices) {
      ov.bx *= s1; ov.by *= s1; ov.cx *= s2; ov.cy *= s2;
    }
    const d1x = (cx * s1 - cx) * 0.85, d1y = (cy * s1 - cy) * 0.85;
    const d2x = (cx * s2 - cx) * 1.7, d2y = (cy * s2 - cy) * 1.7;
    for (const ov of polygon.outlineVertices) {
      ov.bx -= d1x; ov.by -= d1y; ov.cx -= d2x; ov.cy -= d2y;
    }
  }

  update(elapsed: number) {
    this.segmentTime = Math.max(0, this.segmentTime - elapsed);
    for (const poly of this.polygons) {
      if (poly.formTime > 0) {
        poly.formTime = Math.max(0, poly.formTime - elapsed * Math.max(poly.formTime * 2, 0.5));
        if (poly.isCut) this.rebuildOutlineVertices(poly);
      }
      if (poly.valid && poly.formTime === 0) {
        if (poly.lastBreathTime > 0) {
          poly.lastBreathTime = Math.max(0, poly.lastBreathTime - elapsed * 2);
        } else if (poly.lifeTime > 0) {
          poly.lifeTime = Math.max(0, poly.lifeTime - elapsed * 2);
          poly.angle += elapsed * Math.PI * poly.rotationSpeed;
        }
      }
      if (poly.isCut) poly.scaleFactor = 1 + poly.formTime * 0.15;
      for (const hb of poly.heartBeats) {
        if (hb.direction === 0) {
          hb.time = Math.min(hb.time + elapsed * hb.speed1, hb.maxTime);
          if (hb.time >= hb.maxTime) hb.direction = 1;
        } else {
          hb.time = Math.max(hb.time - elapsed * hb.speed2, 0);
          if (hb.time <= 0) hb.direction = 0;
        }
      }
    }
    for (const obj of this.objects) {
      if (obj.scale < obj.targetScale) obj.scale = Math.min(obj.targetScale, obj.scale + elapsed * 3);
    }
    if (this.status === GameStatus.Running) {
      if (this.objects.every(o => o.valid)) {
        this.status = GameStatus.Success;
        this.completed = true;
        this.captureZkProofData();
      } else if (this.segmentCount <= 0) {
        this.status = GameStatus.Failed;
        this.completed = true;
      }
    }
  }

  startSegment(x: number, y: number) {
    if (this.status !== GameStatus.Running) return;
    this.segmentStart = { x, y };
    this.segmentEnd = { x, y };
  }

  updateSegment(x: number, y: number) {
    if (this.segmentStart) this.segmentEnd = { x, y };
  }

  endSegment(): boolean {
    if (!this.segmentStart || !this.segmentEnd || this.status !== GameStatus.Running) return false;
    const { x: x1, y: y1 } = this.segmentStart;
    const { x: x2, y: y2 } = this.segmentEnd;
    this.segmentStart = null;
    this.segmentEnd = null;
    if (distance(x1, y1, x2, y2) < 0.5) return false;

    let segmented = false;
    const newPolygons: Polygon[] = [];
    for (const poly of this.polygons) {
      if (poly.valid) { newPolygons.push(poly); continue; }
      const results = segmentPolygon(poly.vertices, x1, y1, x2, y2);
      if (results.length > 1) {
        segmented = true;
        for (const verts of results) {
          if (verts.length >= 3) {
            const newPoly = this.createPolygon(verts, 0.5);
            this.initializePolygon(newPoly);
            newPolygons.push(newPoly);
          }
        }
      } else { newPolygons.push(poly); }
    }
    if (segmented) {
      this.polygons = newPolygons;
      this.segmentCount--;
      this.segmentTime = 0.3;
      this.validateLevel();
      this.zkProofData.segments.push({
        x1: parseFloat(x1.toFixed(2)), y1: parseFloat(y1.toFixed(2)),
        x2: parseFloat(x2.toFixed(2)), y2: parseFloat(y2.toFixed(2))
      });
    }
    return segmented;
  }

  validateLevel() {
    for (const poly of this.polygons) {
      if (poly.valid) continue;
      const contained = this.objects.filter(o =>
        !o.valid && isInsidePolygon({ x: o.x, y: o.y }, poly.vertices)
      );
      if (contained.length === 1 && contained[0].type !== 2) {
        poly.valid = true;
        poly.lifeTime = 1.3;
        poly.rotationSpeed = (Math.random() > 0.5 ? -0.3 : 0.3) * (1 + Math.random());
        contained[0].valid = true;
      }
    }
  }

  captureZkProofData() {
    this.zkProofData.finalPieces = this.polygons
      .filter(poly => poly.valid)
      .map(poly => poly.vertices.map(v => ({
        x: parseFloat(v.x.toFixed(2)), y: parseFloat(v.y.toFixed(2))
      })));
  }

  getProofData() {
    this.captureZkProofData();
    return JSON.parse(JSON.stringify(this.zkProofData));
  }

  getInputs(levelHash: string) {
    const SCALE = 100;
    const TOLERANCE = 10000;
    const toScaledInt = (val: number) => Math.round(val * SCALE);
    const padArray = <T>(arr: T[], size: number, defaultVal: T): T[] => {
      const result = [...arr];
      while (result.length < size) result.push(defaultVal);
      return result.slice(0, size);
    };
    const MAX_POLYGONS = 4, MAX_VERTICES = 14, MAX_OBJECTS = 15;
    const MAX_PARTITIONS = 20, MAX_PARTITION_VERTICES = 14;

    const polygons = padArray(
      this.zkProofData.originalLevel.polygons.map((poly: any) => ({
        vertices: padArray(poly.map((v: any) => ({ x: toScaledInt(v.x), y: toScaledInt(v.y) })), MAX_VERTICES, { x: 0, y: 0 }),
        vertex_count: poly.length
      })), MAX_POLYGONS, { vertices: padArray([] as any[], MAX_VERTICES, { x: 0, y: 0 }), vertex_count: 0 });

    const objects = padArray(
      this.zkProofData.originalLevel.objects.map((o: any) => ({ x: toScaledInt(o.x), y: toScaledInt(o.y) })),
      MAX_OBJECTS, { x: 0, y: 0 });

    const segments = padArray(
      this.zkProofData.segments.map((s: any) => ({ x1: toScaledInt(s.x1), y1: toScaledInt(s.y1), x2: toScaledInt(s.x2), y2: toScaledInt(s.y2) })),
      3, { x1: 0, y1: 0, x2: 0, y2: 0 });

    const partitions = padArray(
      this.zkProofData.finalPieces.map((p: any) => ({
        vertices: padArray(p.map((v: any) => ({ x: toScaledInt(v.x), y: toScaledInt(v.y) })), MAX_PARTITION_VERTICES, { x: 0, y: 0 }),
        vertex_count: p.length
      })), MAX_PARTITIONS, { vertices: padArray([] as any[], MAX_PARTITION_VERTICES, { x: 0, y: 0 }), vertex_count: 0 });
    const cross = (p1: any, p2: any, p3: any) => (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
    const pointOnLine = (p: any, ls: any, le: any) => Math.abs(cross(ls, le, p)) < TOLERANCE;
    const edgeOnLine = (es: any, ee: any, ls: any, le: any) => pointOnLine(es, ls, le) && pointOnLine(ee, ls, le);
    const pointInPolygon = (p: any, verts: any[]) => {
      let w = 0;
      for (let i = 0; i < verts.length; i++) {
        const vi = verts[i], vj = verts[(i + 1) % verts.length], c = cross(vi, vj, p);
        if (vi.y <= p.y && vj.y > p.y && c > 0) w++;
        if (vi.y > p.y && vj.y <= p.y && c < 0) w--;
      }
      return w !== 0;
    };

    const scaledPolygons = this.zkProofData.originalLevel.polygons.map((poly: any) => poly.map((v: any) => ({ x: toScaledInt(v.x), y: toScaledInt(v.y) })));
    const scaledPieces = this.zkProofData.finalPieces.map((p: any) => p.map((v: any) => ({ x: toScaledInt(v.x), y: toScaledInt(v.y) })));
    const scaledObjects = this.zkProofData.originalLevel.objects.map((o: any) => ({ x: toScaledInt(o.x), y: toScaledInt(o.y) }));
    const numSegments = this.zkProofData.segments.length;

    const edge_hints: any[] = [];
    for (let pi = 0; pi < MAX_PARTITIONS; pi++) {
      const ph: any[] = [];
      const part = pi < scaledPieces.length ? scaledPieces[pi] : [];
      for (let i = 0; i < MAX_PARTITION_VERTICES; i++) {
        let hint = { source_type: 0, source_index: 0, edge_index: 0 };
        if (i < part.length) {
          const es = part[i], ee = part[(i + 1) % part.length];
          let found = false;
          for (let polyIdx = 0; polyIdx < scaledPolygons.length && !found; polyIdx++) {
            const poly = scaledPolygons[polyIdx];
            for (let vi = 0; vi < poly.length && !found; vi++) {
              if (edgeOnLine(es, ee, poly[vi], poly[(vi + 1) % poly.length])) { hint = { source_type: 0, source_index: polyIdx, edge_index: vi }; found = true; }
            }
          }
          for (let si = 0; si < numSegments && !found; si++) {
            const s = segments[si];
            if (edgeOnLine(es, ee, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 })) { hint = { source_type: 1, source_index: si, edge_index: 0 }; found = true; }
          }
        }
        ph.push(hint);
      }
      edge_hints.push(ph);
    }

    const object_hints: number[] = [];
    for (let oi = 0; oi < MAX_OBJECTS; oi++) {
      let pi = 0;
      if (oi < scaledObjects.length) { for (let p = 0; p < scaledPieces.length; p++) { if (pointInPolygon(scaledObjects[oi], scaledPieces[p])) { pi = p; break; } } }
      object_hints.push(pi);
    }

    return {
      level_hash: levelHash, polygons, polygon_count: this.zkProofData.originalLevel.polygons.length,
      objects, object_count: this.zkProofData.originalLevel.objects.length,
      segment_count: this.zkProofData.originalLevel.segment_count, segments,
      partitions, partition_count: this.zkProofData.finalPieces.length, edge_hints, object_hints
    };
  }

  getProverToml(data: any): string {
    const lines: string[] = [];
    lines.push(`level_hash = "${data.level_hash}"`, '');
    lines.push(`polygon_count = ${data.polygon_count}`, `object_count = ${data.object_count}`);
    lines.push(`segment_count = ${data.segment_count}`, `partition_count = ${data.partition_count}`);
    lines.push(`object_hints = [${data.object_hints.join(', ')}]`, '');
    for (const poly of data.polygons) { lines.push('[[polygons]]', `vertex_count = ${poly.vertex_count}`, ''); for (const v of poly.vertices) lines.push('[[polygons.vertices]]', `x = ${v.x}`, `y = ${v.y}`, ''); }
    for (const obj of data.objects) lines.push('[[objects]]', `x = ${obj.x}`, `y = ${obj.y}`, '');
    for (const s of data.segments) lines.push('[[segments]]', `x1 = ${s.x1}`, `y1 = ${s.y1}`, `x2 = ${s.x2}`, `y2 = ${s.y2}`, '');
    for (const p of data.partitions) { lines.push('[[partitions]]', `vertex_count = ${p.vertex_count}`, ''); for (const v of p.vertices) lines.push('[[partitions.vertices]]', `x = ${v.x}`, `y = ${v.y}`, ''); }
    for (const ph of data.edge_hints) { lines.push('[[edge_hints]]'); for (const h of ph) lines.push('[[edge_hints.hints]]', `source_type = ${h.source_type}`, `source_index = ${h.source_index}`, `edge_index = ${h.edge_index}`, ''); }
    return lines.join('\n');
  }

  getState() {
    return {
      polygons: this.polygons, objects: this.objects, status: this.status,
      segmentCount: this.segmentCount, maxSegments: this.maxSegments,
      segmentStart: this.segmentStart, segmentEnd: this.segmentEnd,
      segmentTime: this.segmentTime
    };
  }
}

export interface SlicerCallbacks {
  onScoreUpdate: (score: number) => void;
  onLevelUpdate: (level: number, maxLevels: number) => void;
  onPhaseEnd: (player: 1 | 2, proofs: any[]) => void;
  onStatusUpdate: (status: string) => void;
  onTimerUpdate: (remaining: number) => void;
  onProofCollected: (player: 1 | 2, levelIndex: number, proof: any) => void;
}

const SAMPLE_LEVELS: LevelData[] = [
  {
    polygons: [
      [
        {
          "x": 1,
          "y": 9.2
        },
        {
          "x": 1.3,
          "y": 11.4
        },
        {
          "x": 10.2,
          "y": 10.9
        },
        {
          "x": 10.8,
          "y": 7.8
        }
      ],
      [
        {
          "x": 0.6,
          "y": 0.4
        },
        {
          "x": 0.5,
          "y": 3.4
        },
        {
          "x": 10.5,
          "y": 3.1
        },
        {
          "x": 10.5,
          "y": 0.8
        }
      ],
      [
        {
          "x": 2.1,
          "y": 3.6
        },
        {
          "x": 4.1,
          "y": 8.5
        },
        {
          "x": 8,
          "y": 7.9
        },
        {
          "x": 9.2,
          "y": 3.3
        }
      ]
    ],
    objects: [
      {
        "type": 0,
        "x": 10.1,
        "y": 8.6
      },
      {
        "type": 0,
        "x": 1.6,
        "y": 9.7
      },
      {
        "type": 0,
        "x": 6,
        "y": 10
      },
      {
        "type": 0,
        "x": 5.4,
        "y": 6.8
      },
      {
        "type": 0,
        "x": 4.6,
        "y": 2.7
      },
      {
        "type": 0,
        "x": 4.5,
        "y": 0.9
      },
      {
        "type": 0,
        "x": 3.1,
        "y": 4.3
      },
      {
        "type": 0,
        "x": 8,
        "y": 4.2
      },
      {
        "type": 0,
        "x": 2,
        "y": 2.5
      },
      {
        "type": 0,
        "x": 8.2,
        "y": 2.5
      },
      {
        "type": 0,
        "x": 8.4,
        "y": 1.1
      },
      {
        "type": 0,
        "x": 1.8,
        "y": 1
      }
    ],
    hints: [{ "x1": 7.61, "y1": 12.3, "x2": 6.5, "y2": -0.49 }, { "x1": -0.07, "y1": 1.28, "x2": 11.67, "y2": 2.1 }, { "x1": 5.06, "y1": 12.59, "x2": 3.07, "y2": -0.65 }],
    segmentCount: 3
  }
];

export class SlicerScene {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private solver: SliceSolver;
  private callbacks: SlicerCallbacks;
  private animationId: number = 0;
  private lastTime: number = 0;
  private busy: boolean = false;
  private levelIndex: number = 0;
  private animationDelay: number = 0;
  private score: number = 0;
  private sceneAngle: number = 0.03;
  private session: { seed: string } | null = null;
  private currentLevelHints: any[] = [];
  private lastSegment: { start: any; end: any; flashTime: number } | null = null;
  private currentPlayer: 1 | 2 = 1;
  private proofs: any[] = [];
  private attestations: Map<number, any> = new Map();
  private phaseTimeRemaining: number = 90;
  private phaseTimerActive: boolean = false;
  private zoom: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private primaryRgb = '147, 51, 234';
  private accentRgb = '201, 255, 59';

  constructor(canvas: HTMLCanvasElement, callbacks: SlicerCallbacks) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d')!;
    this.solver = new SliceSolver();
    this.callbacks = callbacks;
    const idx = Math.floor(Math.random() * SAMPLE_LEVELS.length);
    this.solver.loadLevel(SAMPLE_LEVELS[idx]);
    this.currentLevelHints = [];
    this.solver.status = GameStatus.Paused;
  }

  start(seed?: string, player?: 1 | 2) {
    this.session = { seed: seed || String(Math.floor(Math.random() * 1000000)) };
    this.levelIndex = 0;
    this.animationDelay = 0;
    this.score = 0;
    this.sceneAngle = Math.PI * 2;
    this.currentPlayer = player || 1;
    this.proofs = [];
    this.attestations = new Map();
    this.phaseTimeRemaining = 90;
    this.phaseTimerActive = false;
    this.callbacks.onScoreUpdate(0);
    this.callbacks.onStatusUpdate('loading');
    this.callbacks.onTimerUpdate(90);
    this.loadCurrentLevel();
  }

  destroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
  }

  getCurrentPlayer(): 1 | 2 { return this.currentPlayer; }
  getProofs(): any[] { return this.proofs; }
  getTimeRemaining(): number { return this.phaseTimeRemaining; }

  startLoop() {
    this.lastTime = performance.now();
    const loop = (now: number) => {
      const elapsed = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;
      this.update(elapsed);
      this.render();
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  handlePointerDown(clientX: number, clientY: number) {
    if (this.busy || this.solver.status !== GameStatus.Running || this.animationDelay > 0) return;
    const p = this.screenToScene(clientX, clientY);
    this.solver.startSegment(p.x, p.y);
  }

  handlePointerMove(clientX: number, clientY: number) {
    if (this.busy || this.solver.status !== GameStatus.Running || this.animationDelay > 0) return;
    const p = this.screenToScene(clientX, clientY);
    this.solver.updateSegment(p.x, p.y);
  }

  handlePointerUp() {
    if (this.busy || this.solver.status !== GameStatus.Running || this.animationDelay > 0) return;
    this.solver.endSegment();
  }


  private screenToScene(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const px = (clientX - rect.left) * dpr;
    const py = (clientY - rect.top) * dpr;
    return {
      x: (px - this.offsetX) / this.zoom,
      y: (py - this.offsetY) / this.zoom
    };
  }

  private async fetchLevel(seed: string, index: number): Promise<LevelData | null> {
    try {
      this.busy = true;
      this.callbacks.onStatusUpdate('loading');
      const response = await fetch(`${ENDPOINT}/slicer/start?seed=${seed}&index=${index}&v=1`);
      const data = await response.json();
      if (data.status === 'ok' && data.level) {
        if (data.attestation) {
          this.attestations.set(index, data.attestation);
        }
        return data.level;
      }
      throw new Error('Failed to load level');
    } catch (err) {
      console.error('[SLICER] Error fetching level:', err);
      return SAMPLE_LEVELS[0];
    } finally {
      this.busy = false;
    }
  }

  private async loadCurrentLevel() {
    if (this.busy) return;
    this.callbacks.onStatusUpdate('loading');
    this.callbacks.onLevelUpdate(this.levelIndex + 1, MAX_LEVELS);
    setTimeout(async () => {
      const level = await this.fetchLevel(this.session!.seed, this.levelIndex);
      if (!level) { this.exitGame(); return; }
      this.currentLevelHints = level.hints || [];
      this.solver.reset(level);
      this.phaseTimerActive = true;
      this.callbacks.onStatusUpdate('playing');
    }, 1);
  }

  private exitGame() {
    this.session = null;
    const idx = Math.floor(Math.random() * SAMPLE_LEVELS.length);
    this.solver.loadLevel(SAMPLE_LEVELS[idx]);
    this.solver.status = GameStatus.Paused;
    this.callbacks.onStatusUpdate('idle');
  }

  private endGame() {
    this.phaseTimerActive = false;
    this.callbacks.onPhaseEnd(this.currentPlayer, this.proofs);
    this.callbacks.onStatusUpdate('ended');
    this.session = null;
    this.solver.loadLevel(SAMPLE_LEVELS[0]);
    this.solver.status = GameStatus.Paused;
  }

  private update(elapsed: number) {
    this.solver.update(elapsed);

    if (this.lastSegment && this.lastSegment.flashTime > 0) {
      this.lastSegment.flashTime -= elapsed;
    }

    if (this.sceneAngle !== 0) {
      if (this.session) {
        this.sceneAngle += Math.PI * elapsed * (this.sceneAngle < Math.PI ? -2 : 2);
        this.sceneAngle = this.sceneAngle % (Math.PI * 2);
        if (this.sceneAngle < Math.PI * 0.2) this.sceneAngle = 0;
      } else {
        this.sceneAngle = (this.sceneAngle + Math.PI * elapsed * 0.02) % (Math.PI * 2);
      }
    }

    if (this.phaseTimerActive && this.solver.status === GameStatus.Running) {
      this.phaseTimeRemaining = Math.max(0, this.phaseTimeRemaining - elapsed);
      this.callbacks.onTimerUpdate(this.phaseTimeRemaining);
      if (this.phaseTimeRemaining <= 0) {
        this.endGame();
        return;
      }
    }

    if (this.animationDelay > 0) {
      this.animationDelay -= elapsed;
      if (this.animationDelay <= 0) {
        this.animationDelay = 0;
        this.levelIndex++;
        if (this.levelIndex >= MAX_LEVELS) { this.endGame(); return; }
        this.callbacks.onLevelUpdate(this.levelIndex + 1, MAX_LEVELS);
        this.loadCurrentLevel();
      }
      return;
    }

    if (this.solver.completed) {
      if (!this.phaseTimerActive) this.phaseTimerActive = true;

      const proofData = this.solver.getProofData();

      if (this.solver.status === GameStatus.Success) {
        const state = this.solver.getState();
        const polyCount = state.polygons.filter(p => p.valid).length;
        const objCount = state.objects.filter(o => o.valid).length;
        const partitions = polyCount;
        const base = polyCount * 30 + objCount * 8;
        const bonus = partitions > objCount ? (partitions - objCount) * 15 : 0;
        const levelScore = base + bonus;
        this.score += levelScore;
        this.callbacks.onScoreUpdate(this.score);
        const attestation = this.attestations.get(this.levelIndex) || null;
        let proverToml = '';
        try {
          const levelHash = attestation?.hashcircom || '0';
          const noirInputs = this.solver.getInputs(String(levelHash));
          proverToml = this.solver.getProverToml(noirInputs);
        } catch (err) {
          console.error('[SLICER] TOML generation failed:', err);
        }

        const scoreData = { polygon_count: polyCount, object_count: objCount, partition_count: partitions };
        this.proofs.push({ levelIndex: this.levelIndex, success: true, score: levelScore, proof: proofData, attestation, proverToml, scoreData });
        this.callbacks.onProofCollected(this.currentPlayer, this.levelIndex, proofData);
        this.animationDelay = 1.5;
      } else if (this.solver.status === GameStatus.Failed) {
        const attestation = this.attestations.get(this.levelIndex) || null;
        this.proofs.push({ levelIndex: this.levelIndex, success: false, score: 0, proof: proofData, attestation, proverToml: '', scoreData: null });
        this.callbacks.onProofCollected(this.currentPlayer, this.levelIndex, proofData);
        this.animationDelay = 1.5;
      }
      this.solver.completed = false;
    }
  }

  private render() {
    const { canvas, context } = this;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;

    context.clearRect(0, 0, canvas.width, canvas.height);
    const sceneSize = 12;
    const margin = 2;
    const total = sceneSize + margin;
    this.zoom = Math.min(canvas.width / total, canvas.height / total);
    const factor = 0.95;
    this.zoom *= factor;

    this.offsetX = (canvas.width - sceneSize * this.zoom) / 2;
    this.offsetY = (canvas.height - sceneSize * this.zoom) / 2;

    context.save();
    context.translate(this.offsetX, this.offsetY);
    context.scale(this.zoom, this.zoom);
    if (this.sceneAngle) {
      context.translate(6, 6);
      context.rotate(this.sceneAngle);
      context.translate(-6, -6);
    }

    this.renderGrid(context);

    if (!this.busy) {
      const state = this.solver.getState();
      for (const polygon of state.polygons) {
        this.renderPolygon(context, polygon);
      }
      for (const obj of state.objects) {
        this.renderObject(context, obj);
      }
      this.renderHints(context);
      this.renderSegmentLine(context);
      if (state.segmentTime > 0) {
        context.save();
        context.globalAlpha = state.segmentTime;
        context.fillStyle = `rgba(${this.accentRgb}, 0.1)`;
        context.fillRect(0, 0, 12, 12);
        context.restore();
      }
    } else {
      this.renderLoading(context);
    }

    context.restore();
  }

  private renderGrid(context: CanvasRenderingContext2D) {
    const spacing = 1.3;
    const time = performance.now() * 0.001;
    const pulse = 0.35 + Math.sin(time * 0.5) * 0.15;

    context.save();
    context.globalAlpha = pulse;
    context.strokeStyle = `rgb(${this.primaryRgb})`;
    context.lineWidth = 0.008;

    for (let x = -2; x <= 14; x += spacing) {
      context.beginPath(); context.moveTo(x, -2); context.lineTo(x, 14); context.stroke();
    }
    for (let y = -2; y <= 14; y += spacing) {
      context.beginPath(); context.moveTo(-2, y); context.lineTo(14, y); context.stroke();
    }
    context.restore();
  }

  private renderPolygon(context: CanvasRenderingContext2D, polygon: Polygon) {
    if (polygon.vertices.length < 3) return;
    if (polygon.valid && polygon.lifeTime <= 0) return;

    const time = performance.now() * 0.001;
    const pulse = 0.7 + Math.sin(time * 2) * 0.3;

    context.save();
    context.translate(polygon.offset.x, polygon.offset.y);
    context.globalAlpha = this.animationDelay ? Math.max(this.animationDelay, 1) : 1;

    if (polygon.valid && polygon.formTime === 0) {
      const alpha = polygon.lifeTime + (0.3 - polygon.lastBreathTime);
      context.globalAlpha = Math.max(0, alpha);
      polygon.scaleFactor = Math.max(0, alpha * 0.8);
    } else {
      polygon.scaleFactor = 1;
    }

    context.translate(polygon.center.x, polygon.center.y);
    context.scale(polygon.scaleFactor, polygon.scaleFactor);
    context.rotate(polygon.angle);
    context.translate(-polygon.center.x, -polygon.center.y);
    context.beginPath();
    if (polygon.outlineVertices && polygon.outlineVertices.length > 2) {
      let currentHB = 0;
      let heartbeat = (polygon.heartBeats[currentHB].time - polygon.heartBeats[currentHB].maxTime * 0.5) * 0.06;
      let startV = polygon.outlineVertices[polygon.outlineVertices.length - 2];
      let midV = polygon.outlineVertices[polygon.outlineVertices.length - 1];
      const ip = { x: startV.x + heartbeat, y: startV.y + heartbeat };
      context.moveTo(ip.x, ip.y);

      for (let i = 0; i < polygon.outlineVertices.length; i++) {
        const v = polygon.outlineVertices[i];
        if (v.quad === 1) { startV = v; context.lineTo(startV.x + heartbeat, startV.y + heartbeat); }
        else if (v.quad === 2) { midV = v; }
        else if (v.quad === 3) {
          context.quadraticCurveTo(midV.x + heartbeat, midV.y + heartbeat, v.x + heartbeat, v.y + heartbeat);
          if (i === polygon.outlineVertices.length - 3) break;
          currentHB++;
          if (currentHB > 1) currentHB = 0;
          heartbeat = (polygon.heartBeats[currentHB].time - polygon.heartBeats[currentHB].maxTime * 0.5) * 0.06;
        }
      }
      context.lineTo(ip.x, ip.y);
    } else {
      context.moveTo(polygon.vertices[0].x, polygon.vertices[0].y);
      for (let i = 1; i < polygon.vertices.length; i++) context.lineTo(polygon.vertices[i].x, polygon.vertices[i].y);
    }
    context.closePath();

    const rgb = polygon.valid ? this.accentRgb : this.primaryRgb;
    const fillAlpha = polygon.valid ? 0.4 : 0.3;
    const fillAlpha2 = polygon.valid ? 0.1 : 0.08;
    const gradient = context.createRadialGradient(polygon.center.x, polygon.center.y, 0, polygon.center.x, polygon.center.y, 5);
    gradient.addColorStop(0, `rgba(${rgb}, ${fillAlpha})`);
    gradient.addColorStop(1, `rgba(${rgb}, ${fillAlpha2})`);
    context.fillStyle = gradient;
    context.fill();

    context.strokeStyle = `rgba(${rgb}, ${(polygon.valid ? 0.8 : 0.7) * pulse})`;
    context.lineWidth = 0.06;
    context.stroke();
    context.strokeStyle = `rgba(${rgb}, ${(polygon.valid ? 0.2 : 0.15) * pulse})`;
    context.lineWidth = 0.15;
    context.stroke();
    for (const v of polygon.vertices) {
      if (v.cut) {
        context.save();
        context.globalAlpha = Math.max(0, polygon.formTime * 2);
        context.fillStyle = '#fff';
        context.beginPath();
        context.arc(v.x, v.y, 0.1, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
    context.restore();
  }

  private renderObject(context: CanvasRenderingContext2D, object: Object) {
    if (object.flyDone) {
      return;
    }
    const time = performance.now() * 0.001;
    const spotPulse = 0.85 + Math.sin(time * 2 + object.x) * 0.15;
    const spotSize = 0.35;
    let scale = object.scale || 1;
    let renderX = object.x, renderY = object.y;
    if (object.valid && object.popTime === undefined) {
      object.popTime = 0;
      object.flyX = object.x; object.flyY = object.y;
      object.targetX = 1; object.targetY = 11;
    }

    if (object.valid && object.popTime !== undefined) {
      object.popTime += 0.016;
      const t = Math.min(object.popTime * 3, 1);
      const bounce = t < 0.5 ? 1 + Math.sin(t * Math.PI) * 0.5 : 1 + Math.sin(t * Math.PI) * 0.2 * (1 - t);
      scale *= bounce;
      if (object.popTime > 0.3) {
        const flyT = Math.min((object.popTime - 0.3) * 2, 1);
        const eased = flyT * flyT * (3 - 2 * flyT);
        renderX = object.flyX! + (object.targetX! - object.flyX!) * eased;
        renderY = object.flyY! + (object.targetY! - object.flyY!) * eased;
        scale *= (1 - eased * 0.8);
        if (flyT >= 1) { object.flyDone = true; return; }
      }
    }

    context.save();
    context.translate(renderX, renderY);
    context.scale(scale, scale);

    const glow = context.createRadialGradient(0, 0, 0, 0, 0, spotSize * 1.8);
    glow.addColorStop(0, `rgba(${this.accentRgb}, 0.5)`);
    glow.addColorStop(0.5, `rgba(${this.accentRgb}, 0.15)`);
    glow.addColorStop(1, 'transparent');

    context.fillStyle = glow;
    context.beginPath();
    context.arc(0, 0, spotSize * 1.8, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = spotPulse * 0.7;
    context.strokeStyle = `rgb(${this.accentRgb})`;
    context.lineWidth = 0.025;
    context.beginPath();
    context.arc(0, 0, spotSize * 0.7 + Math.sin(time * 3) * 0.03, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = spotPulse;
    context.fillStyle = object.valid ? '#a3e635' : '#fff';
    context.beginPath();
    context.arc(0, 0, spotSize * 0.18, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  private renderHints(context: CanvasRenderingContext2D) {
    if (!this.currentLevelHints || this.currentLevelHints.length === 0) return;
    const colors = [
      { stroke: 'rgba(255, 100, 100, 0.8)', glow: 'rgba(255, 100, 100, 0.3)' },
      { stroke: 'rgba(100, 255, 100, 0.8)', glow: 'rgba(100, 255, 100, 0.3)' },
      { stroke: 'rgba(100, 150, 255, 0.8)', glow: 'rgba(100, 150, 255, 0.3)' }
    ];
    const time = performance.now() * 0.001;
    for (let i = 0; i < this.currentLevelHints.length; i++) {
      const hint = this.currentLevelHints[i];
      const color = colors[i % colors.length];
      const pulse = 0.6 + Math.sin(time * 2 + i) * 0.4;

      context.save();
      context.strokeStyle = color.glow;
      context.lineWidth = 0.15;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(hint.x1, hint.y1);
      context.lineTo(hint.x2, hint.y2);
      context.stroke();
      context.strokeStyle = color.stroke;
      context.lineWidth = 0.04;
      context.globalAlpha = pulse;
      context.setLineDash([0.2, 0.15]);
      context.lineDashOffset = -time * 2;
      context.beginPath();
      context.moveTo(hint.x1, hint.y1);
      context.lineTo(hint.x2, hint.y2);
      context.stroke();
      context.setLineDash([]);
      context.globalAlpha = 0.9;

      const midX = (hint.x1 + hint.x2) / 2;
      const midY = (hint.y1 + hint.y2) / 2;
      if (midX >= 0 && midX <= 12 && midY >= 0 && midY <= 12) {
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.beginPath();
        context.arc(midX, midY, 0.35, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = color.stroke;
        context.lineWidth = 0.05;
        context.stroke();
        context.fillStyle = '#fff';
        context.font = '0.4px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText((i + 1).toString(), midX, midY + 0.02);
      }
      context.restore();
    }
  }

  private renderSegmentLine(context: CanvasRenderingContext2D) {
    const state = this.solver.getState();
    const time = performance.now() * 0.001;
    const pulse = 0.7 + Math.sin(time * 8) * 0.3;
    if (state.segmentStart && state.segmentEnd) {
      this.lastSegment = { start: { ...state.segmentStart }, end: { ...state.segmentEnd }, flashTime: 0.4 };
      const { segmentStart: s, segmentEnd: e } = state;
      context.save();
      context.strokeStyle = `rgba(${this.accentRgb}, ${0.9 * pulse})`;
      context.lineWidth = 0.04;
      context.lineCap = 'round';
      context.setLineDash([0.1, 0.08]);
      context.beginPath();
      context.moveTo(s.x, s.y);
      context.lineTo(e.x, e.y);
      context.stroke();
      context.strokeStyle = `rgba(${this.accentRgb}, ${0.25 * pulse})`;
      context.lineWidth = 0.12;
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = `rgba(${this.accentRgb}, ${pulse})`;
      context.beginPath(); context.arc(s.x, s.y, 0.1, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.arc(e.x, e.y, 0.1, 0, Math.PI * 2); context.fill();
      context.restore();
    } else if (this.lastSegment && this.lastSegment.flashTime > 0) {
      const { start, end, flashTime } = this.lastSegment;
      const alpha = flashTime / 0.4;
      context.save();
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
      context.lineWidth = 0.06;
      context.lineCap = 'round';
      context.stroke();
      context.strokeStyle = `rgba(${this.accentRgb}, ${alpha * 0.5})`;
      context.lineWidth = 0.2;
      context.stroke();
      context.restore();
    }
  }

  private renderLoading(context: CanvasRenderingContext2D) {
    const time = performance.now() * 0.001;
    context.save();
    context.globalAlpha = 0.5;
    context.translate(6, 5);
    context.rotate(time * 6);
    context.strokeStyle = `rgba(${this.accentRgb}, 0.9)`;
    context.lineWidth = 0.1;
    context.lineCap = 'round';
    context.beginPath();
    context.arc(0, 0, 1, 0, Math.PI * 1.5);
    context.stroke();
    context.strokeStyle = `rgba(${this.accentRgb}, 0.3)`;
    context.lineWidth = 0.3;
    context.stroke();
    context.restore();
    context.save();
    context.fillStyle = 'rgba(255, 255, 255, 0.7)';
    context.font = '0.4px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.fillText('Generating level', 6, 7);
    context.restore();
  }
}