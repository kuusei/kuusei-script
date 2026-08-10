import {
  injectStyle,
  loadValue,
  requestJson,
  saveValue,
  startPolling,
} from "@/shared";

import {
  EdgeRailFilter,
  type FilterMode,
} from "./ui/edge-rail-toggle";

const FILTER_STORAGE_KEY = "eh-local-highlight-filter-mode";
const LEGACY_FILTER_STORAGE_KEY = "eh-local-highlight-filter-unhighlighted";
const LOCAL_SEARCH_URL = "http://localhost:23786/api/search?length=1000000";
const POLL_INTERVAL_MS = 10_000;
const HIGHLIGHT_COLOR = "霓虹色";

const FILTER_MODES: Array<{
  value: FilterMode;
  label: string;
  title: string;
}> = [
  {
    value: "all",
    label: "全部",
    title: "当前：显示全部，点击切换为仅高亮",
  },
  {
    value: "highlighted",
    label: "仅高亮",
    title: "当前：仅显示已高亮，点击切换为仅未高亮",
  },
  {
    value: "unhighlighted",
    label: "仅未高亮",
    title: "当前：仅显示未高亮，点击切换为全部",
  },
];

type LocalSearchResult = {
  hash: string;
  data: Array<{ url: string }>;
};

injectStyle(
  "eh-local-highlight-style",
  `
    :root {
      --彩虹色: linear-gradient(-90deg, #602ce5cc 0, #2ce597cc 20%, #e7bb18cc 40%, #ff7657cc 60%, #45c1eecc 80%, #2ce597cc 100%);
      --夕阳海滩: linear-gradient(-90deg, #ff9a9e 0%, #fad0c4 99%, #fad0c4 100%);
      --薰衣草田: linear-gradient(-90deg, #a18cd1 0%, #fbc2eb 100%);
      --柑橘清新: linear-gradient(-90deg, #f6d365 0%, #fda085 100%);
      --深海幻想: linear-gradient(-90deg, #43e97b 0%, #38f9d7 100%);
      --樱花飞舞: linear-gradient(-90deg, #ff9a9e 0%, #fecfef 50%, #fecfef 100%);
      --北极光: linear-gradient(-90deg, #4facfe 0%, #00f2fe 100%);
      --秋叶飘落: linear-gradient(-90deg, #fa709a 0%, #fee140 100%);
      --星空漫步: linear-gradient(-90deg, #30cfd0 0%, #330867 100%);
      --热带雨林: linear-gradient(-90deg, #43e97b 0%, #38f9d7 100%);
      --火焰燃烧: linear-gradient(-90deg, #ff9a9e 0%, #fad0c4 99%, #fad0c4 100%);
      --日落色: linear-gradient(-90deg, #ff5e62cc 0%, #ff9966cc 50%, #ffcc66cc 100%);
      --海洋色: linear-gradient(-90deg, #00c9ffcc 0%, #92fe9dcc 100%);
      --星空色: linear-gradient(-90deg, #1e3c72cc 0%, #2a5298cc 100%);
      --森林色: linear-gradient(-90deg, #005a3ccc 0%, #35c24ecc 100%);
      --糖果色: linear-gradient(-90deg, #ff6b6bcc 0%, #f8b195cc 50%, #f67280cc 100%);
      --黎明色: linear-gradient(-90deg, #f953c6cc 0%, #b91dcc 100%);
      --霓虹色: linear-gradient(-90deg, #12c2eccc 0%, #c471edcc 50%, #f64f59cc 100%);
      --地平线色: linear-gradient(-90deg, #f7971ecc 0%, #ffd200cc 100%);
      --午夜蓝: linear-gradient(-90deg, #000428cc 0%, #004e92cc 100%);
      --火焰色: linear-gradient(-90deg, #fc466bcc 0%, #3f5efbcc 100%);
    }

    .eh-lh-marked {
      border-color: #fff !important;
      background-image: var(--${HIGHLIGHT_COLOR}) !important;
      overflow: hidden !important;
    }

    #favoritelink.eh-lh-marked {
      border-radius: 4px !important;
      padding: 2px !important;
      border: 1px solid #fff !important;
      background-image: var(--${HIGHLIGHT_COLOR}) !important;
    }
  `,
);

let dataHash = "";
const gids = new Set<string>();
let filterControl: EdgeRailFilter | null = null;

const isFilterMode = (value: unknown): value is FilterMode =>
  value === "all" || value === "highlighted" || value === "unhighlighted";

const loadFilterMode = (): FilterMode => {
  const saved = loadValue<FilterMode | boolean | null>(FILTER_STORAGE_KEY, null);
  if (isFilterMode(saved)) {
    return saved;
  }

  const legacy = loadValue<boolean | null>(LEGACY_FILTER_STORAGE_KEY, null);
  if (legacy === true) {
    return "unhighlighted";
  }

  return "all";
};

const getFilterMode = () => filterControl?.currentMode ?? loadFilterMode();

const getGalleryItem = (posted: Element) =>
  posted.closest(".gl1t, tr") as HTMLElement | null;

const applyFilter = (currentGids: Set<string>) => {
  const mode = getFilterMode();

  document.querySelectorAll<HTMLElement>("[id^='posted_']").forEach((posted) => {
    const gid = posted.id.slice("posted_".length);
    const item = getGalleryItem(posted);
    if (!item) {
      return;
    }

    const isHighlighted = currentGids.has(gid);
    const hidden =
      (mode === "highlighted" && !isHighlighted) ||
      (mode === "unhighlighted" && isHighlighted);

    item.style.display = hidden ? "none" : "";
  });
};

const updateLink = (currentGids: Set<string>) => {
  currentGids.forEach((gid) => {
    document.getElementById(`posted_${gid}`)?.classList.add("eh-lh-marked");

    if (window.location.href.includes(`/g/${gid}/`)) {
      document.getElementById("favoritelink")?.classList.add("eh-lh-marked");
    }
  });

  applyFilter(currentGids);
};

const ensureFilterButton = () => {
  if (filterControl || !document.querySelector("[id^='posted_']")) {
    return;
  }

  filterControl = new EdgeRailFilter({
    id: "eh-local-highlight-filter",
    modes: FILTER_MODES,
    initialMode: loadFilterMode(),
    onChange: (mode) => {
      saveValue(FILTER_STORAGE_KEY, mode);
      applyFilter(gids);
    },
  });
};

const parseGids = (data: LocalSearchResult["data"]) => {
  const next = new Set<string>();

  data.forEach((manga) => {
    try {
      const gid = new URL(manga.url).pathname.split("/")[2];
      if (gid) {
        next.add(gid);
      }
    } catch {
      // Ignore invalid URLs from local service.
    }
  });

  return next;
};

const checkUrl = async () => {
  ensureFilterButton();

  const result = await requestJson<LocalSearchResult>({
    url: LOCAL_SEARCH_URL,
  });

  if (result.hash === dataHash) {
    updateLink(gids);
    return;
  }

  dataHash = result.hash;
  gids.clear();
  parseGids(result.data).forEach((gid) => gids.add(gid));
  updateLink(gids);
};

startPolling(checkUrl, POLL_INTERVAL_MS);
