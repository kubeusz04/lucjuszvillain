import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { assetUrl } from "../assetUrl";

const PEOPLE_FILES = [
  { file: "01_casual_female_g.glb", height: 1.68 },
  { file: "02_casual_female_k.glb", height: 1.68 },
  { file: "03_casual_male_g.glb", height: 1.75 },
  { file: "04_casual_male_k.glb", height: 1.75 },
  { file: "05_doctor_male.glb", height: 1.78 },
  { file: "06_elder_female.glb", height: 1.6 },
  { file: "07_little_boy.glb", height: 1.2 },
  { file: "08_police_female.glb", height: 1.7 },
] as const;

/** Cached, normalized pedestrian GLB templates */
export class PeopleLibrary {
  private readonly templates: THREE.Group[] = [];

  static async load(
    onProgress?: (done: number, total: number) => void,
  ): Promise<PeopleLibrary> {
    const lib = new PeopleLibrary();
    const loader = new GLTFLoader();
    let done = 0;
    const total = PEOPLE_FILES.length;

    await Promise.all(
      PEOPLE_FILES.map(async ({ file, height }) => {
        const gltf = await loader.loadAsync(
          assetUrl(`models/people/${file}`),
        );
        lib.templates.push(normalizePerson(gltf.scene, height));
        done += 1;
        onProgress?.(done, total);
      }),
    );

    return lib;
  }

  get ready(): boolean {
    return this.templates.length > 0;
  }

  /** Deep-clone a random character (safe for SkinnedMesh) */
  createInstance(): THREE.Group {
    const src =
      this.templates[Math.floor(Math.random() * this.templates.length)];
    const clone = cloneSkinned(src) as THREE.Group;
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;
      }
    });
    return clone;
  }
}

function normalizePerson(
  scene: THREE.Object3D,
  targetHeight: number,
): THREE.Group {
  const wrap = new THREE.Group();
  const model = scene;
  wrap.add(model);

  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  const height = Math.max(size.y, 0.001);
  model.scale.setScalar(targetHeight / height);

  model.updateMatrixWorld(true);
  box.setFromObject(wrap);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  wrap.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Skinned meshes are costly to frustum-cull incorrectly — keep on
    mesh.frustumCulled = true;
  });

  return wrap;
}
