import * as THREE from "three";

const TILE_OFFSETS: [number, number][] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

export interface WrapTile {
  group: THREE.Group;
  ix: number;
  iz: number;
}

/**
 * Visual copies of the city around the real tile so wrap edges
 * look continuous. Call updateCityWrapTiles each frame to hide
 * far tiles (avoids drawing ~8× city geometry at once).
 */
export function addCityWrapTiles(
  scene: THREE.Scene,
  cityGroup: THREE.Group,
  citySize: number,
): WrapTile[] {
  const tiles: WrapTile[] = [];

  for (const [ix, iz] of TILE_OFFSETS) {
    const clone = cityGroup.clone(true);
    clone.position.set(ix * citySize, 0, iz * citySize);
    clone.visible = false;
    clone.matrixAutoUpdate = true;

    const remove: THREE.Object3D[] = [];
    clone.traverse((obj) => {
      if ((obj as THREE.Light).isLight) {
        remove.push(obj);
        return;
      }
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;
      }
    });
    for (const obj of remove) {
      obj.parent?.remove(obj);
    }

    scene.add(clone);
    tiles.push({ group: clone, ix, iz });
  }

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(citySize * 3.6, citySize * 3.6),
    new THREE.MeshStandardMaterial({
      color: 0x141612,
      roughness: 1,
      metalness: 0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(citySize / 2, -0.1, citySize / 2);
  ground.receiveShadow = true;
  ground.frustumCulled = true;
  scene.add(ground);

  return tiles;
}

/** How close to an edge (world units) before showing the neighbor tile */
const EDGE_MARGIN = 95;

/**
 * Only show wrap tiles for edges the camera is near.
 * Corner tiles require proximity to both axes.
 */
export function updateCityWrapTiles(
  tiles: WrapTile[],
  cameraPos: THREE.Vector3,
  citySize: number,
): void {
  const cx = cameraPos.x;
  const cz = cameraPos.z;
  const nearLoX = cx < EDGE_MARGIN;
  const nearHiX = cx > citySize - EDGE_MARGIN;
  const nearLoZ = cz < EDGE_MARGIN;
  const nearHiZ = cz > citySize - EDGE_MARGIN;

  for (const tile of tiles) {
    const needX =
      tile.ix === 0 || (tile.ix < 0 ? nearLoX : nearHiX);
    const needZ =
      tile.iz === 0 || (tile.iz < 0 ? nearLoZ : nearHiZ);
    tile.group.visible = needX && needZ;
  }
}
