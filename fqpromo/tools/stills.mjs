// Render review stills from one bundle: node tools/stills.mjs [--scale 0.5] 20 62 130 ...
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderStill, selectComposition } from "@remotion/renderer";

const args = process.argv.slice(2);
const scaleIdx = args.indexOf("--scale");
const scale = scaleIdx >= 0 ? Number(args.splice(scaleIdx, 2)[1]) : 0.5;
const frames = args.map(Number);

await ensureBrowser();
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const composition = await selectComposition({ serveUrl, id: "FlashQuizzPromo" });
for (const frame of frames) {
  const output = path.resolve(`out/stills/f${String(frame).padStart(3, "0")}.png`);
  await renderStill({ composition, serveUrl, output, frame, scale, imageFormat: "png" });
  console.log("wrote", output);
}
