import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const num = (n, fallback, min, max) =>
  Math.min(
    max,
    Math.max(min, Number.isFinite(Number(n)) ? Number(n) : fallback),
  );
export function validateGraph(nodes, output) {
  if (!Array.isArray(nodes) || nodes.length > 40)
    throw new Error("Use between 1 and 40 nodes.");
  const map = new Map(nodes.map((n) => [n.id, n]));
  if (map.size !== nodes.length) throw new Error("Node IDs must be unique.");
  const active = new Set(),
    done = new Set();
  function visit(id) {
    if (active.has(id)) throw new Error("Connections cannot form a cycle.");
    if (done.has(id)) return;
    const n = map.get(id);
    if (!n) throw new Error(`Missing input: ${id}`);
    active.add(id);
    for (const input of n.inputs || []) visit(input);
    active.delete(id);
    done.add(id);
  }
  visit(output);
  return map;
}
function validatePoints(points, dimensions) {
  if (
    !Array.isArray(points) ||
    points.length < 2 ||
    points.length > 128 ||
    points.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== dimensions ||
        p.some((x) => !Number.isFinite(x) || Math.abs(x) > 100),
    )
  )
    throw new Error("Profiles need 2–128 finite points within 100 units.");
}
export function repeatAxis(offset = [0, 0, 1]) {
  validateOffset(offset);
  return offset.reduce(
    (axis, value, index) =>
      Math.abs(value) > Math.abs(offset[axis]) ? index : axis,
    0,
  );
}
function validateOffset(offset) {
  if (
    !Array.isArray(offset) ||
    offset.length !== 3 ||
    offset.some((value) => !Number.isFinite(value) || Math.abs(value) > 100)
  )
    throw new Error(
      "Offsets require three finite coordinates within 100 units.",
    );
  return offset;
}
function validateGeometry(g) {
  const positions = g?.attributes?.position;
  if (
    !positions ||
    !positions.count ||
    positions.array.some(
      (value) => !Number.isFinite(value) || Math.abs(value) > 1000000,
    )
  ) {
    g?.dispose();
    throw new Error(
      "Geometry must contain finite positions within one million units.",
    );
  }
}
function unindexed(g) {
  const result = g.index ? g.toNonIndexed() : g;
  result.deleteAttribute("uv");
  result.deleteAttribute("normal");
  return result;
}
function modify(g, type, p) {
  const a = g.getAttribute("position");
  g.computeBoundingBox();
  const bounds = g.boundingBox,
    height = Math.max(0.001, bounds.max.y - bounds.min.y);
  for (let i = 0; i < a.count; i++) {
    let x = a.getX(i),
      y = a.getY(i),
      z = a.getZ(i);
    const t = (y - bounds.min.y) / height;
    if (type === "twist") {
      const angle = t * num(p.amount, 1, -6.28, 6.28),
        c = Math.cos(angle),
        s = Math.sin(angle);
      [x, z] = [x * c - z * s, x * s + z * c];
    } else if (type === "taper") {
      const scale = 1 + num(p.amount, 0.4, -0.85, 2) * t;
      x *= scale;
      z *= scale;
    } else if (type === "bend") {
      const a = num(p.amount, 0.5, -2.5, 2.5);
      if (Math.abs(a) > 0.0001) {
        const angle = t * a,
          r = height / a;
        const radius = r + x;
        x = radius * Math.cos(angle) - r;
        y = radius * Math.sin(angle) + bounds.min.y;
      }
    }
    a.setXYZ(i, x, y, z);
  }
  a.needsUpdate = true;
  return g;
}
export function evaluateGraph(nodes, output) {
  const map = validateGraph(nodes, output),
    cache = new Map();
  function build(id) {
    if (cache.has(id)) return cache.get(id).clone();
    const node = map.get(id),
      p = node.params || {};
    let g;
    switch (node.type) {
      case "lathe": {
        const profile = p.profile || [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ];
        validatePoints(profile, 2);
        const points = profile.map(([r, y]) => new THREE.Vector2(r, y));
        g = unindexed(
          new THREE.LatheGeometry(points, num(p.segments, 48, 8, 96)),
        );
        break;
      }
      case "box":
        g = unindexed(
          new THREE.BoxGeometry(
            num(p.width, 1, 0.05, 10),
            num(p.height, 1, 0.05, 10),
            num(p.depth, 1, 0.05, 10),
            1,
            12,
            1,
          ),
        );
        break;
      case "curve": {
        const profile = p.points || [
          [-1, 0, 0],
          [0, 2, 0],
          [1, 0, 0],
        ];
        validatePoints(profile, 3);
        const points = profile.map((v) => new THREE.Vector3(...v));
        g = unindexed(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(points),
            64,
            num(p.radius, 0.06, 0.01, 0.4),
            8,
            false,
          ),
        );
        break;
      }
      case "twist":
      case "taper":
      case "bend":
        g = modify(build(node.inputs?.[0]), node.type, p);
        break;
      case "translate": {
        const offset = validateOffset(p.offset ?? [0, 0, 0]);
        g = build(node.inputs?.[0]);
        g.translate(...offset);
        break;
      }
      case "repeat": {
        const offset = validateOffset(p.offset ?? [0.4, 0.2, 0]);
        const original = build(node.inputs?.[0]),
          copies = [],
          count = Math.round(num(p.count, 6, 1, 40));
        if (original.attributes.position.count * count > 600000) {
          original.dispose();
          throw new Error(
            "Reduce repeat count: interactive geometry budget exceeded.",
          );
        }
        for (let i = 0; i < count; i++) {
          const copy = original.clone();
          if (p.radial) {
            const angle = (i * 2 * Math.PI) / count,
              r = num(p.radius, 1, 0, 10);
            copy.rotateY(-angle);
            copy.translate(Math.cos(angle) * r, 0, Math.sin(angle) * r);
          } else {
            copy.translate(offset[0] * i, offset[1] * i, offset[2] * i);
            copy.rotateY(num(p.angle, 0, -3.14, 3.14) * i);
          }
          copies.push(copy);
        }
        if (p.connectRibs && count > 1) {
          const profile = map.get(node.inputs?.[0]);
          if (profile?.type === "curve") {
            const points = profile.params.points,
              top = points.reduce((a, b) => (b[1] > a[1] ? b : a)),
              anchors = [points[0], top, points.at(-1)];
            for (const anchor of anchors) {
              const path = Array.from({ length: count }, (_, i) =>
                new THREE.Vector3(...anchor)
                  .add(new THREE.Vector3(...offset).multiplyScalar(i))
                  .applyAxisAngle(
                    new THREE.Vector3(0, 1, 0),
                    num(p.angle, 0, -3.14, 3.14) * i,
                  ),
              );
              if (path.some((point) => point.distanceTo(path[0]) > 1e-5))
                copies.push(
                  unindexed(
                    new THREE.TubeGeometry(
                      new THREE.CatmullRomCurve3(path),
                      Math.max(8, count * 4),
                      num(profile.params.radius, 0.075, 0.01, 0.4) * 0.7,
                      8,
                      false,
                    ),
                  ),
                );
            }
          }
        }
        g = mergeGeometries(copies);
        if (p.center) g.center();
        copies.forEach((c) => c.dispose());
        original.dispose();
        break;
      }
      case "combine": {
        const inputs = node.inputs.map(build);
        if (
          inputs.reduce((sum, g) => sum + g.attributes.position.count, 0) >
          600000
        ) {
          inputs.forEach((g) => g.dispose());
          throw new Error("Combined mesh exceeds geometry budget.");
        }
        g = mergeGeometries(inputs);
        inputs.forEach((c) => c.dispose());
        break;
      }
      default:
        throw new Error(`Unknown node: ${node.type}`);
    }
    if (g.attributes.position.count > 600000) {
      g.dispose();
      throw new Error(
        "This graph exceeds the interactive geometry budget. Reduce repeat counts.",
      );
    }
    validateGeometry(g);
    cache.set(id, g.clone());
    return g;
  }
  try {
    const geometry = build(output);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  } finally {
    cache.forEach((g) => g.dispose());
  }
}
export function meshStats(geometry) {
  return {
    vertices: geometry.attributes.position.count,
    triangles: Math.floor(geometry.attributes.position.count / 3),
  };
}
