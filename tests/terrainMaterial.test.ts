import type { DataTexture, Material, WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { LANDCOVER_VALUE } from '../src/data/landcover';
import { BORDERS } from '../src/config';
import { createTerrainMaterial, terrainUniforms } from '../src/world/TerrainMaterial';

type CompileShader = Parameters<Material['onBeforeCompile']>[0];

/** onBeforeCompile'ı sahte bir shader ile çalıştırır; shader'ı döndürür. */
function compile(material: ReturnType<typeof createTerrainMaterial>): CompileShader {
  const shader = {
    uniforms: {},
    vertexShader: 'void main() {\n#include <begin_vertex>\n}',
    fragmentShader: 'void main() {\n#include <color_fragment>\n#include <roughnessmap_fragment>\n}',
  } as unknown as CompileShader;
  material.onBeforeCompile(shader, null as unknown as WebGLRenderer);
  return shader;
}

/** Dokunun piksel verisi (DataTexture her zaman Uint8Array taşır). */
function pixels(texture: DataTexture): Uint8Array {
  return texture.image.data as Uint8Array;
}

describe('createTerrainMaterial — arazi örtüsü', () => {
  const classes = new Uint8Array([LANDCOVER_VALUE.forest, LANDCOVER_VALUE.urban, 0, 0, 0, 0]);

  it('örtü verilince ağırlık dokuları ve ızgara uniform’ları ayarlanır', () => {
    const material = createTerrainMaterial({ classes, width: 3, height: 2, cell: 2 });
    const { uniforms } = compile(material);

    const a = uniforms.uCoverA?.value as DataTexture;
    const b = uniforms.uCoverB?.value as DataTexture;
    expect([a.image.width, a.image.height]).toEqual([3, 2]);
    expect(Array.from(pixels(a).slice(0, 4))).toEqual([255, 0, 0, 0]); // forest → R
    expect(Array.from(pixels(b).slice(4, 8))).toEqual([0, 255, 0, 0]); // urban → G
    expect(uniforms.uCoverGrid?.value).toEqual([1, 0.5, 2, 0]);
    expect(uniforms.uCoverSize?.value).toEqual([3, 2]);
    material.dispose();
  });

  it('örtü yoksa 1×1 sıfır doku: renk eskisi gibi rakım/eğimden gelir', () => {
    const material = createTerrainMaterial();
    const a = compile(material).uniforms.uCoverA?.value as DataTexture;
    expect([a.image.width, a.image.height]).toEqual([1, 1]);
    expect(Array.from(pixels(a))).toEqual([0, 0, 0, 0]);
    material.dispose();
  });

  it('materyal dispose edilince dokular da serbest bırakılır', () => {
    const material = createTerrainMaterial({ classes, width: 3, height: 2, cell: 2 });
    const { uniforms } = compile(material);
    let disposed = 0;
    for (const key of ['uCoverA', 'uCoverB']) {
      (uniforms[key]?.value as DataTexture).addEventListener('dispose', () => disposed++);
    }
    material.dispose();
    expect(disposed).toBe(2);
  });

  it('shader örtü örneklemesini ve kaya zayıflatmayı içerir', () => {
    const material = createTerrainMaterial();
    const { fragmentShader } = compile(material);
    expect(fragmentShader).toContain('texture2D(uCoverA, coverUv)');
    expect(fragmentShader).toContain('uRockCoverDamp');
    material.dispose();
  });
});

describe('createTerrainMaterial — kaplama (yollar, akarsular, il sınırı)', () => {
  const overlay = {
    data: new Uint8Array(4 * 3 * 2).fill(255),
    width: 3,
    height: 2,
    cell: 2,
    origin: { x: -2, z: 4 },
  };

  it('kaplama dokusu ve ızgarası arazi ızgarasıyla aynı formülle bağlanır', () => {
    const material = createTerrainMaterial(null, overlay);
    const { uniforms, fragmentShader } = compile(material);
    const texture = uniforms.uOverlay?.value as DataTexture;
    expect([texture.image.width, texture.image.height]).toEqual([3, 2]);
    expect(uniforms.uOverlayGrid?.value).toEqual([1, -2, 2, 0]);
    expect(uniforms.uOverlaySize?.value).toEqual([3, 2]);
    expect(fragmentShader).toContain('applyOverlay(');
    // Su yüzeyi daha parlak: pürüzlülük kaplamadan ayarlanır.
    expect(fragmentShader).toContain(
      'roughnessFactor = mix(roughnessFactor, uWaterRoughness, terrainWet)',
    );
    material.dispose();
  });

  it('kaplama yoksa 1×1 "uzak" doku: hiçbir şey boyanmaz', () => {
    const material = createTerrainMaterial();
    const texture = compile(material).uniforms.uOverlay?.value as DataTexture;
    expect(Array.from(pixels(texture))).toEqual([255, 255, 255, 255]);
    material.dispose();
  });

  it('zaman ve il sınırı görünürlüğü çalışma zamanında değişir; doku dispose edilir', () => {
    const material = createTerrainMaterial(null, overlay);
    const { uniforms } = compile(material);
    const live = terrainUniforms(material)!;
    expect(live.uBorderOn.value).toBe(BORDERS.visibleByDefault ? 1 : 0);
    live.uTime.value = 12.5;
    live.uBorderOn.value = 0;
    expect(uniforms.uTime?.value).toBe(12.5);
    expect(uniforms.uBorderOn?.value).toBe(0);
    let disposed = 0;
    (uniforms.uOverlay?.value as DataTexture).addEventListener('dispose', () => disposed++);
    material.dispose();
    expect(disposed).toBe(1);
  });
});
