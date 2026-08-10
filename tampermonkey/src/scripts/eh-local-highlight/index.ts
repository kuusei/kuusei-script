import {
  injectStyle,
  loadValue,
  requestJson,
  saveValue,
  startPolling,
} from "@/shared";

import { EdgeRailToggle } from "./ui/edge-rail-toggle";

const FILTER_STORAGE_KEY = "eh-local-highlight-filter-unhighlighted";
const LOCAL_SEARCH_URL = "http://localhost:23786/api/search?length=1000000";
const POLL_INTERVAL_MS = 10_000;

type LocalSearchResult = {
  hash: string;
  data: Array<{ url: string }>;
};

injectStyle(
  "eh-local-highlight-style",
  `
    .eh-lh-marked {
      border: 1px solid rgba(255, 255, 255, 0.55) !important;
      border-radius: 6px !important;
      background: rgba(10, 132, 255, 0.42) !important;
      box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.28);
      overflow: hidden !important;
      color: #fff !important;
    }

    #favoritelink.eh-lh-marked {
      border-radius: 8px !important;
      padding: 2px 6px !important;
    }

    @media (prefers-reduced-transparency: reduce) {
      .eh-lh-marked {
        background: #0a84ff !important;
      }
    }
  `,
);

let dataHash = "";
const gids = new Set<string>();
let filterToggle: EdgeRailToggle | null = null;

const getFilterActive = () =>
  filterToggle?.isActive ?? loadValue(FILTER_STORAGE_KEY, false);

const getGalleryItem = (posted: Element) =>
  posted.closest(".gl1t, tr") as HTMLElement | null;

const applyFilter = (currentGids: Set<string>) => {
  const filterUnhighlighted = getFilterActive();

  document.querySelectorAll<HTMLElement>("[id^='posted_']").forEach((posted) => {
    const gid = posted.id.slice("posted_".length);
    const item = getGalleryItem(posted);
    if (!item) {
      return;
    }

    item.style.display =
      filterUnhighlighted && currentGids.has(gid) ? "none" : "";
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
  if (filterToggle || !document.querySelector("[id^='posted_']")) {
    return;
  }

  filterToggle = new EdgeRailToggle({
    id: "eh-local-highlight-filter",
    label: "仅未高亮",
    ariaLabel: "仅显示未高亮",
    activeTitle: "正在筛选：仅显示未高亮",
    inactiveTitle: "点击筛选未高亮本子",
    initialActive: loadValue(FILTER_STORAGE_KEY, false),
    onChange: (active) => {
      saveValue(FILTER_STORAGE_KEY, active);
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
