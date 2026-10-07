import { loadItadApiKey, saveItadApiKey } from "../pricing/itad-prices";

export const renderItadSetup = () => `
<form id="itad-form" class="wl-setup">
  <div class="flex items-center justify-between gap-3">
    <h1 class="text-base font-semibold text-white">史低设置</h1>
    <button type="button" id="itad-close" class="wl-close">关闭</button>
  </div>
  <p class="mt-3 text-sm leading-6 text-ink">仅查询当前账户区域的 Steam 史低，其他区域不标记；无数据时显示暂无史低数据。ITAD 新史低识别不完全准确，部分新史低可能标记为史低。</p>
  <label for="itad-key" class="mt-4 block text-sm text-ink">ITAD API Key</label>
  <input id="itad-key" type="password" autocomplete="off" spellcheck="false" class="mt-2 h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-ink" />
  <p class="mt-2 text-xs leading-5 text-muted">在 <a href="https://isthereanydeal.com/apps/" target="_blank" rel="noreferrer" class="text-near underline">ITAD 注册应用</a>后复制 API Key。密钥保存在油猴脚本存储中，留空可停用。</p>
  <button type="submit" class="wl-setup-go">保存并比价</button>
</form>`;

export const mountItadSetup = (root: ParentNode, onSave: () => void) => {
  const input = root.querySelector("#itad-key") as HTMLInputElement;
  input.value = loadItadApiKey();
  root.querySelector("#itad-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveItadApiKey(input.value);
    onSave();
  });
};
