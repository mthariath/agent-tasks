import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app.js";

export async function runTUI(rootDir: string): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    useMouse: true,
    enableMouseMovement: true,
    screenMode: "alternate-screen",
    useKittyKeyboard: {
      disambiguate: true,
      alternateKeys: true,
      events: true
    },
    backgroundColor: "#101216"
  });

  const root = createRoot(renderer);

  try {
    await new Promise<void>((resolve) => {
      root.render(<App rootDir={rootDir} onExit={resolve} />);
    });
  } finally {
    root.unmount();
    renderer.destroy();
  }
}
