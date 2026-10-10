import { buildWeatherComposite, type WeatherCompositeInput } from "./weatherComposite";

// Worker owns only pixel construction. The UI owns canvas upload and painting.
const worker = globalThis as unknown as {
  onmessage: (event: MessageEvent<WeatherCompositeInput>) => void;
  postMessage: (value: unknown, transfer: Transferable[]) => void;
};
worker.onmessage = ({ data }) => {
  const result = buildWeatherComposite(data);
  const transfer = result.layers.flatMap((pixels) =>
    pixels ? [pixels.buffer as ArrayBuffer] : [],
  );
  worker.postMessage(result, transfer);
};
