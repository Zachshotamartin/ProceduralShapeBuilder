import { evaluateGraph, meshStats, repeatAxis } from "./graph.js";
import { presets, getPreset } from "./presets.js";
export const metadata = {
  id: "procedural-shape-builder",
  title: "Procedural shape builder",
  description:
    "Connect geometry operations to make turned objects, repeating structures, and curved forms. Every change rebuilds the mesh.",
  technique: "Geometry graphs",
  instructions: [
    "Start with the spiral stair: change Copies to add or remove steps, Step rise to change the height, and Turn per copy to open or tighten the spiral.",
    "Select an earlier Build step to change the size or position of the original piece. All later steps update with it.",
    "Choose Make copies, Twist, Bend, or Narrow toward the top, then Add to shape. Remove latest step or Undo backs out a change.",
    "Try the lamp and pavilion presets for different starting shapes. Export mesh OBJ saves the result; graph JSON saves the editable steps.",
  ],
  limitations: [
    "A bounded geometry graph, not a complete CAD system.",
    "Modifiers operate on mesh vertices; highly bent low-resolution shapes can fold over.",
    "Repeated pieces are combined into one mesh without Boolean union.",
  ],
};
export function createExperiment(ctx) {
  const { THREE, root, ui } = ctx;
  let nodes = getPreset("Spiral stair"),
    output = nodes.at(-1).id,
    selected = output,
    history = [];
  const mesh = new THREE.Mesh(
    undefined,
    new THREE.MeshStandardMaterial({
      color: ctx.palette.body,
      metalness: 0.27,
      roughness: 0.43,
      side: THREE.DoubleSide,
    }),
  );
  root.add(mesh);
  let wire = false;
  ui.select("Start with", Object.keys(presets), "Spiral stair", (name) => {
    nodes = getPreset(name);
    output = nodes.at(-1).id;
    selected = output;
    history = [];
    presetHelp.textContent =
      name === "Ribbed pavilion"
        ? "Each copy is one arch. Number of ribs adds arches; Rib spacing changes the gaps. Select Draw an arch to adjust its width, height, and thickness."
        : name === "Spiral stair"
          ? "Copies adds steps. Step rise changes the height between them; Turn per copy changes how tightly they spiral."
          : "Change the lamp width and height independently. Smoothness changes the number of sides.";
    rebuild(true);
  });
  const presetHelp = ui.note(
    "Copies adds steps. Step rise changes the height between them; Turn per copy changes how tightly they spiral.",
  );
  const heading = ui.section("Build steps"),
    board = document.createElement("div");
  board.className = "geometry-node-list";
  heading.after(board);
  const params = document.createElement("div");
  heading.parentElement.append(params);
  params.className = "geometry-node-parameters";
  const names = {
    lathe: "Turn the lamp profile",
    box: "Make a step",
    curve: "Draw an arch",
    translate: "Position the shape",
    repeat: "Make copies",
    twist: "Twist",
    bend: "Bend",
    taper: "Change the taper",
  };
  ui.note(
    "Start with a finished example. Select a build step, then move its sliders. Changes appear immediately; Undo reverses an edit.",
  );
  const checkpoint = () => {
    history.push(JSON.stringify({ nodes, output, selected }));
    if (history.length > 30) history.shift();
  };
  function field(label, value, min, max, step, fn) {
    const wrap = document.createElement("label");
    wrap.className = "graphics-workbench__field";
    const caption = document.createElement("span");
    caption.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.id = `graph-${selected}-${label.replaceAll(" ", "-")}`;
    wrap.htmlFor = input.id;
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;
    input.setAttribute("aria-label", label);
    const out = document.createElement("output");
    out.textContent = Number(Number(value).toFixed(2));
    out.setAttribute("aria-hidden", "true");
    caption.append(" ", out);
    wrap.append(caption, input);
    input.addEventListener("pointerdown", checkpoint);
    input.addEventListener("keydown", (e) => {
      if (e.key.startsWith("Arrow")) checkpoint();
    });
    input.addEventListener("input", () => {
      out.textContent = Number(Number(input.value).toFixed(2));
      fn(Number(input.value));
      render();
    });
    params.append(wrap);
  }
  function parameters() {
    params.replaceChildren();
    const n = nodes.find((n) => n.id === selected);
    if (!n) return;
    const p = (n.params ||= {});
    const title = document.createElement("strong");
    title.textContent = names[n.type] || n.type;
    params.append(title);
    if (n.inputs?.length === 1) {
      const label = document.createElement("label");
      label.className = "graphics-workbench__field";
      label.textContent = "Input node";
      const select = document.createElement("select");
      select.setAttribute("aria-label", "Input node");
      for (const item of nodes.filter((item) => item.id !== n.id)) {
        const opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = item.id;
        select.append(opt);
      }
      select.value = n.inputs[0];
      select.addEventListener("change", () => {
        checkpoint();
        const old = n.inputs[0];
        n.inputs[0] = select.value;
        try {
          const test = evaluateGraph(nodes, output);
          test.dispose();
          rebuild();
        } catch (error) {
          n.inputs[0] = old;
          select.value = old;
          ctx.setStatus(error.message);
        }
      });
      label.append(select);
      const advanced = document.createElement("details"),
        summary = document.createElement("summary");
      summary.textContent = "Advanced: change the input";
      advanced.append(summary, label);
      params.append(advanced);
    }
    if (["twist", "bend", "taper"].includes(n.type))
      field(
        n.type === "taper" ? "Top width (%)" : "Angle (degrees)",
        n.type === "taper" ? (1 + p.amount) * 100 : (p.amount * 180) / Math.PI,
        n.type === "taper" ? 15 : -140,
        n.type === "taper" ? 300 : 140,
        n.type === "taper" ? 5 : 1,
        (v) =>
          (p.amount = n.type === "taper" ? v / 100 - 1 : (v * Math.PI) / 180),
      );
    if (n.type === "repeat") {
      field(
        p.connectRibs ? "Number of ribs" : "Copies",
        p.count,
        1,
        30,
        1,
        (v) => (p.count = v),
      );
      field(
        "Turn per copy (degrees)",
        ((p.angle || 0) * 180) / Math.PI,
        -40,
        40,
        1,
        (v) => (p.angle = (v * Math.PI) / 180),
      );
      p.offset ||= [0.4, 0.2, 0];
      const axis = repeatAxis(p.offset);
      field(
        p.connectRibs
          ? "Rib spacing"
          : ["Horizontal spacing", "Step rise", "Depth spacing"][axis],
        p.offset[axis],
        p.connectRibs ? 0.16 : -Math.max(3, Math.abs(p.offset[axis]) * 2),
        Math.max(3, Math.abs(p.offset[axis]) * 2),
        0.01,
        (v) => {
          p.offset[axis] = v;
        },
      );
    }
    if (n.type === "lathe") {
      field("Smoothness", p.segments, 8, 96, 1, (v) => (p.segments = v));
      const width = 2 * Math.max(...p.profile.map((v) => v[0])),
        ys = p.profile.map((v) => v[1]),
        height = Math.max(...ys) - Math.min(...ys);
      field("Lamp width", width, 0.5, 4, 0.05, (v) => {
        const ratio = v / (2 * Math.max(...p.profile.map((v) => v[0])));
        p.profile = p.profile.map(([x, y]) => [x * ratio, y]);
      });
      field("Lamp height", height, 1, 5, 0.05, (v) => {
        const ys = p.profile.map((v) => v[1]),
          lo = Math.min(...ys),
          hi = Math.max(...ys),
          center = (lo + hi) / 2,
          ratio = v / (hi - lo);
        p.profile = p.profile.map(([x, y]) => [
          x,
          center + (y - center) * ratio,
        ]);
      });
    }
    if (n.type === "curve") {
      for (const [label, axis, min, max] of [
        ["Arch width", 0, 1, 6],
        ["Arch height", 1, 1, 5],
      ]) {
        const values = p.points.map((v) => v[axis]),
          lo = Math.min(...values),
          hi = Math.max(...values);
        field(label, hi - lo, min, max, 0.05, (value) => {
          const values = p.points.map((v) => v[axis]),
            lo = Math.min(...values),
            hi = Math.max(...values),
            center = axis === 1 ? lo : (lo + hi) / 2;
          p.points = p.points.map((point) =>
            point.map((v, i) =>
              i === axis ? center + ((v - center) * value) / (hi - lo) : v,
            ),
          );
        });
      }
      field(
        "Rib thickness",
        p.radius * 2,
        0.01,
        0.2,
        0.005,
        (v) => (p.radius = v / 2),
      );
    }
    if (n.type === "translate") {
      p.offset ||= [0, 0, 0];
      ["Move left / right", "Move up / down", "Move forward / back"].forEach(
        (name, axis) =>
          field(name, p.offset[axis], -3, 3, 0.05, (v) => (p.offset[axis] = v)),
      );
    }
    if (n.type === "box")
      for (const key of ["width", "height", "depth"])
        field(`Step ${key}`, p[key], 0.05, 3, 0.05, (v) => (p[key] = v));
  }
  function render() {
    try {
      const g = evaluateGraph(nodes, output);
      mesh.geometry?.dispose();
      mesh.geometry = g;
      const s = meshStats(g);
      ctx.setStatus(
        `${nodes.length} build steps · ${s.triangles.toLocaleString()} triangles · editing ${names[nodes.find((n) => n.id === selected)?.type] || "shape"}`,
      );
      ctx.invalidate();
    } catch (error) {
      ctx.setStatus(error.message);
    }
  }
  function rebuild(fit = false) {
    board.replaceChildren();
    for (const n of nodes) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `${nodes.indexOf(n) + 1}. ${names[n.type] || n.type}`;
      b.setAttribute("aria-pressed", String(selected === n.id));
      b.style.cssText =
        "display:block;width:100%;margin:0 0 8px;text-align:left";
      b.addEventListener("click", () => {
        selected = n.id;
        rebuild();
      });
      board.append(b);
    }
    parameters();
    render();
    if (fit) ctx.fit();
  }
  let newType = "repeat";
  ui.section("Add a step");
  ui.select(
    "What should happen next?",
    [
      { value: "repeat", label: "Make copies" },
      { value: "twist", label: "Twist the shape" },
      { value: "bend", label: "Bend the shape" },
      { value: "taper", label: "Narrow toward the top" },
    ],
    newType,
    (v) => (newType = v),
  );
  ui.note(
    "The new step is applied to the whole shape. Select it in Build steps to adjust the result.",
  );
  ui.button(
    "Add to shape",
    () => {
      const id = `${newType}-${Date.now().toString(36)}`;
      const g = evaluateGraph(nodes, output);
      g.computeBoundingBox();
      const spacing = g.boundingBox.max.x - g.boundingBox.min.x;
      g.dispose();
      const candidate = [
        ...nodes,
        {
          id,
          type: newType,
          inputs: [output],
          params:
            newType === "repeat"
              ? {
                  count: 4,
                  offset: [Math.min(12, spacing * 1.15), 0, 0],
                  angle: 0,
                }
              : { amount: newType === "taper" ? -0.3 : 0.3 },
        },
      ];
      const test = evaluateGraph(candidate, id);
      test.dispose();
      checkpoint();
      nodes = candidate;
      output = id;
      selected = id;
      rebuild(true);
    },
    { primary: true },
  );
  ui.button("Remove latest step", () => {
    if (nodes.length < 2) return;
    const last = nodes.find((n) => n.id === output);
    if (!last.inputs?.length) {
      ctx.setStatus("The source geometry cannot be removed.");
      return;
    }
    checkpoint();
    nodes = nodes.filter((n) => n.id !== output);
    output = last.inputs[0];
    selected = output;
    rebuild(true);
  });
  ui.button("Undo", () => {
    const old = history.pop();
    if (!old) return;
    ({ nodes, output, selected } = JSON.parse(old));
    rebuild(true);
  });
  ui.toggle("Wireframe", wire, (v) => {
    wire = v;
    mesh.material.wireframe = v;
    ctx.invalidate();
  });
  ui.button("Export mesh OBJ", () =>
    ctx.exportOBJ(mesh, "procedural-shape.obj"),
  );
  ui.button("Save graph JSON", () =>
    ctx.download(
      "geometry-graph.json",
      JSON.stringify({ nodes, output }, null, 2),
      "application/json",
    ),
  );
  ui.file(
    "Load graph JSON",
    async (file) => {
      if (file.size > 150000) throw new Error("Graph file exceeds 150 KB.");
      const data = JSON.parse(await file.text());
      const test = evaluateGraph(data.nodes, data.output);
      test.dispose();
      checkpoint();
      nodes = data.nodes;
      output = data.output;
      selected = output;
      rebuild(true);
    },
    { accept: ".json" },
  );
  ui.note(
    "Drag the background to orbit the finished shape. The build steps stay editable, so you can return to an earlier step at any time.",
  );
  rebuild(true);
  return {};
}
