import core from '../model/recognition.cjs';

const { DEFAULTS, GD_GIANT, HelperError, grayscale, masks, maskStats, cleanMask, matchGd,
    segment, normalize, choose, canFill, safeSource, timeout, waitImage } = core;

export function startCaptchaHelper() {
    if (typeof document === 'undefined' || window.top !== window.self) return;

    const config = { ...DEFAULTS, ...DEFAULTS.profiles.find(p => p.host === location.hostname) };
    const state = {
        image: null, input: null, version: 0, running: false, pending: false, timer: null,
        abort: null, worker: null, workerPromise: null, workerEpoch: 0, stopped: false,
        inputRevision: 0, previousFill: new WeakMap(), report: null, images: [], candidates: [],
    };

    function canvas(width, height) {
        const node = document.createElement('canvas'); node.width = width; node.height = height;
        if (!node.getContext('2d')) throw new HelperError('CANVAS', '浏览器不能创建 Canvas');
        return node;
    }

    function pixelCanvas(values, width, height, binary = false) {
        const node = canvas(width, height), ctx = node.getContext('2d');
        const pixels = ctx.createImageData(width, height);
        for (let p = 0; p < values.length; p++) {
            const value = binary ? (values[p] ? 0 : 255) : values[p], i = p * 4;
            pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
        }
        ctx.putImageData(pixels, 0, 0); return node;
    }

    function prepare(source, rectangle = null) {
        const box = rectangle || { left: 0, top: 0, width: source.width, height: source.height };
        const result = canvas(box.width * config.scale + 2 * config.padding,
            box.height * config.scale + 2 * config.padding);
        const ctx = result.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, result.width, result.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(source, box.left, box.top, box.width, box.height, config.padding, config.padding,
            box.width * config.scale, box.height * config.scale);
        return result;
    }

    function capture(img) {
        const width = img.naturalWidth, height = img.naturalHeight;
        if (width * height > config.maxImagePixels) throw new HelperError('IMAGE_LARGE', '图片超过尺寸限制，请检查选择器');
        const original = canvas(width, height), ctx = original.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0);
        let pixels;
        try { pixels = ctx.getImageData(0, 0, width, height); }
        catch (error) {
            if (error.name === 'SecurityError') throw new HelperError('CANVAS_CORS',
                '验证码图片跨域，Canvas 无法读取。请在自有站点配置图片 CORS；脚本不会重新请求动态验证码。');
            throw error;
        }
        const gray = grayscale(pixels.data);
        let min = 255, max = 0;
        for (const v of gray) { min = Math.min(min, v); max = Math.max(max, v); }
        state.images = [{ label: '原图', canvas: original }];
        state.report.pixels = { width, height, grayMin: min, grayMax: max, contrast: max - min };
        if (max - min < 8) throw new HelperError('IMAGE_BLANK', '原图像素对比度过低，可能是空白图片');
        const processed = masks(pixels.data, gray, config);
        state.report.pixels.otsuThreshold = processed.threshold;
        const variants = [{ name: '灰度', canvas: prepare(pixelCanvas(gray, width, height)), mask: null }];
        for (const [name, raw] of [['Otsu', processed.binary], ['HSV', processed.hsv]]) {
            const cleaned = cleanMask(raw, width, height, config), mask = cleaned.mask, stats = maskStats(mask);
            const rendered = prepare(pixelCanvas(mask, width, height, true));
            state.images.push({ label: name, canvas: rendered });
            state.report.pixels[name] = { ...stats, removedFrames: cleaned.removedFrames,
                removedSpecks: cleaned.removedSpecks, usable: stats.ratio >= 0.003 && stats.ratio <= 0.65 };
            if (state.report.pixels[name].usable) variants.push({ name, canvas: rendered, mask });
        }
        state.images.splice(1, 0, { label: '灰度', canvas: variants[0].canvas });
        return { width, height, variants };
    }

    const host = document.createElement('div'); host.id = 'pt-captcha-helper';
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646;max-width:calc(100vw - 32px)';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
        :host{font:13px/1.6 system-ui,sans-serif;color:#e8edf5}*{box-sizing:border-box}
        section{width:400px;max-width:calc(100vw - 32px);padding:14px;background:#172032;
          border:1px solid #43516c;border-radius:12px;box-shadow:0 6px 24px #0004}
        h2{font-size:15px;margin:0 0 7px}p{margin:5px 0;overflow-wrap:anywhere}
        button{font:inherit;background:#e8edf5;color:#172032;border:0;border-radius:5px;padding:4px 9px;cursor:pointer}
        button:disabled{opacity:.5;cursor:default}.toolbar{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0}
        details{max-height:48vh;overflow:auto}summary{cursor:pointer;color:#a9c9ff}
        figure{margin:8px 0}figcaption{color:#bac7dd}canvas{max-width:100%;height:auto;background:white}
        pre{white-space:pre-wrap;font:11px/1.5 monospace}table{width:100%;font-size:12px;border-collapse:collapse}
        th,td{text-align:left;border-bottom:1px solid #43516c;padding:4px;overflow-wrap:anywhere}
        label{display:block;margin:5px 0;color:#bac7dd}.muted{color:#bac7dd}
    </style><section aria-label="PT CAPTCHA Helper">
        <h2>PT CAPTCHA Helper · 1.2.0</h2>
        <p id="status" role="status" aria-live="polite">正在查找验证码…</p>
        <p id="result"></p>
        <div class="toolbar"><button id="retry">重新识别</button><button id="export">导出诊断</button></div>
        <details id="debug"><summary>调试预览与候选结果</summary>
          <p class="muted">OCR 置信度与字体模板相似度分别显示，均不代表验证码正确概率。</p>
          <label><input type="checkbox" id="include-images"> 导出时包含验证码图片（仅本地下载）</label>
          <div id="previews"></div><div id="candidates"></div><pre id="stats"></pre>
        </details>
    </section>`;
    document.body.appendChild(host);
    const ui = Object.fromEntries(['status', 'result', 'retry', 'export', 'previews', 'candidates', 'stats',
        'include-images'].map(id => [id, shadow.getElementById(id)]));

    function status(message) { ui.status.textContent = message; }

    function renderDebug() {
        ui.previews.replaceChildren();
        for (const item of state.images) {
            const figure = document.createElement('figure'), label = document.createElement('figcaption');
            label.textContent = `${item.label} · ${item.canvas.width} × ${item.canvas.height}`;
            figure.append(label, item.canvas); ui.previews.appendChild(figure);
        }
        ui.candidates.replaceChildren();
        if (state.candidates.length) {
            const table = document.createElement('table');
            const header = document.createElement('tr');
            for (const text of ['方式', '结果', '评分']) {
                const cell = document.createElement('th'); cell.textContent = text; header.appendChild(cell);
            }
            table.appendChild(header);
            for (const candidate of state.candidates) {
                const row = document.createElement('tr');
                const score = candidate.metric === 'similarity' ? `相似度 ${(candidate.similarity * 100).toFixed(1)}%` :
                    `OCR ${candidate.confidence.toFixed(1)}%`;
                for (const text of [candidate.method, candidate.text || '（空）', score]) {
                    const cell = document.createElement('td'); cell.textContent = text; row.appendChild(cell);
                }
                table.appendChild(row);
            }
            ui.candidates.appendChild(table);
        }
        ui.stats.textContent = JSON.stringify(state.report, null, 2);
    }

    function current(version, img, input, signature) {
        if (state.stopped || version !== state.version || state.image !== img || state.input !== input ||
            !img.isConnected || !input.isConnected || sourceSignature(img) !== signature) {
            throw new HelperError('STALE', '验证码已刷新，旧识别结果已丢弃');
        }
    }

    function sourceSignature(img) {
        return JSON.stringify([img.getAttribute('src'), img.getAttribute('srcset'), img.currentSrc]);
    }

    function resetWorker() {
        state.workerEpoch++;
        const old = state.worker; state.worker = null; state.workerPromise = null;
        if (old) void old.terminate().catch(() => {});
    }

    async function getWorker() {
        if (state.worker) return state.worker;
        if (state.workerPromise) return state.workerPromise;
        if (typeof Tesseract === 'undefined') throw new HelperError('OCR_LIBRARY', 'Tesseract.js 未加载，请检查油猴 @require');
        const epoch = state.workerEpoch;
        let rejectFailure;
        const failure = new Promise((_, reject) => { rejectFailure = reject; });
        const creating = Tesseract.createWorker('eng', 1, {
            workerPath: config.workerPath, corePath: config.corePath, langPath: config.langPath,
            logger(event) {
                if (state.stopped || epoch !== state.workerEpoch || state.activeVersion !== state.version) return;
                const percent = Number.isFinite(event.progress) ? ` ${Math.round(event.progress * 100)}%` : '';
                status(event.status === 'recognizing text' ? `正在识别${percent}` : `正在加载 OCR 资源${percent}`);
            },
            errorHandler(error) { rejectFailure(new HelperError('OCR_WORKER', `OCR 资源或引擎错误：${String(error)}`)); },
        }, { load_system_dawg: '0', load_freq_dawg: '0', load_number_dawg: '0' });
        // 初始化超时后如引擎迟到，销毁它，避免它覆盖之后创建的 worker。
        creating.then(worker => {
            if (epoch !== state.workerEpoch || state.stopped) void worker.terminate().catch(() => {});
        }).catch(() => {});
        state.workerPromise = (async () => {
            try {
                const worker = await timeout(Promise.race([creating, failure]), config.workerTimeoutMs,
                    'OCR_INIT_TIMEOUT', 'OCR 初始化超时，请检查 CDN、语言包、WASM 与站点 CSP');
                if (epoch !== state.workerEpoch || state.stopped) throw new HelperError('STALE', 'OCR 初始化已过期');
                state.worker = worker;
                await timeout(worker.setParameters({
                    tessedit_char_whitelist: config.chars, user_defined_dpi: '300',
                }), config.recognitionTimeoutMs, 'OCR_TIMEOUT', 'OCR 参数设置超时');
                return worker;
            } catch (error) {
                if (epoch === state.workerEpoch) resetWorker();
                throw error;
            }
        })();
        return state.workerPromise;
    }

    async function recognizeCanvas(worker, image, psm) {
        try {
            const { data } = await timeout(worker.recognize(image, { tessedit_pageseg_mode: String(psm) },
                { text: true, blocks: true, hocr: false, tsv: false }), config.recognitionTimeoutMs,
                'OCR_TIMEOUT', 'OCR 识别超时；引擎已重置，可点击重新识别');
            return { rawText: String(data.text || ''), text: normalize(data.text, config),
                confidence: Number.isFinite(data.confidence) ? Math.max(0, Math.min(100, data.confidence)) : 0 };
        } catch (error) { resetWorker(); throw error; }
    }

    let internalInputEvent = false;
    function setInput(input, value) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        internalInputEvent = true;
        try {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        } finally { internalInputEvent = false; }
    }

    function noteManualInput() { if (!internalInputEvent) state.inputRevision++; }

    async function run(version) {
        const img = state.image, input = state.input;
        if (!img || !input) return;
        const initialValue = input.value, initialRevision = state.inputRevision;
        const controller = new AbortController(); state.abort = controller; state.activeVersion = version;
        state.report = {
            version: '1.2.0', timestamp: new Date().toISOString(), trigger: state.trigger,
            image: { ...safeSource(img.currentSrc || img.src), complete: img.complete,
                naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, cssWidth: img.width, cssHeight: img.height },
            settings: { chars: config.chars, expectedLength: config.expectedLength, minLength: config.minLength,
                maxLength: config.maxLength, scale: config.scale, minConfidence: config.minConfidence,
                hsvSaturation: config.hsvSaturation, hsvValue: config.hsvValue,
                gdTemplate: config.gdTemplate, minTemplateSimilarity: config.minTemplateSimilarity,
                minTemplateMargin: config.minTemplateMargin },
        };
        state.images = []; state.candidates = []; ui.result.textContent = '';
        renderDebug(); status('正在等待验证码图片加载和解码…');
        try {
            await waitImage(img, controller.signal, config.imageTimeoutMs);
            const signature = sourceSignature(img);
            current(version, img, input, signature);
            state.report.image.complete = img.complete;
            state.report.image.naturalWidth = img.naturalWidth; state.report.image.naturalHeight = img.naturalHeight;
            const prepared = capture(img); renderDebug();
            if (config.gdTemplate && config.segmentation && Array.from(config.chars).every(c => GD_GIANT[c])) {
                state.report.templateAnalysis = [];
                let previewed = false;
                for (const variant of prepared.variants.filter(v => v.mask)) {
                    const split = segment(variant.mask, prepared.width, prepared.height, config);
                    const entry = { source: variant.name, spans: split.spans, valid: split.valid };
                    state.report.templateAnalysis.push(entry);
                    if (!split.valid) { entry.skipped = '去框后的投影分段数量不符合配置'; continue; }
                    const result = matchGd(variant.mask, prepared.width, split.spans, config);
                    if (!result) continue;
                    result.method = `${variant.name} / GD5 模板`;
                    state.candidates.push(result); entry.characters = result.characters;
                    if (!previewed) {
                        const source = pixelCanvas(variant.mask, prepared.width, prepared.height, true);
                        split.spans.forEach((box, i) => state.images.push({ label: `模板字符 ${i + 1}`, canvas: prepare(source, box) }));
                        previewed = true;
                    }
                }
                renderDebug();
            }
            const templateDecision = choose(state.candidates, config);
            if (templateDecision.fill) state.report.engine = 'GD5 字体模板；未启动 Tesseract';
            else {
                status('正在初始化 OCR…');
                const worker = await getWorker(); current(version, img, input, signature);
                for (const variant of prepared.variants) {
                    for (const psm of [7, 8]) {
                        current(version, img, input, signature);
                        const candidate = await recognizeCanvas(worker, variant.canvas, psm);
                        current(version, img, input, signature);
                        state.candidates.push({ method: `${variant.name} / PSM ${psm}`, ...candidate });
                        renderDebug();
                    }
                }
                if (config.segmentation) {
                    const variant = prepared.variants.find(v => v.name === 'HSV') || prepared.variants.find(v => v.mask);
                    if (variant) {
                        const split = segment(variant.mask, prepared.width, prepared.height, config);
                        state.report.segmentation = { source: variant.name, ...split };
                        if (split.valid) {
                            const source = pixelCanvas(variant.mask, prepared.width, prepared.height, true), characters = [];
                            for (let i = 0; i < split.spans.length; i++) {
                                current(version, img, input, signature);
                                const crop = prepare(source, split.spans[i]);
                                state.images.push({ label: `字符 ${i + 1}`, canvas: crop });
                                const character = await recognizeCanvas(worker, crop, 10);
                                current(version, img, input, signature); characters.push(character);
                            }
                            state.report.segmentation.characters = characters;
                            if (characters.every(c => c.text.length === 1)) {
                                state.candidates.push({ method: `${variant.name} / 字符分割`,
                                    rawText: characters.map(c => c.rawText).join(''),
                                    text: characters.map(c => c.text).join(''),
                                    // 用最弱字符的分数，避免平均值掩盖低置信度字符。
                                    confidence: Math.min(...characters.map(c => c.confidence)) });
                            } else state.report.segmentation.skipped = '部分切片未识别为单个字符';
                        } else state.report.segmentation.skipped = '投影分段数量不符合配置，未强行切割';
                    }
                }
            }
            current(version, img, input, signature);
            const decision = choose(state.candidates, config);
            state.report.candidates = state.candidates;
            state.report.decision = { ...decision, filled: false };
            const best = decision.best;
            if (best) ui.result.textContent = `结果：${best.text || '（空）'} · ` +
                (best.metric === 'similarity' ? `模板相似度 ${(best.similarity * 100).toFixed(1)}%` :
                    `OCR 置信度 ${best.confidence.toFixed(1)}%`);
            const previous = state.previousFill.get(input);
            if (config.autoFill && decision.fill && canFill(input, initialValue, initialRevision,
                state.inputRevision, previous?.value) && (!previous || !input.value || previous.revision === state.inputRevision)) {
                setInput(input, best.text);
                state.previousFill.set(input, { value: best.text, revision: state.inputRevision });
                state.report.decision.filled = true; status('已填入验证码，请核对后登录');
            } else if (!decision.fill) {
                status(`${decision.reason}，请查看调试预览`);
                if (state.candidates.filter(c => c.metric !== 'similarity').every(c => c.confidence === 0)) state.report.hint =
                    '已读取到有对比度的像素，但 OCR 分数全部为 0。比较原图与预处理，排查字符被滤掉、背景残留或识别模式不适合。';
            } else status(config.autoFill ? '识别完成；保留当前输入内容' : '识别完成；自动填充已关闭');
            state.report.elapsedMs = Math.round(performance.now() - state.startedAt);
            renderDebug();
            if (config.debug) console.info('[PT CAPTCHA Helper]', {
                pixels: state.report.pixels, decision: state.report.decision,
            });
        } catch (error) {
            if (error.code === 'STALE' || version !== state.version || state.stopped) return;
            const message = String(error.message || error).replace(/https?:\/\/[^\s"'<>]+/g, src => {
                const safe = safeSource(src); return `${safe.origin}${safe.path}`;
            });
            state.report.error = { code: error.code || 'OCR_ERROR', message };
            status(`${state.report.error.code}：${message}`); renderDebug();
            if (config.debug) console.warn('[PT CAPTCHA Helper]', state.report.error);
        } finally { if (state.abort === controller) state.abort = null; }
    }

    function request(trigger) {
        if (state.stopped) return;
        state.version++; state.trigger = trigger;
        state.abort?.abort(); clearTimeout(state.timer);
        state.pending = Boolean(state.image && state.input);
        if (!state.pending) { status('未找到验证码图片和输入框；请检查站点配置'); return; }
        if (trigger === '验证码刷新') {
            const previous = state.previousFill.get(state.input);
            if (previous && state.input.value === previous.value && previous.revision === state.inputRevision) {
                setInput(state.input, ''); state.previousFill.delete(state.input);
            }
        }
        status('等待识别…');
        state.timer = setTimeout(drain, config.debounceMs);
    }

    async function drain() {
        if (state.running || state.stopped || !state.pending) return;
        state.running = true;
        try {
            while (state.pending && !state.stopped) {
                state.pending = false; const version = state.version; state.startedAt = performance.now();
                await run(version);
            }
        } finally { state.running = false; }
    }

    const imageLoaded = () => request('验证码刷新');
    const imageFailed = () => request('图片加载失败');
    function findElements() {
        let img, input;
        try {
            input = document.querySelector(config.inputSelector);
            const images = Array.from(document.querySelectorAll(config.imageSelector));
            const matches = images.filter(image => {
                if (config.imageSelector !== DEFAULTS.imageSelector) return true;
                try { return new URL(image.src, location.href).searchParams.get('action') === 'regimage'; }
                catch { return false; }
            });
            img = matches.find(image => input?.form && image.closest('form') === input.form) || matches[0];
        } catch { status('SELECTOR：图片或输入框选择器无效'); return; }
        if (img === state.image && input === state.input) return;
        if (img !== state.image && input === state.input && input) {
            const previous = state.previousFill.get(input);
            if (previous && input.value === previous.value && previous.revision === state.inputRevision) {
                setInput(input, ''); state.previousFill.delete(input);
            }
        }
        state.image?.removeEventListener('load', imageLoaded); state.image?.removeEventListener('error', imageFailed);
        state.input?.removeEventListener('input', noteManualInput); state.input?.removeEventListener('change', noteManualInput);
        state.image = img || null; state.input = input || null; state.inputRevision++;
        img?.addEventListener('load', imageLoaded); img?.addEventListener('error', imageFailed);
        input?.addEventListener('input', noteManualInput); input?.addEventListener('change', noteManualInput);
        request('元素检测');
    }

    const observer = new MutationObserver(records => {
        const previousImage = state.image, previousInput = state.input;
        findElements();
        if (state.image !== previousImage || state.input !== previousInput) return;
        if (records.some(record => record.type === 'attributes' && record.target === state.image)) request('验证码刷新');
    });
    function observe() {
        observer.observe(document.body, { subtree: true, childList: true, attributes: true,
            attributeFilter: ['src', 'srcset', 'sizes', 'name', 'id'] });
    }

    ui.retry.addEventListener('click', () => { findElements(); request('手动重新识别'); });
    ui.export.addEventListener('click', () => {
        const report = { ...state.report, candidates: state.candidates };
        if (ui['include-images'].checked) report.images = state.images.map(item => ({
            label: item.label, dataURL: item.canvas.toDataURL('image/png'),
        }));
        const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'pt-captcha-diagnostic.json';
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    window.addEventListener('pagehide', () => {
        state.stopped = true; state.version++; state.pending = false; clearTimeout(state.timer);
        state.abort?.abort(); observer.disconnect(); resetWorker();
    });
    window.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        state.stopped = false; observe(); findElements(); request('页面恢复');
    });
    observe(); findElements();
}
