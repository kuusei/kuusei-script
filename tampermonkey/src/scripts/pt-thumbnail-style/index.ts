import { injectStyle } from "@/shared";

injectStyle(
  "pt-thumbnail-style",
  `
    /* M-Team：固定 flex 子项宽度，并让图片与 Ant Design 遮罩共用同一尺寸。 */
    .ant-image:has(> img.torrent-list__thumbnail) {
      width: 247.5px !important;
      min-width: 247.5px !important;
      height: 165px !important;
      flex: 0 0 247.5px !important;
      overflow: hidden !important;
    }

    .ant-image > img.torrent-list__thumbnail {
      display: block !important;
      width: 100% !important;
      max-width: none !important;
      height: 100% !important;
      max-height: none !important;
      object-fit: cover !important;
    }

    /* KamePT */
    img.nexus-lazy-load.preview {
      width: 247.5px !important;
      max-width: 247.5px !important;
      height: 165px !important;
      max-height: 165px !important;
      object-fit: cover !important;
    }
  `,
);
