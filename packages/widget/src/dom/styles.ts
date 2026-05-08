import type { SupoAppearance } from "../types";

export function buildStyles(cfg: Required<SupoAppearance>): string {
  const accent = cfg.accentColor;
  const isDark = cfg.theme === "dark";
  const isRight = cfg.position !== "bottom-left";
  const bg = isDark ? "#18181b" : "#ffffff";
  const border = isDark ? "#27272a" : "#e4e4e7";
  const messageBg = isDark ? "#27272a" : "#f4f4f5";
  const agentBg = isDark ? "#1e2a1e" : "#f0fdf4";
  const agentBorder = isDark ? "#2d4a2d" : "#bbf7d0";
  const agentText = isDark ? "#86efac" : "#166534";
  const systemBg = isDark ? "#1c1c2e" : "#f5f3ff";
  const systemBorder = isDark ? "#2d2d50" : "#ddd6fe";
  const systemText = isDark ? "#a78bfa" : "#6d28d9";
  const text = isDark ? "#e4e4e7" : "#18181b";
  const muted = isDark ? "#a1a1aa" : "#71717a";
  const inputBg = isDark ? "#27272a" : "#f4f4f5";
  const pos = isRight ? "right" : "left";
  const panelWidth = cfg.panelSize === "compact" ? "300px" : cfg.panelSize === "wide" ? "380px" : "340px";
  const radius = cfg.borderRadius === "soft" ? "8px" : cfg.borderRadius === "square" ? "2px" : "16px";
  const innerRadius = cfg.borderRadius === "soft" ? "8px" : cfg.borderRadius === "square" ? "4px" : "12px";
  const buttonRadius = cfg.borderRadius === "square" ? "8px" : "999px";
  const launcherHasLabel = cfg.launcherStyle === "icon-label";

  return `
*{box-sizing:border-box;margin:0;padding:0}
:host{position:fixed;${pos}:20px;bottom:20px;z-index:2147483647;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
#supo-bubble{min-width:52px;width:${launcherHasLabel ? "auto" : "52px"};height:52px;padding:${launcherHasLabel ? "0 16px" : "0"};border-radius:${buttonRadius};background:${accent};border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);transition:transform .2s,box-shadow .2s}
#supo-bubble:hover{transform:scale(1.07);box-shadow:0 6px 20px rgba(0,0,0,.3)}
#supo-bubble.supo-open{width:52px;padding:0}
#supo-bubble-label{color:#fff;font-size:13px;font-weight:600;white-space:nowrap}
#supo-panel{position:absolute;bottom:64px;${pos}:0;width:${panelWidth};max-width:calc(100vw - 40px);max-height:540px;background:${bg};border:1px solid ${border};border-radius:${radius};display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.2);transition:opacity .2s,transform .2s}
#supo-panel.supo-hidden{opacity:0;pointer-events:none;transform:translateY(10px)}
#supo-head{background:${accent};padding:11px 14px;display:flex;align-items:center;gap:9px;flex-shrink:0}
#supo-head-icon{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0}
#supo-head-name{font-size:13px;font-weight:600;color:#fff;flex:1}
#supo-head-status{font-size:10px;color:rgba(255,255,255,.7);margin-top:1px}
#supo-close{background:none;border:none;cursor:pointer;color:rgba(255,255,255,.8);padding:2px;display:flex;line-height:1}
#supo-beta{padding:7px 14px;border-bottom:1px solid ${border};background:${isDark ? "#241f13" : "#fffbeb"};color:${isDark ? "#facc15" : "#92400e"};font-size:11px;line-height:1.4;flex-shrink:0}
#supo-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth}
#supo-msgs::-webkit-scrollbar{width:4px}
#supo-msgs::-webkit-scrollbar-thumb{background:${border};border-radius:2px}
.supo-msg{display:flex;flex-direction:column;max-width:82%}
.supo-user{align-self:flex-end;align-items:flex-end}.supo-ai,.supo-agent{align-self:flex-start;align-items:flex-start}.supo-system{align-self:center;align-items:center;width:100%;max-width:100%}
.supo-bub{padding:8px 11px;border-radius:${innerRadius};font-size:13px;line-height:1.5;word-break:break-word;white-space:pre-wrap}
.supo-user .supo-bub{background:${accent};color:#fff;border-bottom-right-radius:4px}
.supo-ai .supo-bub{background:${messageBg};color:${text};border-bottom-left-radius:4px}
.supo-agent .supo-bub{background:${agentBg};color:${agentText};border:1px solid ${agentBorder};border-bottom-left-radius:4px}
.supo-system .supo-bub{background:${systemBg};color:${systemText};border:1px solid ${systemBorder};border-radius:8px;font-size:11px;text-align:center;width:100%}
.supo-sender-label{font-size:10px;color:${muted};margin-bottom:2px}.supo-agent .supo-sender-label{color:${agentText};opacity:.8}
.supo-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:${muted};animation:supo-blink 1.2s infinite;margin:0 1px}.supo-dot:nth-child(2){animation-delay:.2s}.supo-dot:nth-child(3){animation-delay:.4s}@keyframes supo-blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
.supo-spin{display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;animation:supo-rotate .8s linear infinite}@keyframes supo-rotate{to{transform:rotate(360deg)}}
#supo-id-form{flex:1;padding:22px 16px;display:flex;flex-direction:column;gap:11px;justify-content:center}
#supo-id-form h3{font-size:14px;font-weight:600;color:${text}}#supo-id-form p{font-size:12px;color:${muted}}
.supo-inp{width:100%;padding:8px 11px;border:1px solid ${border};border-radius:${innerRadius};background:${inputBg};color:${text};font-size:13px;outline:none;font-family:inherit}.supo-inp:focus{border-color:${accent}}.supo-inp.supo-error{border-color:#ef4444}
#supo-id-btn,#supo-send{background:${accent};color:#fff;border:none;border-radius:${innerRadius};cursor:pointer;font-family:inherit}
#supo-id-btn{padding:9px;font-size:13px;font-weight:500}
#supo-composer{padding:9px 10px;border-top:1px solid ${border};display:flex;gap:7px;align-items:flex-end;flex-shrink:0}
#supo-input{flex:1;padding:7px 10px;border:1px solid ${border};border-radius:${innerRadius};background:${inputBg};color:${text};font-size:13px;resize:none;outline:none;max-height:96px;line-height:1.45;font-family:inherit}
#supo-input:focus{border-color:${accent}}#supo-input::placeholder{color:${muted}}#supo-input:disabled{opacity:.5;cursor:not-allowed}
#supo-send{padding:7px 12px;font-size:12px;font-weight:500;height:34px;flex-shrink:0}#supo-send:disabled{opacity:.45;cursor:default}
#supo-escalate-btn{margin:0 12px 8px;padding:8px 14px;border-radius:${innerRadius};cursor:pointer;font-size:12px;font-weight:500;font-family:inherit;background:transparent;border:1px solid ${agentBorder};color:${agentText};text-align:center;transition:background .15s}
#supo-escalate-btn:hover{background:${agentBg}}
#supo-powered{text-align:center;padding:3px 0 8px;font-size:10px;color:${muted};flex-shrink:0}#supo-powered a{color:${muted};text-decoration:none}
`;
}
