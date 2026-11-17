// Комплектация и пульт: партии печати и этапы заказа. Описание — docs/ORDERS.md, «Комплектация и пульт».

/** Почему бирку из партии не расклеили. Такой заказ возвращается в очередь. */
export type IssueReason = "notPrinted" | "badCode" | "damaged" | "other";

export type BatchIssue = {
  orderId: string;
  reason: IssueReason;
  comment?: string;
};

/** Перепечатка до расклейки: вся партия или одна бирка (`orderId`). Пишется в историю партии. */
export type Reprint = {
  at: string;
  /** Нет — перепечатали всю партию. */
  orderId?: string;
};

/** Партия печати: заказы, которые комплектация отправила на пульт одним листом. */
export type PrintBatch = {
  id: string;
  /** Порядковый номер партии: №1, №2… */
  number: number;
  /** Когда собрали в комплектации, ISO. */
  createdAt: string;
  /** Заказы в порядке печати. */
  orderIds: string[];
  /** Как собирали: порядок и фильтр очереди, текстом. */
  note: string;
  /** Когда принтер принял задание с бирками партии. Ставится только после успешной отправки. */
  printedAt?: string;
  /** Перепечатки после первой печати, по порядку. */
  reprints?: Reprint[];
  /** Когда нажали «Партия расклеена». */
  stuckAt?: string;
  /** Вернули в очередь, не расклеив. Запись остаётся в истории. */
  cancelledAt?: string;
  /** Бирки, которые не расклеили, — эти заказы снова в очереди. */
  issues: BatchIssue[];
};

export type BatchState = "queued" | "printed" | "stuck" | "cancelled";

/** Этап заказа в комплектации. Не статус: считается из статуса, пометки и партий. */
export type Stage = "problem" | "queue" | "inBatch" | "printed" | "packed";
