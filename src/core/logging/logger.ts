type Level = "info" | "warn" | "error";
type Meta = Record<string, string | number>;
type Entry = { level: Level; message: string; meta?: Meta; at: string };

const MAX_QUEUE = 200;

let queue: Entry[] = [];
let scheduled = false;
let overflowWarned = false;

function makeEntry(level: Level, message: string, meta?: Meta): Entry {
  return { level, message, meta, at: new Date().toISOString() };
}

function flush(): void {
  scheduled = false;
  const batch = queue;
  queue = [];

  for (const item of batch) {
    const suffix = item.meta ? ` ${JSON.stringify(item.meta)}` : "";
    const line = `[${item.at}] ${item.level.toUpperCase()} ${item.message}${suffix}`;

    if (item.level === "error") {
      console.error(line);
    } else if (item.level === "warn") {
      console.warn(line);
    } else {
      console.info(line);
    }
  }
}

function push(item: Entry): void {
  if (queue.length >= MAX_QUEUE) {
    queue.shift();
    if (!overflowWarned) {
      overflowWarned = true;
      queue.push(makeEntry("warn", "logger queue overflow; oldest entries dropped"));
    }
  }

  if (queue.length >= MAX_QUEUE) {
    queue.shift();
  }

  queue.push(item);

  if (!scheduled) {
    scheduled = true;
    setImmediate(flush);
  }
}

export const log = {
  info: (message: string, meta?: Meta): void => push(makeEntry("info", message, meta)),
  warn: (message: string, meta?: Meta): void => push(makeEntry("warn", message, meta)),
  error: (message: string, meta?: Meta): void => push(makeEntry("error", message, meta)),
};
