/**
 * Split Sketchfab "low poly people free sample pack" into 8 per-character GLBs.
 *
 * Usage: node scripts/split-people.mjs
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup } from "@gltf-transform/functions";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC =
  process.argv[2] ??
  "C:/Users/Zawadzki/Desktop/low_poly_people_free_sample_pack.glb";
const OUT =
  process.argv[3] ??
  path.join(__dirname, "../public/models/people");

/** Top-level RootNode children that belong to each character */
const CHARACTERS = [
  {
    id: "01_casual_female_g",
    label: "Casual Female G",
    nodes: ["casual_Female_G", "rig_CharRoot"],
  },
  {
    id: "02_casual_female_k",
    label: "Casual Female K (punk hair)",
    nodes: ["casual_Female_K_", "rig_CharRoot001", "acc_hair_punkin_"],
  },
  {
    id: "03_casual_male_g",
    label: "Casual Male G",
    nodes: ["casual_Male_G", "rig_CharRoot002"],
  },
  {
    id: "04_casual_male_k",
    label: "Casual Male K (glasses)",
    nodes: ["casual_Male_K", "rig_CharRoot003", "acc_intelect_glasses"],
  },
  {
    id: "05_doctor_male",
    label: "Doctor Male",
    nodes: ["Doctor_Male_B", "rig_CharRoot004", "stetho", "boxphone"],
  },
  {
    id: "06_elder_female",
    label: "Elder Female",
    nodes: [
      "elder_Female_A",
      "rig_CharRoot005",
      "acc_intelect_glasses001",
      "hair_oldLady",
    ],
  },
  {
    id: "07_little_boy",
    label: "Little Boy",
    nodes: ["little_boy_B", "rig_CharRoot006", "hair"],
  },
  {
    id: "08_police_female",
    label: "Police Female",
    nodes: ["police_Female_A", "rig_CharRoot007"],
  },
];

function disposeSubtree(node) {
  for (const child of [...node.listChildren()]) {
    disposeSubtree(child);
  }
  node.dispose();
}

function findNode(doc, name) {
  return doc.getRoot().listNodes().find((n) => n.getName() === name) ?? null;
}

async function splitOne(io, char) {
  const doc = await io.read(SRC);
  const rootNode = findNode(doc, "RootNode");
  if (!rootNode) throw new Error("RootNode not found");

  const keep = new Set(char.nodes);
  for (const child of [...rootNode.listChildren()]) {
    if (!keep.has(child.getName())) {
      disposeSubtree(child);
    }
  }

  // Place the character at world origin (rigs are offset in the pack)
  for (const name of char.nodes) {
    const n = findNode(doc, name);
    if (!n) continue;
    if (name.startsWith("rig_CharRoot") || name.startsWith("acc_") || name === "stetho" || name === "boxphone" || name === "hair" || name === "hair_oldLady") {
      // Keep accessory offsets relative to their parent — only zero the main rig
      if (name.startsWith("rig_CharRoot")) {
        n.setTranslation([0, 0, 0]);
      }
    }
  }

  // Empty placeholder empties (casual_Female_G etc.) — remove if empty
  for (const name of char.nodes) {
    const n = findNode(doc, name);
    if (!n) continue;
    if (!n.getMesh() && n.listChildren().length === 0 && !name.startsWith("rig_")) {
      n.dispose();
    }
  }

  // Drop animations — pack keeps idle clips that bloat every split file
  for (const anim of [...doc.getRoot().listAnimations()]) {
    anim.dispose();
  }

  await doc.transform(dedup(), prune());

  const outPath = path.join(OUT, `${char.id}.glb`);
  await io.write(outPath, doc);

  const meshes = doc
    .getRoot()
    .listMeshes()
    .map((m) => m.getName());
  const size = fs.statSync(outPath).size;
  return { outPath, meshes, size };
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(OUT, { recursive: true });

console.log(`Source: ${SRC}`);
console.log(`Output: ${OUT}\n`);

const results = [];
for (const char of CHARACTERS) {
  const r = await splitOne(io, char);
  results.push({ ...char, ...r });
  console.log(
    `✓ ${char.id}.glb  (${(r.size / 1024).toFixed(1)} KB)  meshes: ${r.meshes.join(", ") || "(none)"}`,
  );
}

const manifest = results.map((r) => ({
  id: r.id,
  label: r.label,
  file: `${r.id}.glb`,
  meshes: r.meshes,
}));
fs.writeFileSync(
  path.join(OUT, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log(`\nWrote manifest.json (${results.length} characters)`);
