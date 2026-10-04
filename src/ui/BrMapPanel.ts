import './ui.css';
import type { Circle } from '../battleRoyale/area';
import type { ProvinceShape } from '../data/region';
import { provinceMapPaths } from './brFormat';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Battle Royale haritası (`M`; BR.6): iller (maç alanı vurgulu), şimdiki ve sonraki güvenli daire, oyuncunun konumu ve
 * bakışı. Oyun donmaz (ekranın ortasında yarı saydam pano); açıkken kare başına `update` çağrılır.
 */
export class BrMapPanel {
  private readonly root = document.createElement('div');
  private readonly svg = document.createElementNS(SVG_NS, 'svg');
  private readonly current = document.createElementNS(SVG_NS, 'circle');
  private readonly next = document.createElementNS(SVG_NS, 'circle');
  private readonly player = document.createElementNS(SVG_NS, 'path');
  private readonly caption = document.createElement('p');
  private readonly paths = new Map<string, SVGPathElement>();
  /** Haritanın ölçeği (oyun m / SVG birimi; çizgi kalınlıkları buna göre). */
  private readonly unit: number;

  constructor(parent: HTMLElement, provinces: readonly ProvinceShape[]) {
    this.root.className = 'br-map';
    this.root.hidden = true;
    const map = provinceMapPaths(provinces);
    const { x, y, w, h } = map.viewBox;
    this.unit = Math.max(w, h) / 600;
    this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    this.svg.classList.add('br-map-svg');
    this.svg.style.setProperty('--u', String(this.unit));
    for (const p of map.provinces) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', p.d);
      path.setAttribute('fill-rule', 'evenodd');
      path.classList.add('br-map-province');
      this.paths.set(p.name, path);
      this.svg.append(path);
    }
    for (const p of map.provinces) {
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(Math.round(p.cx)));
      label.setAttribute('y', String(Math.round(p.cz)));
      // Büyük harita (~1100 px): yazı ≈ 11 px.
      label.setAttribute('font-size', String(Math.round(map.span / 100)));
      label.setAttribute('stroke-width', String(Math.round(map.span / 500)));
      label.classList.add('br-map-label');
      label.textContent = p.name;
      this.svg.append(label);
    }
    this.next.classList.add('br-map-next');
    this.current.classList.add('br-map-zone');
    this.player.classList.add('br-map-player');
    // Ok: ucu yukarıda (−y); `transform` ile konum/dönüş verilir.
    const s = this.unit * 9;
    this.player.setAttribute(
      'd',
      `M0 ${-s}L${s * 0.6} ${s * 0.7}L0 ${s * 0.3}L${-s * 0.6} ${s * 0.7}Z`,
    );
    this.svg.append(this.next, this.current, this.player);
    this.caption.className = 'br-map-caption';
    this.root.append(this.svg, this.caption);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** Maç alanının illeri vurgulanır. */
  setArea(names: readonly string[]): void {
    for (const [name, path] of this.paths)
      path.dataset.state = names.includes(name) ? 'area' : 'out';
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Daireler, oyuncu (`yaw`: ileri = (−sin, −cos)) ve alt yazı. */
  update(
    current: Circle,
    next: Circle | null,
    player: { x: number; z: number; yaw: number },
    caption: string,
  ): void {
    setCircle(this.current, current);
    this.next.style.display = next ? '' : 'none';
    if (next) setCircle(this.next, next);
    const deg = (-player.yaw * 180) / Math.PI;
    this.player.setAttribute(
      'transform',
      `translate(${player.x.toFixed(1)} ${player.z.toFixed(1)}) rotate(${deg.toFixed(1)})`,
    );
    if (this.caption.textContent !== caption) this.caption.textContent = caption;
  }

  dispose(): void {
    this.root.remove();
  }
}

function setCircle(el: SVGCircleElement, c: Circle): void {
  el.setAttribute('cx', c.x.toFixed(1));
  el.setAttribute('cy', c.z.toFixed(1));
  el.setAttribute('r', Math.max(c.r, 0).toFixed(1));
}
