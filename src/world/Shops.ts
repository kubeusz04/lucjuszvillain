import * as THREE from "three";
import { blockOrigin, type CityConfig } from "./City";
import { districtForBlock } from "./Districts";

export type ShopKind = "performance" | "paint" | "style";

export interface WorldShop {
  id: string;
  kind: ShopKind;
  name: string;
  x: number;
  z: number;
  radius: number;
}

const SHOP_PLANS: {
  bx: number;
  bz: number;
  kind: ShopKind;
  name: string;
}[] = [
  { bx: 5, bz: 2, kind: "performance", name: "Turbo Shop" },
  { bx: 1, bz: 1, kind: "paint", name: "Paint Shop" },
  { bx: 10, bz: 8, kind: "style", name: "Neon Customs" },
  { bx: 9, bz: 2, kind: "performance", name: "Docks Garage" },
  { bx: 5, bz: 8, kind: "paint", name: "Housing Spray" },
];

export class ShopNetwork {
  readonly shops: WorldShop[] = [];
  readonly group = new THREE.Group();
  private readonly markers: THREE.Mesh[] = [];

  constructor(cfg: CityConfig) {
    for (const plan of SHOP_PLANS) {
      const bx = Math.min(cfg.blocks - 1, plan.bx);
      const bz = Math.min(cfg.blocks - 1, plan.bz);
      const ox = blockOrigin(bx, cfg);
      const oz = blockOrigin(bz, cfg);
      const x = ox + cfg.blockSize * 0.5;
      const z = oz + cfg.blockSize * 0.35;
      const shop: WorldShop = {
        id: `${plan.kind}-${bx}-${bz}`,
        kind: plan.kind,
        name: plan.name,
        x,
        z,
        radius: 9,
      };
      this.shops.push(shop);
      this.buildShopVisual(shop, districtForBlock(bx, bz, cfg.blocks).curb);
    }
  }

  private buildShopVisual(shop: WorldShop, curbColor: number): void {
    const color =
      shop.kind === "performance"
        ? 0x3a5068
        : shop.kind === "paint"
          ? 0x6a3a3a
          : 0x4a2a58;

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(shop.radius * 0.55, shop.radius * 0.55, 0.12, 20),
      new THREE.MeshStandardMaterial({
        color: 0x1a1c20,
        roughness: 0.9,
        metalness: 0.1,
      }),
    );
    pad.position.set(shop.x, 0.06, shop.z);
    pad.receiveShadow = true;
    this.group.add(pad);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(shop.radius * 0.4, shop.radius * 0.52, 24),
      new THREE.MeshBasicMaterial({
        color: shop.kind === "style" ? 0xff44aa : 0xc45c3a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(shop.x, 0.14, shop.z);
    this.group.add(ring);
    this.markers.push(ring);

    const building = new THREE.Mesh(
      new THREE.BoxGeometry(10, 5, 8),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.2,
      }),
    );
    building.position.set(shop.x, 2.5, shop.z - 6);
    building.castShadow = true;
    this.group.add(building);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(7, 1.2, 0.2),
      new THREE.MeshBasicMaterial({
        color: shop.kind === "style" ? 0xff44aa : 0xffcc66,
      }),
    );
    sign.position.set(shop.x, 5.2, shop.z - 2);
    this.group.add(sign);

    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.25, 8),
      new THREE.MeshStandardMaterial({
        color: curbColor,
        roughness: 0.8,
        metalness: 0.15,
      }),
    );
    canopy.position.set(shop.x, 4.2, shop.z);
    this.group.add(canopy);
  }

  nearest(x: number, z: number): WorldShop | null {
    let best: WorldShop | null = null;
    let bestD = Infinity;
    for (const s of this.shops) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < s.radius && d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  updateMarkers(t: number): void {
    for (const m of this.markers) {
      m.position.y = 0.14 + Math.sin(t * 2 + m.position.x) * 0.05;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.55 + Math.sin(t * 3) * 0.25;
    }
  }
}
