import type { Inventory, ItemStack } from './Inventory';

/**
 * Ganimet listesinden envantere alma (saf). Ganimet, kaynağın tuttuğu değiştirilebilir bir yığın listesidir; alınan
 * kısım listeden düşer, sığmayanlar listede kalır (kaynak sonra yeniden açılabilir).
 */

/** `list[index]` yığınından sığdığı kadarını envantere alır; alınan yığını döner (hiç sığmazsa null). */
export function takeStack(
  list: ItemStack[],
  index: number,
  inventory: Inventory,
): ItemStack | null {
  const stack = list[index];
  if (!stack) return null;
  const rest = inventory.add(stack.id, stack.count);
  const taken = stack.count - rest;
  if (taken <= 0) return null;
  if (rest === 0) list.splice(index, 1);
  else stack.count = rest;
  return { id: stack.id, count: taken };
}

/** Listedeki her yığını sığdığı kadar alır; alınan yığınları döner. */
export function takeAllStacks(list: ItemStack[], inventory: Inventory): ItemStack[] {
  const taken: ItemStack[] = [];
  for (let i = 0; i < list.length;) {
    const before = list.length;
    const got = takeStack(list, i, inventory);
    if (got) taken.push(got);
    // Yığın tamamen alındıysa liste kısaldı (aynı dizin sıradaki yığın); kısmen/hiç alınmadıysa ilerle.
    if (list.length === before) i++;
  }
  return taken;
}
