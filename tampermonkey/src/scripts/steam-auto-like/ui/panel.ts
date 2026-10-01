import { injectStyle } from "@/shared";
import { booleanConfigKeys, saveConfig, type BooleanConfigKey, type Config, type Language } from "../model/config";
import { contentOptions, voteContentType, type ContentType } from "../model/voting";
import { panelStyles } from "./styles";

type PanelController = {
  config: Config; controlPanelHtml: string; pageTimeOut: number; interval: number | null;
  logEntries: { time: string; text: string }[];
  log(content: string, isAppend?: boolean): void;
  renderLogs(): void; uiText(key: string): string; syncConfigDataToForm(): void;
  updatePanelState(): void; showControlPanel(): void; hideControlPanel(): void;
  setEvent(): void; voteContentType(type: ContentType): void;
  runSelectedLikes(manual?: boolean): void; syncRefreshTimer(): void;
  pageReloadTimeOut(): void; thumbUpEvnet(): void; setControlPanelHtml(): void; saveConfig(): void;
};

export function mountPanel(config: Config): void {
  if (document.getElementById("wt629_com_controlPanel")) return;
  const app: PanelController = {
    config, controlPanelHtml: "", pageTimeOut: config.refreshTimeout, interval: null,
    saveConfig() {
      try { saveConfig(config); }
      catch { app.log(config.language === "chinese" ? "无法保存设置，请检查浏览器存储权限" : "Cannot save settings; check browser storage permissions", true); }
    },
		logEntries: [],
		log: function(content, isAppend) {
			if (!isAppend) app.logEntries = [];
			app.logEntries.push({ time: new Date().toLocaleTimeString([], { hour12: false }), text: String(content) });
			app.logEntries = app.logEntries.slice(-100);
			app.renderLogs();
		},

		renderLogs: function() {
			const box = document.getElementById('wt629_com_controlPanel_msg');
			if (!box) return;
			var atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
			box.replaceChildren();
			app.logEntries.forEach(function(entry) {
				var row = document.createElement('div');
				row.className = 'sav-log-line';
				var time = document.createElement('time');
				time.textContent = entry.time;
				var text = document.createElement('span');
				text.textContent = entry.text;
				row.append(time, text);
				box.append(row);
			});
			if (atBottom) box.scrollTop = box.scrollHeight;
		},

		uiText: function(key) {
			var words: Record<Language, Record<string, string>> = {
				chinese: {
					collapse: '收起面板', expand: '展开面板', enabled: '已开启', paused: '已暂停',
					automatic: '自动点赞',
					run: '立即点赞', types: '点赞内容', vote: '点赞',
					status: '状态动态', screenshot: '游戏截图', review: '游戏评测', purchase: '购买游戏', artwork: '艺术作品与收藏',
					funny: '差评点「欢乐」', funnyHint: '好评点赞，差评点欢乐',
					settings: '页面设置', refresh: '定时刷新', seconds: '秒', range: '10–3600 秒', show: '启动时展开面板',
					language: '语言', logs: '运行记录', clear: '清空', empty: '暂无运行记录', guide: '使用说明',
					saved: '设置已保存', noTypes: '请先选择要点赞的内容', manual: '开始手动点赞', done: '本轮处理完成',
					timerOff: '定时刷新未开启', refreshPaused: '自动点赞暂停 · 刷新暂停', reload: '正在刷新…', after: ' 秒后刷新'
				},
				english: {
					collapse: 'Collapse panel', expand: 'Expand panel', enabled: 'Enabled', paused: 'Paused',
					automatic: 'Automatic likes',
					run: 'Like now', types: 'Content to like', vote: 'Like',
					status: 'Status updates', screenshot: 'Screenshots', review: 'Game reviews', purchase: 'Game purchases', artwork: 'Artwork & favorites',
					funny: 'Mark negative reviews as funny', funnyHint: 'Like positive reviews; mark negative ones as funny',
					settings: 'Page settings', refresh: 'Auto refresh', seconds: 'sec', range: '10–3600 sec', show: 'Expand panel on startup',
					language: 'Language', logs: 'Activity log', clear: 'Clear', empty: 'No activity yet', guide: 'Help',
					saved: 'Settings saved', noTypes: 'Select at least one content type first', manual: 'Starting manual likes', done: 'This batch is complete',
					timerOff: 'Auto refresh is off', refreshPaused: 'Likes paused · refresh paused', reload: 'Refreshing…', after: ' sec until refresh'
				}
			};
			return words[app.config.language === 'english' ? 'english' : 'chinese'][key] || key;
		},

		syncConfigDataToForm: function() {
			var config = app.config;
			var fields: Record<string, BooleanConfigKey> = {
				wt629_com_is_enable: 'isEnable', wt629_com_is_show: 'isShow', wt629_com_is_timed_refresh: 'isTimedRefresh',
				wt629_com_config_thumb_up_user_status: 'thumbUpUserStatus', wt629_com_config_thumb_up_screenshot: 'thumbUpScreenshot',
				wt629_com_config_thumb_up_recommendation: 'thumbUpRecommendation', wt629_com_config_thumb_up_game_purchase: 'thumbUpGamePurchase',
				wt629_com_config_thumb_up_workshop_item_published: 'thumbUpWorkshopItemPublished', wt629_com_config_thumb_happy_by_recommendation: 'thumbHappyByRecommendation'
			};
			Object.keys(fields).forEach(function(id) {
				var key = fields[id];
				if (config[key] == null) config[key] = key.indexOf('thumb') === 0 || key === 'isShow';
				var input = document.querySelector<HTMLInputElement>("#" + id);
				if (input) input.checked = Boolean(config[key]);
			});
			var timeout = Number(config.refreshTimeout);
			config.refreshTimeout = Number.isFinite(timeout) && timeout >= 10 && timeout <= 3600 ? Math.round(timeout) : 60;
			document.querySelector<HTMLInputElement>('#wt629_com_refresh_timeout')!.value = String(config.refreshTimeout);
			app.updatePanelState();
		},

		updatePanelState: function() {
			var panel = document.getElementById('wt629_com_controlPanel')!;
			if (!panel) return;
			var config = app.config;
			var status = panel.querySelector<HTMLElement>('.sav-status')!;
			status.textContent = app.uiText(config.isEnable ? 'enabled' : 'paused');
			status.classList.toggle('is-on', Boolean(config.isEnable));
			var timeout = document.querySelector<HTMLInputElement>('#wt629_com_refresh_timeout')!;
			timeout.disabled = !config.isTimedRefresh;
			var funny = document.querySelector<HTMLInputElement>('#wt629_com_config_thumb_happy_by_recommendation')!;
			funny.disabled = !config.thumbUpRecommendation;
			funny.closest('.sav-subrow')!.classList.toggle('is-muted', !config.thumbUpRecommendation);
			var tip = document.getElementById('wt629_com_controlPanel_page_reload_tip')!;
			tip.closest('footer')!.hidden = !config.isTimedRefresh;
			tip.textContent = config.isTimedRefresh && config.isEnable ?
				app.pageTimeOut + app.uiText('after') : config.isTimedRefresh ? app.uiText('refreshPaused') : '';
		},

		showControlPanel: function() {
			var panel = document.getElementById('wt629_com_controlPanel')!;
			if (!panel) return;
			panel.classList.remove('is-collapsed');
			panel.querySelector<HTMLElement>('.wt629_com_controlPanel_main')!.hidden = false;
			var toggle = document.getElementById('wt629_com_controlPanel_show_or_hide')!;
			toggle.setAttribute('aria-expanded', 'true');
			toggle.setAttribute('aria-label', app.uiText('collapse'));
			toggle.title = app.uiText('collapse');

		},

		hideControlPanel: function() {
			var panel = document.getElementById('wt629_com_controlPanel')!;
			if (!panel) return;
			panel.classList.add('is-collapsed');
			panel.querySelector<HTMLElement>('.wt629_com_controlPanel_main')!.hidden = true;
			var toggle = document.getElementById('wt629_com_controlPanel_show_or_hide')!;
			toggle.setAttribute('aria-expanded', 'false');
			toggle.setAttribute('aria-label', app.uiText('expand'));
			toggle.title = app.uiText('expand');
		},

		setEvent: function() {
			var panel = document.getElementById('wt629_com_controlPanel')!;
			panel.addEventListener('change', function(event) {
				var input = event.target;
				if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) return;
				var key = input.getAttribute('data-config');
				if (!key) return;
				var config = app.config;
				if (key === 'refreshTimeout') {
					var seconds = Number(input.value);
					config[key] = Number.isFinite(seconds) ? Math.max(10, Math.min(3600, Math.round(seconds))) : 60;
					input.value = String(config[key]);
				} else if (key === 'language') {
					config.language = input.value === 'english' ? 'english' : 'chinese';
				} else {
					if (!booleanConfigKeys.includes(key as BooleanConfigKey) || !(input instanceof HTMLInputElement)) return;
					config[key as BooleanConfigKey] = input.checked;
				}
				app.saveConfig();
				if (key === 'language') {
					var collapsed = panel.classList.contains('is-collapsed');
					var openSections = Array.from(panel.querySelectorAll('details[open]')).map(section => section.id);

					app.setControlPanelHtml();
					panel.outerHTML = app.controlPanelHtml;
					panel = document.getElementById('wt629_com_controlPanel')!;

					openSections.forEach(id => { panel.querySelector<HTMLDetailsElement>('#' + id)!.open = true; });
					app.syncConfigDataToForm();
					app.setEvent();
					app.renderLogs();
					if (collapsed) app.hideControlPanel();
				} else {
					if (key === 'isEnable' || key === 'isTimedRefresh' || key === 'refreshTimeout') app.syncRefreshTimer();
					app.updatePanelState();
					if (key === 'isEnable' && config.isEnable) app.runSelectedLikes();
				}
				app.log(app.uiText('saved'), true);
			});
			panel.addEventListener('click', function(event) {
				if (!(event.target instanceof Element)) return;
				var button = event.target.closest('button');
				if (!button) return;
				if (button.id === 'wt629_com_controlPanel_show_or_hide') {
					if (panel.classList.contains('is-collapsed')) app.showControlPanel();
					else app.hideControlPanel();
				} else if (button.id === 'sav-run') {
					app.runSelectedLikes(true);
				} else if (button.id === 'sav-clear') {
					app.logEntries = [];
					app.renderLogs();
				} else if (button.getAttribute('data-vote-type')) {
					var type = button.getAttribute('data-vote-type');
					if (contentOptions.some(item => item[0] === type)) app.voteContentType(type as ContentType);
				}
			});

		},

		voteContentType: function(type) {
			voteContentType(type, app.config, message => app.log(message, true));
		},

		runSelectedLikes: function(manual) {
			var s = app;
			var selected = contentOptions.filter(item => s.config[item[1]]);
			if (!selected.length) { s.log(s.uiText('noTypes'), true); return; }
			if (manual) s.log(s.uiText('manual'), true);
			selected.forEach(function(item) { s.voteContentType(item[0]); });
			s.log(s.uiText('done'), true);
		},

		syncRefreshTimer: function() {
			if (app.interval !== null) window.clearInterval(app.interval);
			app.interval = null;
			app.pageTimeOut = Number(app.config.refreshTimeout);
			if (app.config.isEnable && app.config.isTimedRefresh) {
				app.interval = window.setInterval(app.pageReloadTimeOut, 1000);
			}
			app.updatePanelState();
		},

		pageReloadTimeOut: function() {
			if (!app.config.isEnable || !app.config.isTimedRefresh) { app.syncRefreshTimer(); return; }
			app.pageTimeOut--;
			if (app.pageTimeOut <= 0) {
				if (app.interval !== null) window.clearInterval(app.interval);
				document.getElementById('wt629_com_controlPanel_page_reload_tip')!.textContent = app.uiText('reload');
				location.reload();
			} else app.updatePanelState();
		},

		thumbUpEvnet: function() {
			if (app.config.isEnable) app.runSelectedLikes();
			app.syncRefreshTimer();
		},

		setControlPanelHtml: function() {
			var s = app;
			// Resolve the saved/browser language before building the panel.

			var t = s.uiText;
			function icon(kind: string) {
				var paths: Record<string, string> = {
					like: '<path d="M7 10v11H3V10h4Zm0 0 5-7c1-1 3 0 3 2v4h4c2 0 2 2 2 3l-2 7c0 1-1 2-3 2H7"/>',
					chevron: '<path d="m6 14 6-6 6 6"/>',
					status: '<path d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 19 0Z"/><path d="M7 9h10M7 13h6"/>',
					screenshot: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m3 16 5-5 4 4 4-4 5 5"/><circle cx="16" cy="8" r="1"/>',
					review: '<path d="M6 3h12v18l-6-3-6 3V3Z"/><path d="M9 8h6M9 12h4"/>',
					purchase: '<path d="M3 4h2l3 12h11l2-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
					artwork: '<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z"/>'
				};
				return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[kind] + '</svg>';
			}
			function toggle(id: string, key: BooleanConfigKey, label: string) {
				return '<input type="checkbox" class="sav-toggle" id="' + id + '" data-config="' + key + '" aria-label="' + label + '">';
			}
			function row(type: ContentType, key: BooleanConfigKey, suffix: string) {
				var id = 'wt629_com_config_thumb_up_' + suffix;
				return '<div class="sav-content-row"><span class="sav-type-icon">' + icon(type) + '</span><label for="' + id + '">' + t(type) + '</label><button type="button" class="sav-mini" id="' + id + '_a" data-vote-type="' + type + '" aria-label="' + t('vote') + ' · ' + t(type) + '">' + t('vote') + '</button>' + toggle(id, key, t(type)) + '</div>';
			}
			injectStyle("sav-panel-styles", panelStyles);
			s.controlPanelHtml = `<aside id="wt629_com_controlPanel" aria-label="Steam 社区自动点赞">
				<header class="sav-header"><span class="sav-logo">${icon('like')}</span><span class="sav-title">Steam 社区自动点赞</span><button type="button" id="wt629_com_controlPanel_show_or_hide" class="sav-collapse" aria-expanded="true" aria-controls="sav-body" aria-label="${t('collapse')}" title="${t('collapse')}">${icon('chevron')}</button></header>
				<div class="wt629_com_controlPanel_main" id="sav-body">
					<section class="sav-section"><div class="sav-auto"><label for="wt629_com_is_enable">${t('automatic')}</label><span class="sav-status"></span>${toggle('wt629_com_is_enable', 'isEnable', t('automatic'))}</div><button type="button" class="sav-primary" id="sav-run">${icon('like')}${t('run')}</button></section>
					<section class="sav-section"><h3>${t('types')}</h3>${row('status', 'thumbUpUserStatus', 'user_status')}${row('screenshot', 'thumbUpScreenshot', 'screenshot')}${row('review', 'thumbUpRecommendation', 'recommendation')}<div class="sav-subrow" title="${t('funnyHint')}"><label for="wt629_com_config_thumb_happy_by_recommendation">${t('funny')}</label>${toggle('wt629_com_config_thumb_happy_by_recommendation', 'thumbHappyByRecommendation', t('funny'))}</div>${row('purchase', 'thumbUpGamePurchase', 'game_purchase')}${row('artwork', 'thumbUpWorkshopItemPublished', 'workshop_item_published')}</section>
					<details class="sav-section sav-details" id="sav-settings"><summary>${t('settings')}</summary><div class="sav-detail-body"><div class="sav-setting"><label for="wt629_com_is_timed_refresh">${t('refresh')}</label><div class="sav-refresh-number"><input type="number" id="wt629_com_refresh_timeout" data-config="refreshTimeout" min="10" max="3600" step="1" aria-label="${t('range')}" title="${t('range')}"><span>${t('seconds')}</span></div>${toggle('wt629_com_is_timed_refresh', 'isTimedRefresh', t('refresh'))}</div><div class="sav-setting"><label for="wt629_com_is_show">${t('show')}</label>${toggle('wt629_com_is_show', 'isShow', t('show'))}</div><div class="sav-setting"><label for="sav-language">${t('language')}</label><select id="sav-language" data-config="language"><option value="chinese"${s.config.language !== 'english' ? ' selected' : ''}>简体中文</option><option value="english"${s.config.language === 'english' ? ' selected' : ''}>English</option></select></div></div></details>
					<section class="sav-section" id="sav-logs"><div class="sav-log-header"><h3>${t('logs')}</h3><button type="button" id="sav-clear" class="sav-text-button">${t('clear')}</button></div><div id="wt629_com_controlPanel_msg" class="sav-log" role="log" aria-live="polite" aria-relevant="additions" data-empty="${t('empty')}"></div></section>
					<footer class="sav-footer"><span id="wt629_com_controlPanel_page_reload_tip"></span><a href="https://steamcommunity.com/sharedfiles/filedetails/?id=1709983331" target="_blank" rel="noopener noreferrer">${t('guide')} ↗</a></footer>
				</div>
			</aside>`;
		},

  };
  app.setControlPanelHtml();
  document.body.insertAdjacentHTML("beforeend", app.controlPanelHtml);
  app.syncConfigDataToForm();
  if (!config.isShow) app.hideControlPanel();
  app.setEvent();
  app.thumbUpEvnet();
}
