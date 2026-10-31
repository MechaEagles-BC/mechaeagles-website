/**
 * What opens when someone finds the figure in the valley: a short conversation with a memory of the founder.
 * The suggested questions have written answers in data/founder.json. Anything else goes to an AI through /api/memory, which holds the key.
 * If that's unavailable, it falls back to the closest written answer, and says plainly when it has none.
 */
type Memory = { keys: string[]; phrases?: string[]; answer: string; next?: string[]; links?: { label: string; href: string }[] };
type Script = { name: string; subtitle: string; disclosure: string; portrait: string; profile: string; greeting: string[]; unknown: string[]; starters: string[]; memories: Memory[] };

const STOP = new Set(["a", "an", "the", "is", "are", "was", "were", "do", "does", "did", "i", "me", "my", "to", "of", "and", "or", "in", "on", "at", "it", "this", "that", "for", "with", "can", "could", "tell", "please", "your", "have", "has", "how", "who", "what", "where", "when", "why", "you", "s", "about", "am", "be"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));

let script: Script | null = null;
let missed = 0;
let history: { role: "user" | "assistant"; content: string }[] = [];
const SESSION_LIMIT = 30;
let asked = 0;

/** The AI's answer, or nothing if it can't answer right now. */
async function brain(): Promise<string | null> {
  if (++asked > SESSION_LIMIT) return null;
  try {
    const r = await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.slice(-8) }), signal: AbortSignal.timeout(18000) });
    if (!r.ok) return null;
    return (await r.json()).text ?? null;
  } catch {
    return null;
  }
}
const isPhrase = (q: string, m: Memory | null) => {
  const plain = q.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();
  return !!m?.phrases?.some((p) => plain.includes(p));
};

/** The closest memory to what was asked, or nothing. */
function ask(question: string): Memory | null {
  const plain = question.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();
  const exact = script!.memories.find((m) => m.phrases?.some((p) => plain.includes(p)));
  if (exact) return exact;
  const asked = words(question);
  let best: Memory | null = null;
  let top = 0;
  for (const m of script!.memories) {
    const score = asked.reduce((sum, w) => sum + (m.keys.includes(w) ? (w.length > 3 ? 2 : 1) : 0), 0);
    if (score > top) {
      top = score;
      best = m;
    }
  }
  return best;
}

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text) n.textContent = text;
  return n;
};

let token = 0;
function parts() {
  const dialog = document.getElementById("memory") as HTMLDialogElement | null;
  return { dialog, log: dialog?.querySelector<HTMLElement>("[data-memory-log]"), chips: dialog?.querySelector<HTMLElement>("[data-memory-chips]") };
}

function chips(list: string[]) {
  const { chips: box } = parts();
  box?.replaceChildren(...list.map((q) => {
    const b = el("button", "memory__chip", q);
    b.type = "button";
    b.dataset.ask = q;
    return b;
  }));
}

/** He speaks a few words at a time, then the screen reader gets the whole line at once. */
async function say(text: string, mine = token) {
  const { log } = parts();
  if (!log) return;
  const line = el("p", "memory__line");
  log.append(line);
  if (still()) {
    line.textContent = text;
  } else {
    line.setAttribute("aria-label", text);
    const tokens = text.split(" ");
    for (let i = 0; i < tokens.length; i++) {
      if (mine !== token) {
        line.textContent = text;
        break;
      }
      line.textContent = tokens.slice(0, i + 1).join(" ");
      log.scrollTop = log.scrollHeight;
      await new Promise((r) => setTimeout(r, 34 + tokens[i].length * 5));
    }
  }
  log.scrollTop = log.scrollHeight;
}

async function reply(question: string) {
  const { log } = parts();
  if (!log || !question.trim()) return;
  const mine = ++token;
  log.append(el("p", "memory__line memory__line--you", question));
  chips([]);
  log.scrollTop = log.scrollHeight;
  history.push({ role: "user", content: question.slice(0, 200) });
  const found = ask(question);
  let answer: string | null = null;
  if (isPhrase(question, found)) {
    await new Promise((r) => setTimeout(r, still() ? 0 : 420));
  } else {
    const wait = el("p", "memory__line memory__wait", "...");
    wait.setAttribute("aria-label", "He's thinking");
    log.append(wait);
    log.scrollTop = log.scrollHeight;
    answer = await brain();
    wait.remove();
    if (mine !== token) return;
  }
  if (answer) {
    history.push({ role: "assistant", content: answer });
    await say(answer, mine);
    if (mine === token) chips(found?.next ?? script!.starters);
  } else if (found) {
    history.push({ role: "assistant", content: found.answer });
    await say(found.answer, mine);
    if (mine !== token) return;
    if (found.links?.length) {
      const row = el("p", "memory__links");
      found.links.forEach((l) => {
        const a = el("a", "", l.label);
        a.href = l.href;
        row.append(a);
      });
      log.append(row);
    }
    chips(found.next ?? script!.starters);
  } else {
    await say(script!.unknown[missed++ % script!.unknown.length], mine);
    if (mine === token) chips(script!.starters);
  }
  log.scrollTop = log.scrollHeight;
}

async function open() {
  const { dialog, log } = parts();
  if (!dialog || !log || dialog.open) return;
  script ??= (await import("../data/founder.json")).default as Script;
  dialog.querySelector<HTMLElement>("[data-memory-disclosure]")!.textContent = script.disclosure;
  log.replaceChildren();
  history = [];
  chips([]);
  dialog.showModal();
  document.documentElement.classList.add("profile-open");
  const mine = ++token;
  for (const line of script.greeting) {
    await say(line, mine);
    if (mine !== token) return;
    await new Promise((r) => setTimeout(r, still() ? 0 : 500));
  }
  chips(script.starters);
}

export function startFounderMemory() {
  // The figure waves first. Only then does the memory open.
  document.addEventListener("mc:founder-found", () => window.setTimeout(() => void open(), still() ? 0 : 1000));
  document.addEventListener("click", (e) => {
    const t = e.target as Element;
    const q = t.closest?.<HTMLElement>("[data-ask]");
    const { dialog } = parts();
    if (q) void reply(q.dataset.ask!);
    else if (t.closest?.("[data-memory-close]") || (dialog && t === dialog)) dialog?.close();
    else if (t.closest?.("#memory a")) dialog?.close();
  });
  document.addEventListener("submit", (e) => {
    const form = (e.target as Element).closest?.<HTMLFormElement>("[data-memory-form]");
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector("input")!;
    void reply(input.value.slice(0, 200));
    input.value = "";
  }, true); // caught first, or the page router would treat this form as a page change
  document.addEventListener("close", (e) => {
    if ((e.target as Element).id !== "memory") return;
    token++;
    document.documentElement.classList.remove("profile-open");
    document.dispatchEvent(new CustomEvent("mc:founder-closed"));
  }, true);
  // A shared link goes straight to him, which is also how a phone gets here.
  document.addEventListener("mc:page", () => {
    if (location.hash === "#memory" && document.getElementById("memory")) void open();
  });
}
