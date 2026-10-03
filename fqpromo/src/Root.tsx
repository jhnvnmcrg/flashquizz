import { Composition } from "remotion";
import { H, W } from "./theme";
import { DURATION, FPS } from "./timeline";
import { Video } from "./Video";

export const RemotionRoot: React.FC = () => (
  <Composition id="FlashQuizzPromo" component={Video} durationInFrames={DURATION} fps={FPS} width={W} height={H} />
);
