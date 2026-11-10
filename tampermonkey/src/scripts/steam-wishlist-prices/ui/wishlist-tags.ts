import { loadWishlistTags, matchesWishlistTags, renameWishlistTag, saveGameTags } from "../steam/wishlist-tags";
import type { ReportPayload } from "./report-html";

export const tagEscape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const filterIcon = (kind: "plus" | "minus" | "check") => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${kind === "check" ? "M3 8l3 3 7-7" : kind === "plus" ? "M3 8h10M8 3v10" : "M3 8h10"}" /></svg>`;

export const toggleTagFilter = (selected: Set<string>, excluded: Set<string>, id: string, exclude: boolean) => {
  const active = exclude ? excluded : selected;
  const other = exclude ? selected : excluded;
  other.delete(id);
  if (active.has(id)) active.delete(id); else active.add(id);
};

export const tagControlsHtml = () => `<div id="tags-controls" class="relative">
  <button type="button" id="tags-menu-btn" class="wl-toolbar-button" aria-expanded="false">标签：全部 ▾</button>
  <div id="tags-menu-panel" class="wl-pop wl-tags-menu hidden">
    <input id="tags-search" type="search" class="wl-tag-input" placeholder="搜索标签" aria-label="搜索标签" />
    <div id="tags-options" class="wl-tags-options"></div>
    <p id="tags-message" class="wl-tags-message" role="status"></p>
    <div class="wl-tags-actions"><button type="button" id="tags-clear" class="wl-tag-action">清除筛选</button><button type="button" id="tags-refresh" class="wl-tag-action">刷新</button><button type="button" id="tags-manage" class="wl-tag-action">管理标签</button></div>
  </div>
</div>`;

export const mountWishlistTagControls = (root: ParentNode, payload: ReportPayload, changed: () => void) => {
  const find = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  const selected = new Set<string>();
  const excluded = new Set<string>();
  let busy = false;
  let dialog: HTMLElement | null = null;
  const names = () => payload.tags?.categories ?? [];
  const renderMenu = () => {
    const tags = payload.tags;
    find("tags-controls").classList.toggle("hidden", !tags?.available && !tags?.warning);
    find("tags-manage").classList.toggle("hidden", !tags?.editable);
    const query = (find("tags-search") as HTMLInputElement).value.trim().toLocaleLowerCase();
    const options = [{ id: "0", name: "未分类" }, ...names()];
    const counts = new Map<string, number>();
    for (const row of payload.rows) {
      const ids = tags?.items[row.appid];
      if (!ids) continue;
      for (const id of ids.length ? ids : ["0"]) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    find("tags-options").innerHTML = tags?.available ? options.filter((tag) => tag.name.toLocaleLowerCase().includes(query))
      .map((tag) => `<div class="wl-tag-filter-row${excluded.has(tag.id) ? " is-excluded" : ""}"><button type="button" class="wl-tag-exclude" data-tag-exclude="${tag.id}" aria-label="排除 ${tagEscape(tag.name)}" aria-pressed="${excluded.has(tag.id)}">${filterIcon("minus")}</button><button type="button" class="wl-tag-option${selected.has(tag.id) ? " is-on" : ""}" data-tag-filter="${tag.id}" aria-pressed="${selected.has(tag.id)}"><span class="wl-tag-check" aria-hidden="true">${filterIcon(selected.has(tag.id) ? "check" : "plus")}</span><span>${tagEscape(tag.name)}</span><span class="wl-tag-count">${counts.get(tag.id) ?? 0}</span></button></div>`).join("") || `<p class="wl-tags-message">没有匹配的标签</p>` : "";
    find("tags-menu-btn").textContent = excluded.size > 0
      ? `标签：${selected.size ? `含 ${selected.size} / ` : ""}排除 ${excluded.size} ▾`
      : selected.size === 0 ? "标签：全部 ▾" : selected.size === 1
      ? `标签：${options.find((tag) => selected.has(tag.id))?.name ?? "已选择"} ▾` : `标签：${selected.size} 个 ▾`;
    find("tags-message").textContent = tags?.warning ? `${tags.warning}${tags.available ? "，当前显示缓存；刷新成功后可编辑。" : ""}` : "";
  };
  const close = () => { dialog?.remove(); dialog = null; find("tags-menu-btn").focus(); };
  const open = (title: string) => {
    close();
    find("tags-menu-panel").classList.add("hidden");
    find("tags-menu-btn").setAttribute("aria-expanded", "false");
    dialog = document.createElement("div");
    dialog.className = "wl-tag-modal";
    dialog.innerHTML = `<section class="wl-pop wl-tag-dialog" role="dialog" aria-modal="true" aria-labelledby="tag-dialog-title"><div class="wl-tag-dialog-heading"><h2 id="tag-dialog-title">${tagEscape(title)}</h2><button type="button" data-tag-close class="wl-tag-dialog-close" aria-label="关闭">×</button></div><div id="tag-dialog-body"></div><p id="tag-dialog-message" class="wl-tags-message" role="status"></p></section>`;
    find("tags-controls").appendChild(dialog);
    dialog.querySelector("[data-tag-close]")!.addEventListener("click", () => { if (!busy) close(); });
    dialog.addEventListener("click", (event) => { if (event.target === dialog && !busy) close(); });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.stopPropagation(); if (!busy) close(); }
      if (event.key === "Tab") {
        const targets = Array.from(dialog!.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)"));
        const focused = dialog!.getRootNode() instanceof ShadowRoot ? (dialog!.getRootNode() as ShadowRoot).activeElement : document.activeElement;
        if (event.shiftKey && focused === targets[0]) { event.preventDefault(); targets[targets.length - 1]?.focus(); }
        else if (!event.shiftKey && focused === targets[targets.length - 1]) { event.preventDefault(); targets[0]?.focus(); }
      }
    });
    return dialog.querySelector("#tag-dialog-body") as HTMLElement;
  };
  const setBusy = (value: boolean) => {
    busy = value;
    for (const control of Array.from(dialog!.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button"))) control.disabled = value;
  };
  const editGame = (appid: number) => {
    const tags = payload.tags;
    if (!tags?.editable || tags.items[appid] === undefined || busy) return;
    const row = payload.rows.find((item) => item.appid === appid);
    const body = open(`管理“${row?.title ?? appid}”的类别`);
    let original = new Set(tags.items[appid]);
    let picked = new Set(original);
    let created: string[] = [];
    body.innerHTML = `<div class="wl-tag-editor-section"><h3>当前类别</h3><div id="tag-current" class="wl-tag-chips"></div></div><input id="tag-edit-search" class="wl-tag-input wl-tag-editor-input" type="search" maxlength="500" placeholder="按名称搜索或添加新类别" aria-label="按名称搜索或添加新类别" /><div class="wl-tag-editor-section"><h3>我的其他类别</h3><div id="tag-edit-options" class="wl-tag-chips"></div><button type="button" id="tag-create" class="wl-tag-chip wl-tag-create-choice hidden"></button></div><div class="wl-tag-dialog-footer"><button type="button" id="tag-save" class="wl-tag-save">完成</button></div>`;
    const get = (id: string) => body.querySelector(`#${id}`) as HTMLElement;
    const message = () => dialog!.querySelector("#tag-dialog-message") as HTMLElement;
    const sync = () => {
      const name = (get("tag-edit-search") as HTMLInputElement).value.trim();
      const query = name.toLocaleLowerCase();
      get("tag-current").innerHTML = names().filter((tag) => picked.has(tag.id)).map((tag) =>
        `<button type="button" class="wl-tag-chip is-selected" data-tag-pick="${tag.id}" aria-label="移除 ${tagEscape(tag.name)}">${tagEscape(tag.name)} <span aria-hidden="true">×</span></button>`).join("")
        + created.map((name, index) => `<button type="button" class="wl-tag-chip is-selected" data-new-remove="${index}" aria-label="移除 ${tagEscape(name)}">${tagEscape(name)} <span aria-hidden="true">×</span></button>`).join("")
        || `<p class="wl-tag-empty">无</p>`;
      get("tag-edit-options").innerHTML = names().filter((tag) => !picked.has(tag.id) && tag.name.toLocaleLowerCase().includes(query)).map((tag) =>
        `<button type="button" class="wl-tag-chip" data-tag-pick="${tag.id}" aria-label="添加 ${tagEscape(tag.name)}">${tagEscape(tag.name)}</button>`).join("") || `<p class="wl-tag-empty">${query ? "没有匹配的类别" : "暂无其他类别"}</p>`;
      get("tag-create").classList.toggle("hidden", !name || names().some((tag) => tag.name.toLocaleLowerCase() === query) || created.some((value) => value.toLocaleLowerCase() === query));
      get("tag-create").textContent = `＋ 添加“${name}”`;
    };
    get("tag-edit-search").addEventListener("input", sync);
    body.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLElement>("[data-tag-pick], [data-new-remove]");
      if (!button || busy) return;
      if (button.dataset.newRemove !== undefined) created.splice(Number(button.dataset.newRemove), 1);
      else {
        const id = button.dataset.tagPick!;
        if (picked.has(id)) picked.delete(id);
        else { picked.add(id); (get("tag-edit-search") as HTMLInputElement).value = ""; }
      }
      sync();
    });
    const addName = () => {
      const input = get("tag-edit-search") as HTMLInputElement;
      const name = input.value.trim();
      if (!name || busy) return;
      const existing = names().find((tag) => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (existing) picked.add(existing.id);
      else if (!created.some((value) => value.toLocaleLowerCase() === name.toLocaleLowerCase())) created.push(name);
      input.value = "";
      sync();
    };
    get("tag-create").addEventListener("click", addName);
    get("tag-edit-search").addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Enter" && !(event as KeyboardEvent).isComposing) { event.preventDefault(); addName(); } });
    get("tag-save").addEventListener("click", async () => {
      if (busy) return;
      if (picked.size + created.length > 16) { message().textContent = "每款游戏最多 16 个标签"; return; }
      setBusy(true);
      message().textContent = "正在保存…";
      try {
        const failures = await saveGameTags(payload.steamId, appid, tags, {
          add: [...picked].filter((id) => !original.has(id)), remove: [...original].filter((id) => !picked.has(id)), create: created,
        });
        renderMenu(); changed();
        if (!failures.length) close();
        else { original = new Set(tags.items[appid]); picked = new Set(original); created = []; sync(); message().textContent = `部分修改未保存：${failures.join("；")}`; }
      } catch (error) { message().textContent = (error as Error).message; }
      finally { if (dialog) setBusy(false); else busy = false; }
    });
    sync();
    (get("tag-edit-search") as HTMLInputElement).focus();
  };
  const refreshTags = async () => {
    const button = find("tags-refresh") as HTMLButtonElement;
    button.disabled = true;
    button.textContent = "读取中…";
    try {
      payload.tags = await loadWishlistTags(payload.steamId, payload.home, payload.tagShareToken, undefined, { force: true });
      if (payload.tags.available) for (const filters of [selected, excluded]) {
        for (const id of filters) if (id !== "0" && !names().some((tag) => tag.id === id)) filters.delete(id);
      }
      renderMenu(); changed();
    } finally { button.disabled = false; button.textContent = "刷新"; }
  };
  find("tags-manage").addEventListener("click", () => {
    if (!payload.tags?.editable || busy) return;
    const body = open("管理标签");
    body.innerHTML = names().map((tag) => `<form class="wl-tag-rename" data-tag-rename="${tag.id}"><input class="wl-tag-input" aria-label="标签名称" maxlength="500" value="${tagEscape(tag.name)}" /><button type="submit" class="wl-tag-action">重命名</button></form>`).join("") || `<p class="wl-tags-message">先在游戏的编辑标签中创建标签</p>`;
    body.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.target as HTMLFormElement;
      const id = form.dataset.tagRename;
      const name = form.querySelector("input")!.value.trim();
      if (!id || !name || busy) return;
      setBusy(true);
      const message = dialog!.querySelector("#tag-dialog-message")!;
      message.textContent = "正在保存…";
      try {
        await renameWishlistTag(payload.steamId, payload.tags!, id, name);
        renderMenu(); changed();
        message.textContent = "";
      }
      catch (error) { message.textContent = (error as Error).message; }
      finally { setBusy(false); }
    });
    body.querySelector<HTMLInputElement>("input")?.focus();
  });
  find("tags-menu-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    const panel = find("tags-menu-panel");
    panel.classList.toggle("hidden");
    find("tags-menu-btn").setAttribute("aria-expanded", String(!panel.classList.contains("hidden")));
    if (!panel.classList.contains("hidden")) (find("tags-search") as HTMLInputElement).focus();
  });
  find("tags-menu-panel").addEventListener("click", (event) => event.stopPropagation());
  root.addEventListener("click", () => { find("tags-menu-panel").classList.add("hidden"); find("tags-menu-btn").setAttribute("aria-expanded", "false"); });
  find("tags-search").addEventListener("input", renderMenu);
  find("tags-options").addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-tag-filter], [data-tag-exclude]");
    if (!button) return;
    const id = button.dataset.tagExclude ?? button.dataset.tagFilter!;
    toggleTagFilter(selected, excluded, id, button.dataset.tagExclude !== undefined);
    renderMenu(); changed();
  });
  find("tags-clear").addEventListener("click", () => { selected.clear(); excluded.clear(); renderMenu(); changed(); });
  find("tags-refresh").addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    try { await refreshTags(); }
    finally { busy = false; }
  });
  find("list").addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-game-tag], [data-edit-tags]");
    if (!button) return;
    if (button.dataset.editTags) editGame(Number(button.dataset.editTags));
    else { toggleTagFilter(selected, excluded, button.dataset.gameTag!, false); renderMenu(); changed(); }
  });
  renderMenu();
  return { matches: (appid: number) => matchesWishlistTags(payload.tags?.items[appid], selected, excluded) };
};
