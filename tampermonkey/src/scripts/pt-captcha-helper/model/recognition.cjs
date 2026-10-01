'use strict';

const DEFAULTS = {
    chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    uppercase: true,
    minLength: 4,
    maxLength: 8,
    expectedLength: 0, // 确认站点固定为 6 位后改为 6；0 表示未知。
    scale: 3,
    padding: 10,
    autoFill: true,
    minConfidence: 65,
    ambiguityMargin: 8,
    segmentation: true,
    gdTemplate: true,
    minTemplateSimilarity: 0.88,
    minTemplateMargin: 0.06,
    hsvSaturation: 0.40,
    hsvValue: 0.72,
    minComponentArea: 3,
    imageTimeoutMs: 12000,
    workerTimeoutMs: 90000,
    recognitionTimeoutMs: 30000,
    debounceMs: 120,
    maxImagePixels: 1000000,
    debug: true,
    imageSelector: 'img[src*="image.php"]',
    inputSelector: 'input[name="imagestring"]',
    profiles: [
        // { host: 'pt.example.com', expectedLength: 6, minConfidence: 70 },
        // { host: 'other.example.com', imageSelector: '#captcha', inputSelector: '#code' },
    ],
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
};

// GD Giant (font 5), Libor Skarvada; source and license in THIRD-PARTY-NOTICES.txt.
const GD_GIANT = {"0":["000000000","000000000","000000000","000110000","001111000","011001100","110000110","110000110","110000110","110000110","011001100","001111000","000110000","000000000","000000000"],"1":["000000000","000000000","000000000","000110000","001110000","011110000","000110000","000110000","000110000","000110000","000110000","000110000","011111100","000000000","000000000"],"2":["000000000","000000000","000000000","001111000","011001100","110000110","000000110","000001100","000011000","000110000","001100000","011000000","111111110","000000000","000000000"],"3":["000000000","000000000","000000000","011111000","110001100","000000110","000001100","000111000","000001100","000000110","000000110","110001100","011111000","000000000","000000000"],"4":["000000000","000000000","000000000","000001100","000011100","000111100","001101100","011001100","110001100","111111110","000001100","000001100","000001100","000000000","000000000"],"5":["000000000","000000000","000000000","111111100","110000000","110000000","110111000","111001100","000000110","000000110","110000110","011001100","001111000","000000000","000000000"],"6":["000000000","000000000","000000000","001111000","011001100","110000100","110000000","110111000","111001100","110000110","110000110","011001100","001111000","000000000","000000000"],"7":["000000000","000000000","000000000","111111110","000000110","000000110","000001100","000011000","000110000","001100000","011000000","110000000","110000000","000000000","000000000"],"8":["000000000","000000000","000000000","001111000","011001100","110000110","011001100","001111000","011001100","110000110","110000110","011001100","001111000","000000000","000000000"],"9":["000000000","000000000","000000000","001111000","011001100","110000110","110000110","011001110","001110110","000000110","010000110","011001100","001111000","000000000","000000000"],"A":["000000000","000000000","000000000","000110000","001111000","011001100","110000110","110000110","110000110","111111110","110000110","110000110","110000110","000000000","000000000"],"B":["000000000","000000000","000000000","111111000","110001100","110000110","110001100","111111000","110001100","110000110","110000110","110001100","111111000","000000000","000000000"],"C":["000000000","000000000","000000000","001111100","011000110","110000010","110000000","110000000","110000000","110000000","110000010","011000110","001111100","000000000","000000000"],"D":["000000000","000000000","000000000","111111000","110001100","110000110","110000110","110000110","110000110","110000110","110000110","110001100","111111000","000000000","000000000"],"E":["000000000","000000000","000000000","111111100","110000000","110000000","110000000","111111000","110000000","110000000","110000000","110000000","111111100","000000000","000000000"],"F":["000000000","000000000","000000000","111111110","110000000","110000000","110000000","111111000","110000000","110000000","110000000","110000000","110000000","000000000","000000000"],"G":["000000000","000000000","000000000","001111100","011000110","110000000","110000000","110000000","110001110","110000110","110000110","011000110","001111100","000000000","000000000"],"H":["000000000","000000000","000000000","110000110","110000110","110000110","110000110","111111110","110000110","110000110","110000110","110000110","110000110","000000000","000000000"],"I":["000000000","000000000","000000000","011111100","000110000","000110000","000110000","000110000","000110000","000110000","000110000","000110000","011111100","000000000","000000000"],"J":["000000000","000000000","000000000","000111100","000001100","000001100","000001100","000001100","000001100","000001100","010001100","011011000","001110000","000000000","000000000"],"K":["000000000","000000000","000000000","110000110","110001100","110011000","110110000","111100000","111100000","110110000","110011000","110001100","110000110","000000000","000000000"],"L":["000000000","000000000","000000000","110000000","110000000","110000000","110000000","110000000","110000000","110000000","110000000","110000000","111111100","000000000","000000000"],"M":["000000000","000000000","000000000","110000110","111001110","111111110","110110110","110110110","110110110","110000110","110000110","110000110","110000110","000000000","000000000"],"N":["000000000","000000000","000000000","110000110","111000110","111100110","111100110","110110110","110110110","110011110","110001110","110001110","110000110","000000000","000000000"],"O":["000000000","000000000","000000000","001111000","011001100","110000110","110000110","110000110","110000110","110000110","110000110","011001100","001111000","000000000","000000000"],"P":["000000000","000000000","000000000","111111100","110000110","110000110","110000110","111111100","110000000","110000000","110000000","110000000","110000000","000000000","000000000"],"Q":["000000000","000000000","000000000","001111000","011001100","110000110","110000110","110000110","110000110","110110110","110011110","011001100","001111010","000000000","000000000"],"R":["000000000","000000000","000000000","111111100","110000110","110000110","110000110","111111100","111110000","110011000","110001100","110000110","110000110","000000000","000000000"],"S":["000000000","000000000","000000000","011111100","110000110","110000000","110000000","011111100","000000110","000000110","000000110","110000110","011111100","000000000","000000000"],"T":["000000000","000000000","000000000","111111110","000110000","000110000","000110000","000110000","000110000","000110000","000110000","000110000","000110000","000000000","000000000"],"U":["000000000","000000000","000000000","110000110","110000110","110000110","110000110","110000110","110000110","110000110","110000110","011001100","001111000","000000000","000000000"],"V":["000000000","000000000","000000000","110000110","110000110","110000110","011001100","011001100","011001100","001111000","001111000","000110000","000110000","000000000","000000000"],"W":["000000000","000000000","000000000","110000110","110000110","110000110","110000110","110110110","110110110","110110110","111111110","111001110","110000110","000000000","000000000"],"X":["000000000","000000000","000000000","110000110","110000110","011001100","001111000","000110000","000110000","001111000","011001100","110000110","110000110","000000000","000000000"],"Y":["000000000","000000000","000000000","110000110","110000110","011001100","001111000","000110000","000110000","000110000","000110000","000110000","000110000","000000000","000000000"],"Z":["000000000","000000000","000000000","111111100","000001100","000001100","000011000","000110000","001100000","011000000","110000000","110000000","111111100","000000000","000000000"]};

class HelperError extends Error {
    constructor(code, message) { super(message); this.code = code; }
}

function grayscale(rgba) {
    const gray = new Uint8Array(rgba.length / 4);
    for (let p = 0; p < gray.length; p++) {
        const i = p * 4, alpha = rgba[i + 3] / 255;
        gray[p] = Math.round((0.299 * rgba[i] + 0.587 * rgba[i + 1] +
            0.114 * rgba[i + 2]) * alpha + 255 * (1 - alpha));
    }
    return gray;
}

function otsu(gray) {
    const histogram = new Uint32Array(256);
    let sum = 0;
    for (const value of gray) { histogram[value]++; sum += value; }
    let lowerCount = 0, lowerSum = 0, best = -1, threshold = 127;
    for (let t = 0; t < 255; t++) {
        lowerCount += histogram[t]; lowerSum += t * histogram[t];
        const upperCount = gray.length - lowerCount;
        if (!lowerCount || !upperCount) continue;
        const delta = lowerSum / lowerCount - (sum - lowerSum) / upperCount;
        const variance = lowerCount * upperCount * delta * delta;
        if (variance > best) { best = variance; threshold = t; }
    }
    return threshold;
}

function masks(rgba, gray, config) {
    const threshold = otsu(gray);
    const binary = new Uint8Array(gray.length), hsv = new Uint8Array(gray.length);
    for (let p = 0; p < gray.length; p++) {
        const i = p * 4, a = rgba[i + 3] / 255;
        const r = rgba[i] * a + 255 * (1 - a);
        const g = rgba[i + 1] * a + 255 * (1 - a);
        const b = rgba[i + 2] * a + 255 * (1 - a);
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        binary[p] = gray[p] <= threshold ? 1 : 0;
        hsv[p] = saturation <= config.hsvSaturation && max / 255 <= config.hsvValue ? 1 : 0;
    }
    return { threshold, binary, hsv };
}

// 删除极小的 8 邻域连通分量；避免按宽度删除数字 1 等窄字符。
function removeSpecks(mask, width, height, minArea) {
    const clean = mask.slice(), seen = new Uint8Array(mask.length);
    for (let start = 0; start < mask.length; start++) {
        if (!mask[start] || seen[start]) continue;
        const component = [start]; seen[start] = 1;
        for (let q = 0; q < component.length; q++) {
            const p = component[q], x = p % width, y = Math.floor(p / width);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                const n = ny * width + nx;
                if (mask[n] && !seen[n]) { seen[n] = 1; component.push(n); }
            }
        }
        if (component.length < minArea) for (const p of component) clean[p] = 0;
    }
    return clean;
}

function maskStats(mask) {
    let foreground = 0;
    for (const pixel of mask) foreground += pixel;
    return { foreground, ratio: foreground / mask.length };
}

function components(mask, width, height) {
    const seen = new Uint8Array(mask.length), result = [];
    for (let start = 0; start < mask.length; start++) {
        if (!mask[start] || seen[start]) continue;
        const pixels = [start]; seen[start] = 1;
        let left = width, top = height, right = 0, bottom = 0;
        for (let q = 0; q < pixels.length; q++) {
            const p = pixels[q], x = p % width, y = Math.floor(p / width);
            left = Math.min(left, x); right = Math.max(right, x);
            top = Math.min(top, y); bottom = Math.max(bottom, y);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy, n = ny * width + nx;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[n] && !seen[n]) {
                    seen[n] = 1; pixels.push(n);
                }
            }
        }
        result.push({ pixels, left, top, width: right - left + 1, height: bottom - top + 1, area: pixels.length });
    }
    return result;
}

function cleanMask(mask, width, height, config) {
    const clean = mask.slice(), all = components(mask, width, height);
    const frames = all.filter(c => c.width >= width * 0.8 && c.height >= height * 0.65 &&
        c.area / (c.width * c.height) < 0.2);
    const remaining = all.filter(c => !frames.includes(c));
    let maxHeight = 0, maxArea = 0;
    for (const c of remaining) { maxHeight = Math.max(maxHeight, c.height); maxArea = Math.max(maxArea, c.area); }
    let removedSpecks = 0;
    for (const c of all) {
        const speck = c.area < config.minComponentArea ||
            (config.uppercase && c.height < maxHeight * 0.4 && c.area < maxArea * 0.15);
        if (frames.includes(c) || speck) {
            for (const p of c.pixels) clean[p] = 0;
            if (speck && !frames.includes(c)) removedSpecks++;
        }
    }
    return { mask: clean, removedFrames: frames.length, removedSpecks };
}

function glyphMask(rows) {
    const width = rows[0].length, height = rows.length;
    const mask = Uint8Array.from(rows.join(''), v => v === '1' ? 1 : 0);
    let left = width, right = -1, top = height, bottom = -1;
    for (let p = 0; p < mask.length; p++) if (mask[p]) {
        left = Math.min(left, p % width); right = Math.max(right, p % width);
        top = Math.min(top, Math.floor(p / width)); bottom = Math.max(bottom, Math.floor(p / width));
    }
    const w = right - left + 1, h = bottom - top + 1, pixels = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pixels[y * w + x] = mask[(y + top) * width + x + left];
    return { mask: pixels, width: w, height: h };
}

const gdGlyphs = Object.fromEntries(Object.entries(GD_GIANT).map(([char, rows]) => [char, glyphMask(rows)]));

function matchGd(mask, width, spans, config) {
    const heights = spans.map(s => s.height).sort((a, b) => a - b);
    if (!heights.length) return null;
    const typicalHeight = heights[Math.floor(heights.length / 2)];
    // 异常大图或宽段不做模板穷举，以免错误选择器阻塞页面。
    if (typicalHeight > 80 || spans.some(s => s.width > typicalHeight * 1.8 || s.height > typicalHeight * 2)) return null;
    // GD5 的主体字高为 10 像素；整体中位数避免局部噪点扩大字符框后扭曲字形。
    const baseScale = typicalHeight / 10;
    const characters = spans.map(box => {
        let observedArea = 0;
        for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
            observedArea += mask[(box.top + y) * width + box.left + x];
        }
        const scores = [];
        for (const char of config.chars) {
            const glyph = gdGlyphs[char]; if (!glyph) continue;
            let best = 0;
            for (const factor of [0.9, 1, 1.1]) {
                const w = Math.max(1, Math.round(glyph.width * baseScale * factor));
                const h = Math.max(1, Math.round(glyph.height * baseScale * factor)), points = [];
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                    if (glyph.mask[Math.min(glyph.height - 1, Math.floor(y * glyph.height / h)) * glyph.width +
                        Math.min(glyph.width - 1, Math.floor(x * glyph.width / w))]) points.push([x, y]);
                }
                const margin = Math.max(1, Math.round(baseScale)), step = Math.max(1, Math.floor(baseScale / 2));
                for (let dy = -margin; dy <= Math.max(0, box.height - h) + margin; dy += step) {
                    for (let dx = -margin; dx <= Math.max(0, box.width - w) + margin; dx += step) {
                        let overlap = 0;
                        for (const [x, y] of points) {
                            const sx = x + dx, sy = y + dy;
                            if (sx >= 0 && sx < box.width && sy >= 0 && sy < box.height) {
                                overlap += mask[(box.top + sy) * width + box.left + sx];
                            }
                        }
                        best = Math.max(best, 2 * overlap / (observedArea + points.length));
                    }
                }
            }
            scores.push({ char, similarity: best });
        }
        scores.sort((a, b) => b.similarity - a.similarity);
        return { char: scores[0]?.char || '', similarity: scores[0]?.similarity || 0,
            margin: scores[0] ? scores[0].similarity - (scores[1]?.similarity || 0) : 0,
            alternatives: scores.slice(0, 3) };
    });
    return { method: 'GD5 / 模板匹配', metric: 'similarity', characters,
        text: characters.map(c => c.char).join(''),
        similarity: Math.min(...characters.map(c => c.similarity)),
        margin: Math.min(...characters.map(c => c.margin)) };
}

function segment(mask, width, height, config) {
    const columns = new Uint32Array(width);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        columns[x] += mask[y * width + x];
    }
    const spans = [];
    for (let x = 0; x < width; x++) {
        if (!columns[x]) continue;
        const left = x;
        while (x + 1 < width && columns[x + 1]) x++;
        const right = x;
        let top = height, bottom = -1, area = 0;
        for (let y = 0; y < height; y++) for (let cx = left; cx <= right; cx++) {
            if (mask[y * width + cx]) { top = Math.min(top, y); bottom = Math.max(bottom, y); area++; }
        }
        // 高度过滤背景碎片；重叠或粘连字符不强行等宽切割。
        if (bottom - top + 1 >= Math.max(3, height * 0.20) && area >= 3) {
            spans.push({ left, top, width: right - left + 1, height: bottom - top + 1 });
        }
    }
    const valid = config.expectedLength ? spans.length === config.expectedLength :
        spans.length >= config.minLength && spans.length <= config.maxLength;
    return { columns: Array.from(columns), spans, valid };
}

function normalize(text, config) {
    const source = config.uppercase ? String(text || '').toUpperCase() : String(text || '');
    return Array.from(source).filter(c => config.chars.includes(c)).join('');
}

function validLength(text, config) {
    return config.expectedLength ? text.length === config.expectedLength :
        text.length >= config.minLength && text.length <= config.maxLength;
}

// 不把不同模式的置信度当成校准过的概率；接近分数但文本冲突时保留供人工核对。
function choose(candidates, config) {
    const templates = candidates.filter(c => c.metric === 'similarity' && validLength(c.text, config) &&
        c.similarity >= config.minTemplateSimilarity && c.margin >= config.minTemplateMargin)
        .sort((a, b) => b.similarity - a.similarity);
    if (templates.length) {
        const conflict = templates.some(c => c.text !== templates[0].text);
        return { best: templates[0], fill: !conflict, reason: conflict ? '模板匹配结果冲突' : '' };
    }
    const ocr = candidates.filter(c => c.metric !== 'similarity');
    const ranked = ocr.filter(c => validLength(c.text, config))
        .sort((a, b) => b.confidence - a.confidence);
    const best = ranked[0] || ocr.slice().sort((a, b) => b.confidence - a.confidence)[0] ||
        candidates.filter(c => c.metric === 'similarity').sort((a, b) => b.similarity - a.similarity)[0];
    if (!best) return { best: null, fill: false, reason: 'OCR 没有返回候选' };
    if (best.metric === 'similarity') return { best, fill: false, reason: '模板相似度或候选区分度不足' };
    const conflict = ranked.find(c => c.text !== best.text && best.confidence - c.confidence < config.ambiguityMargin);
    const reason = !validLength(best.text, config) ? '识别长度不符合配置' :
        best.confidence < config.minConfidence ? '置信度低于自动填充门槛' :
        conflict ? '不同处理方式的识别结果冲突' : '';
    return { best, fill: !reason, reason };
}

function canFill(input, initialValue, initialRevision, currentRevision, previousFill) {
    return !input.disabled && !input.readOnly && initialRevision === currentRevision &&
        input.value === initialValue && (!input.value || input.value === previousFill);
}

function safeSource(src) {
    try {
        const url = new URL(src);
        return { origin: url.origin, path: url.pathname, queryKeys: [...new Set(url.searchParams.keys())] };
    } catch { return { origin: 'unknown', path: '', queryKeys: [] }; }
}

function timeout(promise, milliseconds, code, message) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new HelperError(code, message)), milliseconds);
    })]).finally(() => clearTimeout(timer));
}

function abortable(promise, signal) {
    return new Promise((resolve, reject) => {
        const aborted = () => { cleanup(); reject(new HelperError('STALE', '图片已刷新')); };
        const cleanup = () => signal.removeEventListener('abort', aborted);
        signal.addEventListener('abort', aborted, { once: true });
        Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
        if (signal.aborted) aborted();
    });
}

async function waitImage(img, signal, milliseconds) {
    if (signal.aborted) throw new HelperError('STALE', '图片已刷新');
    await new Promise((resolve, reject) => {
        let timer;
        const cleanup = () => {
            clearTimeout(timer); img.removeEventListener('load', loaded);
            img.removeEventListener('error', failed); signal.removeEventListener('abort', aborted);
        };
        const finish = error => { cleanup(); error ? reject(error) : resolve(); };
        const loaded = () => img.naturalWidth > 0 && img.naturalHeight > 0 ? finish() : failed();
        const failed = () => finish(new HelperError('IMAGE_LOAD', '图片加载失败或真实尺寸为 0'));
        const aborted = () => finish(new HelperError('STALE', '图片已刷新'));
        img.addEventListener('load', loaded); img.addEventListener('error', failed);
        signal.addEventListener('abort', aborted, { once: true });
        timer = setTimeout(() => finish(new HelperError('IMAGE_TIMEOUT', '等待验证码图片超时')), milliseconds);
        if (img.complete) loaded();
    });
    if (typeof img.decode === 'function') {
        try { await timeout(abortable(img.decode(), signal), milliseconds, 'IMAGE_TIMEOUT', '图片解码超时'); }
        catch (error) {
            if (signal.aborted) throw new HelperError('STALE', '图片已刷新');
            if (error.code) throw error;
            throw new HelperError('IMAGE_DECODE', '浏览器无法解码验证码图片');
        }
    }
    if (signal.aborted) throw new HelperError('STALE', '图片已刷新');
    if (!img.naturalWidth || !img.naturalHeight) throw new HelperError('IMAGE_SIZE', '图片真实尺寸为 0');
}

const core = { DEFAULTS, GD_GIANT, gdGlyphs, HelperError, grayscale, otsu, masks, removeSpecks, maskStats,
    components, cleanMask, matchGd, segment, normalize, validLength, choose, canFill, safeSource, timeout, abortable, waitImage };

module.exports = core;
