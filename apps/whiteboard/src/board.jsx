// The whiteboard editor (Excalidraw, MIT) as one self-hosted ES module. React lives only inside this bundle, which the web app loads on
// demand when a board is opened; the rest of the app stays dependency free. The web app talks to it through mountBoard() below and never
// touches React. Images are switched off in this first version (they need Drive references; see docs/WHITEBOARD_SPIKE.md), the scene
// is elements plus a few view settings, and everything the person can do is local until the app saves it as a Drive version.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

/**
 * mountBoard(el, { elements, background, theme, readOnly, name, onChange })
 * onChange(elements, { background }) fires after every change; the app decides when to save.
 * Returns { setTheme, setReadOnly, replaceScene, getElements, getBackground, destroy }.
 */
export function mountBoard(el, { elements = [], background = '#ffffff', theme = 'light', readOnly = false, name = 'Board', onChange = () => {} } = {}) {
  const root = createRoot(el);
  let api = null; let state = { theme, readOnly };
  const render = () => root.render(React.createElement('div', { className: 'l2f-board', style: { height: '100%', width: '100%' } },
    React.createElement(Excalidraw, {
      key: 'board',
      excalidrawAPI: (a) => { api = a; },
      initialData: { elements, appState: { viewBackgroundColor: background, theme: state.theme }, scrollToContent: true },
      theme: state.theme, viewModeEnabled: state.readOnly, name, langCode: 'en', autoFocus: false, handleKeyboardGlobally: false,
      UIOptions: { canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false, export: { saveFileToDisk: true }, saveAsImage: true, clearCanvas: true, changeViewBackgroundColor: true }, tools: { image: false } },
      onChange: (els, app) => onChange(els, { background: app.viewBackgroundColor }),
    }, React.createElement(MainMenu, null, React.createElement(MainMenu.DefaultItems.SaveAsImage), React.createElement(MainMenu.DefaultItems.Export), React.createElement(MainMenu.DefaultItems.ClearCanvas), React.createElement(MainMenu.DefaultItems.ChangeCanvasBackground), React.createElement(MainMenu.DefaultItems.Help)))));
  render();
  return {
    setTheme(t) { state = { ...state, theme: t }; api?.updateScene({ appState: { theme: t } }); render(); },
    setReadOnly(r) { state = { ...state, readOnly: r }; render(); },
    replaceScene(els, bg) { api?.updateScene({ elements: els, appState: { viewBackgroundColor: bg ?? background } }); },
    getElements: () => api?.getSceneElementsIncludingDeleted?.() ?? elements,
    getBackground: () => api?.getAppState?.().viewBackgroundColor ?? background,
    destroy() { try { root.unmount(); } catch { /* already gone */ } },
  };
}
