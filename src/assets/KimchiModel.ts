import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { assetUrl } from "../assetUrl";

const SRC = assetUrl("models/kimchi.glb");
/** World height of one kimchi pickup */
const TARGET_HEIGHT = 0.95;

export class KimchiTemplate {
  private root: THREE.Group | null = null;

  static async load(): Promise<KimchiTemplate> {
    const tpl = new KimchiTemplate();
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(SRC);
    tpl.root = normalizeKimchi(gltf.scene);
    return tpl;
  }

  createInstance(): THREE.Group {
    if (!this.root) return new THREE.Group();
    const clone = this.root.clone(true);
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

function normalizeKimchi(scene: THREE.Object3D): THREE.Group {
  const wrap = new THREE.Group();
  const model = scene;
  wrap.add(model);

  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  // Prefer height; for a flat bowl use the largest dimension so it stays readable
  const ref = Math.max(size.y, size.x * 0.45, size.z * 0.45, 0.001);
  model.scale.setScalar(TARGET_HEIGHT / ref);

  model.updateMatrixWorld(true);
  box.setFromObject(wrap);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  return wrap;
}
