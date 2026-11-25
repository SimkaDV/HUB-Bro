export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "",
  ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/**
 * id товара или категории по названию (FORMAT.md, правило 2): латиница, цифры, «-», до 40 знаков, не занятый.
 * «Широкие трубы» → «shirokie-truby». Даётся один раз при создании и больше не меняется.
 */
export function slugId(name: string, taken: Iterable<string>) {
  const used = new Set(taken);
  const base =
    [...name.toLowerCase()]
      .map((ch) => TRANSLIT[ch] ?? ch)
      .join("")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)
      .replace(/-+$/, "") || "item";
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}
