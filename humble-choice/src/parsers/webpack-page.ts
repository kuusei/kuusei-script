const MARKER =
  '<script id="webpack-monthly-product-data" type="application/json">';

export const extractWebpackPage = (html: string): unknown | null => {
  const start = html.indexOf(MARKER);
  if (start < 0) {
    return null;
  }
  const jsonStart = start + MARKER.length;
  const end = html.indexOf("</script>", jsonStart);
  if (end < 0) {
    return null;
  }
  return JSON.parse(html.slice(jsonStart, end).trim());
};
