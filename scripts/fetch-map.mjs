// Downloads the offline Dhaka basemap (needs internet once; the demo itself runs offline).
// Uses the go-pmtiles CLI to cut the Dhaka bounding box out of the latest Protomaps daily build.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "assets/offline/dhaka.pmtiles");
const CACHE = path.join(ROOT, ".cache/pmtiles");
const VERSION = "1.31.2";
const BBOX = "90.30,23.68,90.50,23.90";

const platform = { win32: "Windows", darwin: "Darwin", linux: "Linux" }[process.platform];
const arch = { x64: "x86_64", arm64: "arm64" }[process.arch];
if (!platform || !arch) throw new Error(`Unsupported platform ${process.platform}/${process.arch}`);
const ext = platform === "Linux" ? "tar.gz" : "zip";
const bin = path.join(CACHE, process.platform === "win32" ? "pmtiles.exe" : "pmtiles");

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

if (fs.existsSync(OUT) && !process.argv.includes("--force")) {
  console.log(`Map already present: ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB). Use --force to refresh.`);
  process.exit(0);
}

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
if (!fs.existsSync(bin)) {
  const archive = path.join(CACHE, `pmtiles.${ext}`);
  const url = `https://github.com/protomaps/go-pmtiles/releases/download/v${VERSION}/go-pmtiles_${VERSION}_${platform}_${arch}.${ext}`;
  console.log(`Downloading pmtiles CLI: ${url}`);
  await download(url, archive);
  // bsdtar (Windows 10+, macOS) and GNU tar both extract these archives.
  execFileSync("tar", ["-xf", archive, "-C", CACHE], { stdio: "inherit" });
  if (process.platform !== "win32") fs.chmodSync(bin, 0o755);
}

// Protomaps keeps recent daily builds; use the newest one that exists.
let build = null;
for (let i = 0; i < 10 && !build; i++) {
  const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");
  const url = `https://build.protomaps.com/${d}.pmtiles`;
  const res = await fetch(url, { method: "HEAD" });
  if (res.ok) build = url;
}
if (!build) throw new Error("No recent Protomaps build found. Check https://maps.protomaps.com/builds/");

console.log(`Extracting Dhaka (${BBOX}) from ${build}`);
execFileSync(bin, ["extract", build, OUT, `--bbox=${BBOX}`, "--maxzoom=15"], { stdio: "inherit" });
console.log(`Done: ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB). Keep a copy on a USB stick for the venue.`);
