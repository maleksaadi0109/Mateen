import { useEffect, useState, useSyncExternalStore } from 'react';
import { browserRecorderEnvironment, RecitationRecorderController } from '@/lib/recitation-recorder';

export { MAX_RECORDING_SECONDS, MAX_RECORDING_BYTES } from '@/lib/recitation-recorder';

export function useRecitationRecorder() {
  const [controller] = useState(() => new RecitationRecorderController(browserRecorderEnvironment()));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    const onHidden = () => {
      if (!document.hidden) return;
      if (controller.getSnapshot().status === 'requesting') controller.discard();
      else controller.stop();
    };
    const onPageHide = () => controller.discard();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
      controller.discard();
    };
  }, [controller]);

  return { ...snapshot, start: controller.start, stop: controller.stop, discard: controller.discard };
}