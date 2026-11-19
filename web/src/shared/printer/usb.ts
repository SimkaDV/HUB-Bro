// Связь с принтером через WebUSB: Chrome сам говорит с USB-устройством, без драйвера и программ.
// Первый раз принтер выбирают в окошке Chrome (только по клику человека), дальше Chrome его помнит.
import { useSyncExternalStore } from "react";

/** unsupported — браузер не умеет WebUSB; notPaired — принтер ещё не выбирали; notFound — выбран, но не воткнут. */
export type PrinterLinkState = "unsupported" | "notPaired" | "notFound" | "ready";

export type PrinterLink = { state: PrinterLinkState; name?: string };

type Saved = { vendorId: number; productId: number; serialNumber?: string; name: string };

const SAVED_KEY = "hubbro.printer.device.v2";
const CHUNK = 16 * 1024;

const supported = typeof navigator !== "undefined" && "usb" in navigator;
let device: USBDevice | null = null;
let link: PrinterLink = { state: supported ? "notPaired" : "unsupported" };
const listeners = new Set<() => void>();

export class PrinterError extends Error {}

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

const matches = (d: USBDevice, s: Saved) =>
  d.vendorId === s.vendorId && d.productId === s.productId && (d.serialNumber ?? undefined) === s.serialNumber;

const deviceName = (d: USBDevice) => d.productName || `USB ${d.vendorId.toString(16)}:${d.productId.toString(16)}`;

function update(next: PrinterLink) {
  link = next;
  listeners.forEach((l) => l());
}

async function refresh() {
  const saved = readSaved();
  if (!saved) {
    device = null;
    return update({ state: "notPaired" });
  }
  const list = await navigator.usb.getDevices();
  device = list.find((d) => matches(d, saved)) ?? null;
  update({ state: device ? "ready" : "notFound", name: saved.name });
}

if (supported) {
  void refresh();
  navigator.usb.addEventListener("connect", () => void refresh());
  navigator.usb.addEventListener("disconnect", () => void refresh());
}

export function usePrinterLink(): PrinterLink {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => link,
  );
}

/** Окошко Chrome со списком USB-устройств. false — закрыли, ничего не выбрав. */
export async function pairPrinter(): Promise<boolean> {
  if (!supported) throw new PrinterError("Этот браузер не умеет WebUSB — открой кабинет в Chrome или Edge.");
  let picked: USBDevice;
  try {
    // Фильтра нет: коды производителя XP-365B узнаем, когда подключим его, тогда покажем только его.
    picked = await navigator.usb.requestDevice({ filters: [] });
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return false;
    throw explain(e);
  }
  const old = device;
  if (old && old !== picked) {
    if (old.opened) await old.close().catch(() => {});
    await old.forget?.().catch(() => {});
  }
  const saved: Saved = {
    vendorId: picked.vendorId,
    productId: picked.productId,
    serialNumber: picked.serialNumber ?? undefined,
    name: deviceName(picked),
  };
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  await refresh();
  return true;
}

/**
 * «Отключить принтер» в настройках и «Очистить все данные»: забыть выбранный принтер и все USB-устройства,
 * к которым Chrome дал доступ этому сайту. Только в этом браузере — Chrome снова спросит, к какому подключаться.
 */
export async function forgetPrinter() {
  try {
    localStorage.removeItem(SAVED_KEY);
  } catch {
    // нечего забывать
  }
  if (supported) {
    for (const d of await navigator.usb.getDevices()) {
      if (d.opened) await d.close().catch(() => {});
      await d.forget?.().catch(() => {});
    }
  }
  device = null;
  update({ state: supported ? "notPaired" : "unsupported" });
}

/** Канал, по которому принтеру шлют данные: bulk OUT, лучше у интерфейса класса «принтер» (7). */
function findOut(d: USBDevice) {
  const candidates = d.configuration!.interfaces.flatMap((iface) =>
    iface.alternates.flatMap((alt) =>
      alt.endpoints
        .filter((ep) => ep.direction === "out" && ep.type === "bulk")
        .map((ep) => ({ iface: iface.interfaceNumber, alternate: alt.alternateSetting, endpoint: ep.endpointNumber, printer: alt.interfaceClass === 7 })),
    ),
  );
  return candidates.find((c) => c.printer) ?? candidates[0];
}

const isWindows =
  typeof navigator !== "undefined" &&
  /win/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.userAgent);

/** Принтер забрала система (драйвер) или другая вкладка — текст под Windows и под Mac. */
const NO_ACCESS = isWindows
  ? "Нет доступа к принтеру: его держит Windows (на нём стоит драйвер принтера) или другая вкладка кабинета. Закрой другие вкладки. " +
    "Не помогло — один раз поменяй принтеру драйвер на WinUSB: скачай Zadig (zadig.akeo.ie), в меню Options включи List All Devices, " +
    "выбери Xprinter, справа WinUSB, нажми Replace Driver, потом переткни принтер и нажми «Подключить принтер» заново."
  : "Нет доступа к принтеру: его держит другая вкладка кабинета или macOS. Закрой другие вкладки; если принтер добавлен в системные принтеры — удали его оттуда.";

function explain(e: unknown): PrinterError {
  if (e instanceof PrinterError) return e;
  if (e instanceof DOMException) {
    // На Windows занятый драйвером принтер даёт «Access denied» при open или «Unable to claim interface».
    if (e.name === "SecurityError" || /claim|access denied/i.test(e.message)) return new PrinterError(NO_ACCESS);
    if (e.name === "NetworkError" || e.name === "NotFoundError")
      return new PrinterError("Связь с принтером прервалась. Проверь кабель и питание и попробуй ещё раз.");
    if (e.name === "InvalidStateError") return new PrinterError("Принтер занят. Попробуй ещё раз через пару секунд.");
  }
  return new PrinterError(`Не получилось отправить на принтер: ${e instanceof Error ? e.message : String(e)}`);
}

let queue: Promise<unknown> = Promise.resolve();

/** Отправить байты принтеру. Задания идут по очереди, чтобы две партии не перемешались. */
export function sendToPrinter(bytes: Uint8Array): Promise<void> {
  const job = queue.then(() => send(bytes));
  queue = job.catch(() => {});
  return job;
}

async function send(bytes: Uint8Array) {
  const d = device;
  if (!d) {
    throw new PrinterError(
      link.state === "notPaired" ? "Принтер не подключён — нажми «Подключить принтер» в настройках." : "Принтер не найден — проверь USB и питание.",
    );
  }
  try {
    if (!d.opened) await d.open();
    if (!d.configuration) await d.selectConfiguration(1);
    const out = findOut(d);
    if (!out) throw new PrinterError("Это устройство не принимает данные для печати. Выбери в настройках другой принтер.");
    const iface = d.configuration!.interfaces.find((i) => i.interfaceNumber === out.iface)!;
    if (!iface.claimed) await d.claimInterface(out.iface);
    if (iface.alternate.alternateSetting !== out.alternate) await d.selectAlternateInterface(out.iface, out.alternate);
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const result = await d.transferOut(out.endpoint, bytes.subarray(i, i + CHUNK));
      if (result.status !== "ok") throw new PrinterError("Принтер не принял данные. Проверь, что он включён и крышка закрыта.");
    }
  } catch (e) {
    throw explain(e);
  }
}
