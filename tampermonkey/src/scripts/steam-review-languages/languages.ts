export const LANGUAGES: ReadonlyArray<readonly [string, string]> = [
  ["schinese", "简体中文"], ["tchinese", "繁体中文"], ["english", "英语"],
  ["japanese", "日语"], ["koreana", "韩语"], ["russian", "俄语"],
  ["french", "法语"], ["german", "德语"], ["spanish", "西班牙语（西班牙）"],
  ["latam", "西班牙语（拉丁美洲）"], ["brazilian", "葡萄牙语（巴西）"],
  ["portuguese", "葡萄牙语（葡萄牙）"], ["polish", "波兰语"], ["turkish", "土耳其语"],
  ["thai", "泰语"], ["ukrainian", "乌克兰语"], ["italian", "意大利语"],
  ["czech", "捷克语"], ["dutch", "荷兰语"], ["swedish", "瑞典语"],
  ["danish", "丹麦语"], ["finnish", "芬兰语"], ["norwegian", "挪威语"],
  ["hungarian", "匈牙利语"], ["romanian", "罗马尼亚语"], ["bulgarian", "保加利亚语"],
  ["greek", "希腊语"], ["vietnamese", "越南语"], ["indonesian", "印度尼西亚语"],
  ["arabic", "阿拉伯语"], ["malay", "马来语"],
];

const names = new Map(LANGUAGES);
export const languageName = (code: string) => code === "all" ? "全部语言"
  : code === "all_purchases" ? "全部语言（全部购买方式）"
  : code === "other" ? "其他语言" : names.get(code) ?? code;
