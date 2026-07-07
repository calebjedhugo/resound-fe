import EditorApp from 'editor/EditorApp';

const app = new EditorApp();
app.init();

// Editor counterpart of the game's window.__resoundDebug: a handle for
// scripted browser verification (select entities, read the model, etc.).
// The editor is dev-only, so this ships nowhere.
window.__resoundEditor = app;
