// Every style lives in the shadow root. The host page gets no CSS (project.md §6.5 Isolation).
export const STYLES = `
:host{all:initial!important}
*,*::before,*::after{box-sizing:border-box}
.btn{position:fixed;z-index:2147483000;display:inline-flex;align-items:center;gap:8px;height:48px;padding:0 18px;border:0;border-radius:9999px;cursor:pointer;
font:600 15px/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:0;
box-shadow:0 10px 30px -10px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.06);transition:transform .15s ease}
.btn:hover{transform:translateY(-1px)}
.btn:focus{outline:none}
.btn:focus-visible{box-shadow:0 0 0 2px #fff,0 0 0 4px #000}
.btn svg{width:20px;height:20px;flex:none}
.dot{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 6px;border-radius:9999px;background:#e11d48;color:#fff;
font:700 11px/20px ui-sans-serif,system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff}
.dot[hidden]{display:none}
.bottom-right{right:20px;bottom:20px}.bottom-left{left:20px;bottom:20px}
.top-right{right:20px;top:20px}.top-left{left:20px;top:20px}
.frame{position:fixed;z-index:2147483001;width:380px;height:600px;max-height:calc(100vh - 108px);max-width:calc(100vw - 40px);
border:0;border-radius:20px;background:#fafafa;color-scheme:light;box-shadow:0 24px 64px -16px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.08);
opacity:0;visibility:hidden;pointer-events:none;transition:opacity .2s ease,transform .2s ease,visibility 0s linear .2s}
.frame.bottom-right{right:20px;bottom:84px;transform-origin:bottom right}.frame.bottom-left{left:20px;bottom:84px;transform-origin:bottom left}
.frame.top-right{right:20px;top:84px;transform-origin:top right}.frame.top-left{left:20px;top:84px;transform-origin:top left}
.frame.slide.bottom-right,.frame.slide.bottom-left{transform:translateY(16px)}
.frame.slide.top-right,.frame.slide.top-left{transform:translateY(-16px)}
.frame.scale{transform:scale(.92)}
.frame.open{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition:opacity .2s ease,transform .2s ease,visibility 0s}
.frame.gone{display:none}
@media (max-width:480px){.frame{inset:0!important;width:100%!important;height:100%!important;max-width:none;max-height:none;border-radius:0}}
@media (prefers-reduced-motion:reduce){.btn,.frame,.frame.open{transition:none}}
`;
