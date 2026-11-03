import { hydrate, getState } from "../src/state/store";
hydrate().then(() => console.log(getState().ready ? "✅ hydrate ready" : "❌ not ready"));
