const highlightColor = "霓虹色";

GM_addStyle(`
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
`);

let dataHash = "";
const gids = new Set<string>();

function updateLink(currentGids: Set<string>) {
  currentGids.forEach((gid) => {
    const posted = document.getElementById(`posted_${gid}`);
    if (posted) {
      posted.style.borderColor = "#fff";
      posted.style.backgroundImage = `var(--${highlightColor})`;
      posted.style.overflow = "hidden";
    }

    if (window.location.href.includes(`/g/${gid}/`)) {
      const favoriteLink = document.getElementById("favoritelink");
      if (favoriteLink) {
        favoriteLink.style.borderRadius = "4px";
        favoriteLink.style.padding = "2px";
        favoriteLink.style.border = "1px solid #fff";
        favoriteLink.style.backgroundImage = `var(--${highlightColor})`;
      }
    }
  });
}

async function checkUrl() {
  const response = await GM.xmlHttpRequest({
    url: "http://localhost:23786/api/search?length=1000000",
  });
  const result = JSON.parse(response.responseText) as {
    hash: string;
    data: Array<{ url: string }>;
  };

  if (result.hash === dataHash) {
    updateLink(gids);
    return;
  }

  dataHash = result.hash;
  gids.clear();

  result.data.forEach((manga) => {
    try {
      const path = new URL(manga.url).pathname;
      const gid = path.split("/")[2];
      if (gid) {
        gids.add(gid);
      }
    } catch {
      // Ignore invalid URLs from local service.
    }
  });

  updateLink(gids);
}

window.setInterval(() => {
  void checkUrl();
}, 10000);

void checkUrl();
