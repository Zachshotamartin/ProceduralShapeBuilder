const lampProfile = [
  [0, -1.5],
  [0.75, -1.5],
  [0.79, -1.44],
  [0.76, -1.32],
  [0.28, -1.28],
  [0.18, -1.15],
  [0.12, -0.95],
  [0.12, 0.35],
  [0.22, 0.4],
  [0.34, 0.46],
  [0.95, 0.55],
  [1.04, 0.67],
  [0.68, 1.44],
  [0.59, 1.5],
  [0.55, 1.5],
  [0.98, 0.68],
  [0.29, 0.54],
  [0.18, 0.5],
  [0, 0.5],
];
export const presets = {
  "Turned lamp": [
    {
      id: "profile",
      type: "lathe",
      params: { profile: lampProfile, segments: 64 },
    },
  ],
  "Spiral stair": [
    {
      id: "step",
      type: "box",
      params: { width: 1.5, height: 0.1, depth: 0.5 },
    },
    {
      id: "offset",
      type: "translate",
      inputs: ["step"],
      params: { offset: [0.9, -1.8, 0] },
    },
    {
      id: "steps",
      type: "repeat",
      inputs: ["offset"],
      params: { count: 18, offset: [0, 0.2, 0], angle: 0.25 },
    },
  ],
  "Ribbed pavilion": [
    {
      id: "arch",
      type: "curve",
      params: {
        points: [
          [-1.6, -1, 0],
          [-1.55, 0.4, 0],
          [0, 1.5, 0],
          [1.55, 0.4, 0],
          [1.6, -1, 0],
        ],
        radius: 0.075,
      },
    },
    {
      id: "ribs",
      type: "repeat",
      inputs: ["arch"],
      params: {
        count: 13,
        offset: [0, 0, 0.28],
        connectRibs: true,
        center: true,
      },
    },
  ],
};
export function getPreset(name) {
  return structuredClone(presets[name] || presets["Spiral stair"]);
}
