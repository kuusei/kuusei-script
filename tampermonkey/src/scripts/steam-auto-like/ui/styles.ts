export const panelStyles = `
#wt629_com_controlPanel{--sav-bg:#15222e;--sav-text:#e5edf4;--sav-muted:#91a5b7;--sav-accent:#67c1f5;position:fixed;left:12px;top:12px;width:288px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 24px);z-index:2147483000;color:var(--sav-text);background:var(--sav-bg);border:1px solid #324557;border-radius:11px;box-shadow:0 10px 35px #0007;overflow:hidden;font:12px/1.4 "Segoe UI","Microsoft YaHei",sans-serif;text-align:left;isolation:isolate;display:flex;flex-direction:column}
#wt629_com_controlPanel *{box-sizing:border-box}
#wt629_com_controlPanel button,#wt629_com_controlPanel input,#wt629_com_controlPanel select{font:inherit;margin:0}
#wt629_com_controlPanel button{appearance:none;cursor:pointer;border:0;background:none;color:inherit;line-height:1.4}
#wt629_com_controlPanel button:focus-visible,#wt629_com_controlPanel input:focus-visible,#wt629_com_controlPanel select:focus-visible,#wt629_com_controlPanel a:focus-visible{outline:2px solid var(--sav-accent);outline-offset:3px}
#wt629_com_controlPanel svg{width:20px;height:20px;display:block;flex-shrink:0}
#wt629_com_controlPanel .sav-header{display:flex;align-items:center;gap:7px;padding:9px 10px;border-bottom:1px solid #2a3a48;flex-shrink:0;user-select:none}
#wt629_com_controlPanel .sav-logo{width:24px;height:24px;border-radius:7px;background:#67c1f519;color:var(--sav-accent);display:grid;place-items:center}
#wt629_com_controlPanel .sav-title{font-size:12px;font-weight:650;letter-spacing:.2px;flex:1;white-space:nowrap}
#wt629_com_controlPanel .sav-collapse{padding:3px;border-radius:7px;color:var(--sav-muted)}
#wt629_com_controlPanel .sav-collapse:hover{background:#ffffff0d;color:var(--sav-text)}
#wt629_com_controlPanel .wt629_com_controlPanel_main{overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#42576a transparent;min-height:0}
#wt629_com_controlPanel [hidden]{display:none!important}
#wt629_com_controlPanel .sav-section{padding:9px 10px;border-bottom:1px solid #2a3a48}
#wt629_com_controlPanel .sav-section h3{font-size:11px;font-weight:600;color:var(--sav-muted);margin:0 0 5px;letter-spacing:1px;text-transform:uppercase;line-height:1.4}
#wt629_com_controlPanel .sav-auto{display:flex;align-items:center;gap:7px;margin-bottom:8px}
#wt629_com_controlPanel .sav-auto label{font-size:12px;font-weight:650;flex:1}
#wt629_com_controlPanel .sav-status{font-size:10px;background:#ffffff0a;border:1px solid #ffffff0d;color:var(--sav-muted);padding:2px 7px;border-radius:20px;white-space:nowrap}
#wt629_com_controlPanel .sav-status.is-on{color:#9fdbb0;background:#8dde9d0d;border-color:#8dde9d29}
#wt629_com_controlPanel .sav-primary{width:100%;background:#67c1f5;color:#102638;padding:6px 10px;border-radius:6px;font-weight:650;display:flex;justify-content:center;align-items:center;gap:8px}
#wt629_com_controlPanel .sav-primary:hover{background:#8ed1f8}
#wt629_com_controlPanel .sav-primary:active{transform:translateY(1px)}
#wt629_com_controlPanel .sav-primary svg{width:16px;height:16px}
#wt629_com_controlPanel .sav-content-row{display:flex;align-items:center;gap:7px;min-height:25px}
#wt629_com_controlPanel .sav-type-icon{color:#9bb8ca;width:16px}
#wt629_com_controlPanel .sav-type-icon svg{width:15px;height:15px}
#wt629_com_controlPanel .sav-content-row label{flex:1;cursor:pointer}
#wt629_com_controlPanel .sav-mini{padding:3px 7px;border:1px solid #395164;border-radius:6px;font-size:11px;color:#9ad3f4;white-space:nowrap}
#wt629_com_controlPanel .sav-mini:hover{background:#67c1f510;border-color:#67c1f56b}
#wt629_com_controlPanel input.sav-toggle{appearance:none;-webkit-appearance:none;display:block;flex-shrink:0;width:30px;height:17px;background:#394b5b;border:1px solid #465968;border-radius:20px;cursor:pointer;position:relative;padding:0;vertical-align:middle}
#wt629_com_controlPanel input.sav-toggle:after{content:"";position:absolute;left:2px;top:2px;width:11px;height:11px;background:#b8c7d1;border-radius:50%;transition:transform .15s,background .15s}
#wt629_com_controlPanel input.sav-toggle:checked{background:#3b88b3;border-color:#509ac4}
#wt629_com_controlPanel input.sav-toggle:checked:after{transform:translateX(13px);background:#eef8ff}
#wt629_com_controlPanel input.sav-toggle:disabled{opacity:.45;cursor:default}
#wt629_com_controlPanel .sav-subrow{display:flex;align-items:center;gap:8px;margin:1px 0 3px 23px;padding:4px 7px;border-radius:7px;background:#0c172244;font-size:11px;color:#b8c8d5}
#wt629_com_controlPanel .sav-subrow label{flex:1;cursor:pointer}
#wt629_com_controlPanel .sav-subrow.is-muted{opacity:.55}
#wt629_com_controlPanel .sav-setting{display:flex;align-items:center;gap:7px;min-height:29px}
#wt629_com_controlPanel .sav-setting>label{flex:1;cursor:pointer}
#wt629_com_controlPanel .sav-refresh-number{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--sav-muted)}
#wt629_com_controlPanel input[type=number]{width:52px;height:24px;background:#0f1b25;border:1px solid #3a4f60;color:var(--sav-text);border-radius:6px;padding:3px 5px;text-align:center}
#wt629_com_controlPanel input[type=number]:disabled{opacity:.45}
#wt629_com_controlPanel select{max-width:120px;background:#0f1b25;border:1px solid #3a4f60;color:var(--sav-text);border-radius:6px;padding:4px 7px;font-size:11px;height:28px}
#wt629_com_controlPanel .sav-log-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
#wt629_com_controlPanel .sav-log-header h3{margin:0}
#wt629_com_controlPanel .sav-text-button{font-size:10px;color:var(--sav-muted);padding:3px 5px}
#wt629_com_controlPanel .sav-text-button:hover{color:var(--sav-accent)}
#wt629_com_controlPanel .sav-log{max-height:70px;min-height:26px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#42576a transparent;overflow-wrap:anywhere;font-size:10px;color:#a7b9c8;background:#0f1b25;border-radius:7px;padding:8px}
#wt629_com_controlPanel .sav-log:empty:after{content:attr(data-empty);color:#657b8e}
#wt629_com_controlPanel .sav-log-line{display:flex;gap:7px;padding:2px 0;align-items:baseline}
#wt629_com_controlPanel .sav-log-line time{flex-shrink:0;color:#60798b;font-size:9px;font-variant-numeric:tabular-nums}
#wt629_com_controlPanel .sav-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;color:#7893a7;font-size:10px;background:#111e29}
#wt629_com_controlPanel .sav-footer a{color:#91a5b7;text-decoration:none}
#wt629_com_controlPanel .sav-footer a:hover{color:var(--sav-accent)}
#wt629_com_controlPanel.is-collapsed{width:240px}
#wt629_com_controlPanel.is-collapsed .sav-header{border-bottom:0;padding:8px 10px}
#wt629_com_controlPanel.is-collapsed .sav-collapse svg{transform:rotate(180deg)}
@media(max-width:480px){#wt629_com_controlPanel{left:8px;top:8px;max-height:calc(100dvh - 16px)}}
@media(prefers-reduced-motion:reduce){#wt629_com_controlPanel input.sav-toggle:after{transition:none}}
#wt629_com_controlPanel .sav-logo svg{width:16px;height:16px}
#wt629_com_controlPanel .sav-collapse svg{width:16px;height:16px}
#wt629_com_controlPanel .sav-details{padding:0}
#wt629_com_controlPanel .sav-details summary{cursor:pointer;display:flex;align-items:center;justify-content:space-between;list-style:none;padding:9px 10px;font-size:11px;color:var(--sav-muted);user-select:none}
#wt629_com_controlPanel .sav-details summary::-webkit-details-marker{display:none}
#wt629_com_controlPanel .sav-details summary:after{content:"›";font-size:15px;line-height:1;transform:rotate(90deg)}
#wt629_com_controlPanel .sav-details[open] summary:after{transform:rotate(-90deg)}
#wt629_com_controlPanel .sav-details summary:hover{color:var(--sav-accent);background:#ffffff04}
#wt629_com_controlPanel .sav-details summary:focus-visible{outline:2px solid var(--sav-accent);outline-offset:-3px}
#wt629_com_controlPanel .sav-detail-body{padding:0 10px 9px}

`;
