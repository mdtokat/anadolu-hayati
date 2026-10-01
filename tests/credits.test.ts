import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CREDITS, CREDITS_NOTE, SOFTWARE_CREDITS } from '../src/ui/credits';

describe('CREDITS', () => {
  it('kullanılan her veri kaynağı için atıf içerir (lisans şartı)', () => {
    const all = CREDITS.map((c) => c.text).join(' ');
    expect(all).toMatch(/Copernicus DEM GLO-30/);
    expect(all).toMatch(/DLR e\.V\./);
    expect(all).toMatch(/Airbus/);
    expect(all).toMatch(/geoBoundaries/);
    expect(all).toMatch(/CC BY 4\.0/);
    expect(all).toMatch(/OpenStreetMap/);
    expect(all).toMatch(/ODbL/);
    expect(all).toMatch(/Overture/);
    expect(all).toMatch(/ESA WorldCover/);
  });

  it('her atıfın başlığı, metni ve https bağlantısı vardır', () => {
    for (const credit of [...CREDITS, ...SOFTWARE_CREDITS]) {
      expect(credit.label.length).toBeGreaterThan(0);
      expect(credit.text.length).toBeGreaterThan(10);
      expect(credit.url).toMatch(/^https:\/\//);
    }
  });
});

describe('yazılım atıfları', () => {
  it("package.json'daki çalışma zamanı bağımlılıklarının hepsini kapsar, lisansı belirtir", () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const all = SOFTWARE_CREDITS.map((c) => `${c.label} ${c.text}`).join(' ');
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      ['@dimforge/rapier3d-compat', 'three'].sort(),
    );
    expect(all).toMatch(/Three\.js/);
    expect(all).toMatch(/MIT/);
    expect(all).toMatch(/Rapier/);
    expect(all).toMatch(/Apache-2\.0/);
  });

  it("lisanslar node_modules'taki gerçek lisanslarla uyuşur", () => {
    const license = (name: string): string =>
      (JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')) as { license: string })
        .license;
    expect(license('three')).toBe('MIT');
    expect(license('@dimforge/rapier3d-compat')).toBe('Apache-2.0');
  });
});

describe('README ile tutarlılık', () => {
  /** Bağlantının README'de aranacak anahtarı: GitHub'da `github.com/sahip/depo`, diğerlerinde alan adı. */
  const key = (url: string): string => {
    const u = new URL(url);
    return u.host === 'github.com'
      ? `${u.host}${u.pathname.split('/').slice(0, 3).join('/')}`
      : u.host;
  };

  it('oyundaki her atıf kaynağı README.md atıf bölümünde de geçer', () => {
    const readme = readFileSync('README.md', 'utf8');
    for (const credit of [...CREDITS, ...SOFTWARE_CREDITS]) {
      expect(readme, credit.label).toContain(key(credit.url));
    }
  });

  it("Copernicus atıfının zorunlu ifadeleri hem oyunda hem README.md'de geçer", () => {
    const readme = readFileSync('README.md', 'utf8');
    const ingame = CREDITS.find((c) => c.label === 'Yükseklik verisi')?.text ?? '';
    for (const phrase of [
      'Contains modified Copernicus DEM GLO-30 data',
      'DLR e.V. 2010–2014',
      'Airbus Defence and Space GmbH 2014–2018',
      'provided under COPERNICUS by the European Union and ESA; all rights reserved',
    ]) {
      expect(ingame, phrase).toContain(phrase);
      expect(readme, phrase).toContain(phrase);
    }
  });
});

describe('CREDITS_NOTE', () => {
  it('veri ölçeği ve hayvan ekolojisinin yaklaşıklığını belirtir (CLAUDE.md/README ile tutarlı)', () => {
    expect(CREDITS_NOTE).toMatch(/1:50/);
    expect(CREDITS_NOTE).toMatch(/1:15/);
    expect(CREDITS_NOTE).toMatch(/yaklaşım/);
  });
});
