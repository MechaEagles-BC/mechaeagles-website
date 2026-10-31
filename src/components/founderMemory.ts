/**
 * What opens when someone finds the figure in the valley: a short conversation with a memory of the founder.
 * It isn't a live AI. It picks the closest answer from data/founder.json and says so plainly when it has none, so it can't invent anything about a real person.
 * Answering is one function, ask(), so a real model could stand behind it later without changing the rest.
 */
type Memory = { keys: string[]; phrases?: string[]; answer: string; next?: string[]; links?: { label: string; href: string }[] };
type Script = { name: string; subtitle: string; disclosure: string; portrait: string; profile: string; greeting: string[]; unknown: string[]; starters: string[]; memories: Memory[] };

const STOP = new Set(["a", "an", "the", "is", "are", "was", "were", "do", "does", "did", "i", "me", "my", "to", "of", "and", "or", "in", "on", "at", "it", "this", "that", "for", "with", "can", "could", "tell", "please", "your", "have", "has", "how", "who", "what", "where", "when", "why", "you", "s", "about", "am", "be"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));

let script: Script | null = null;
let missed = 0;

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
  await new Promise((r) => setTimeout(r, still() ? 0 : 420));
  const found = ask(question);
  if (found) {
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
