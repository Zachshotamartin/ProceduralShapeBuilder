import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  cacheDir: ".vite/workflow",
});
await server.listen();
const browser = await chromium.launch({ channel: "chromium" });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  const button = (name) => page.getByRole("button", { name, exact: true }),
    range = (name) => page.getByRole("slider", { name, exact: true });
  async function data(name) {
    const pending = page.waitForEvent("download");
    await button(name).click();
    return readFile(await (await pending).path(), "utf8");
  }
  assert.equal(
    await page.getByRole("combobox", { name: "Start with" }).inputValue(),
    "Spiral stair",
  );
  assert.equal(await range("Copies").inputValue(), "18");
  assert.equal(
    await page.getByRole("combobox", { name: "Input node" }).isVisible(),
    false,
  );
  for (const [name, value] of [
    ["Copies", "12"],
    ["Step rise", "0.3"],
    ["Turn per copy (degrees)", "20"],
  ]) {
    await range(name).fill(value);
    await range(name).dispatchEvent("input");
  }
  const graph = JSON.parse(await data("Save graph JSON")),
    repeat = graph.nodes.at(-1);
  assert.equal(repeat.params.count, 12);
  assert.equal(repeat.params.offset[1], 0.3);
  assert.ok(Math.abs(repeat.params.angle - (20 * Math.PI) / 180) < 1e-6);
  const count = (text) =>
      text.split("\n").filter((l) => l.startsWith("f ")).length,
    before = count(await data("Export mesh OBJ"));
  await button("Add to shape").click();
  assert.equal(count(await data("Export mesh OBJ")), before * 4);
  const added = JSON.parse(await data("Save graph JSON"));
  assert.equal(added.nodes.length, graph.nodes.length + 1);
  assert.ok(added.nodes.at(-1).params.offset[0] > 0);
  await button("Remove latest step").click();
  assert.deepEqual(JSON.parse(await data("Save graph JSON")), graph);
  await page
    .getByRole("combobox", { name: "Start with" })
    .selectOption("Turned lamp");
  await range("Lamp width").fill("3");
  await range("Lamp width").dispatchEvent("input");
  await range("Lamp height").fill("4");
  await range("Lamp height").dispatchEvent("input");
  const lamp = JSON.parse(await data("Save graph JSON")).nodes[0].params
    .profile;
  assert.ok(Math.abs(Math.max(...lamp.map((p) => p[0])) * 2 - 3) < 1e-5);
  assert.ok(
    Math.abs(
      Math.max(...lamp.map((p) => p[1])) -
        Math.min(...lamp.map((p) => p[1])) -
        4,
    ) < 1e-5,
  );
  await page
    .getByRole("combobox", { name: "Start with" })
    .selectOption("Ribbed pavilion");
  assert.equal(await range("Number of ribs").inputValue(), "13");
  const firstPavilion = count(await data("Export mesh OBJ"));
  await range("Number of ribs").fill("20");
  await range("Number of ribs").dispatchEvent("input");
  await range("Rib spacing").fill("0.4");
  await range("Rib spacing").dispatchEvent("input");
  assert.ok(count(await data("Export mesh OBJ")) > firstPavilion);
  const pavilion = JSON.parse(await data("Save graph JSON"));
  assert.equal(pavilion.nodes.at(-1).params.count, 20);
  assert.equal(pavilion.nodes.at(-1).params.offset[2], 0.4);
  assert.equal(pavilion.nodes.at(-1).params.center, true);
  assert.ok(!pavilion.nodes.some((n) => n.type === "taper"));
  await button("1. Draw an arch").click();
  await range("Arch width").fill("4");
  await range("Arch width").dispatchEvent("input");
  await range("Arch height").fill("3");
  await range("Arch height").dispatchEvent("input");
  const arch = JSON.parse(await data("Save graph JSON")).nodes[0].params.points;
  assert.ok(
    Math.abs(
      Math.max(...arch.map((p) => p[0])) -
        Math.min(...arch.map((p) => p[0])) -
        4,
    ) < 1e-5,
  );
  assert.ok(
    Math.abs(
      Math.max(...arch.map((p) => p[1])) -
        Math.min(...arch.map((p) => p[1])) -
        3,
    ) < 1e-5,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("combobox", { name: "Start with" })
    .selectOption("Spiral stair");
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= 390),
  );
  await page
    .locator(".graphics-workbench")
    .screenshot({ path: "/tmp/procedural-simple-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(".graphics-workbench")
    .screenshot({ path: "/tmp/procedural-simple-desktop.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: staircase copies/rise/turn, automatic append, remove step, independent lamp dimensions, advanced controls hidden, 390px layout, and real exports.",
  );
} finally {
  await browser.close();
  await server.close();
}
