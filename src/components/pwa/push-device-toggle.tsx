import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { FormError } from "#/components/form/form-error";
import { SettingsRow } from "#/components/settings/settings-section";
import { Switch } from "#/components/ui/switch";
import {
  getPushPublicKey,
  subscribePush,
  unsubscribePush,
} from "#/functions/notifications.functions";
import { m } from "#/paraglide/messages.js";

/** VAPID public keys come base64url-encoded; the Push API wants bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const supported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

/** "Notifications on this device": subscribes this browser to Web Push, or forgets it. */
export function PushDeviceToggle() {
  const getKeyFn = useServerFn(getPushPublicKey);
  const subscribeFn = useServerFn(subscribePush);
  const unsubscribeFn = useServerFn(unsubscribePush);
  const key = useQuery({ queryKey: ["push", "key"], queryFn: () => getKeyFn() });
  const [subscribed, setSubscribed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supported()) return;
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(sub !== null));
  }, []);

  const toggle = useMutation({
    mutationFn: async (on: boolean) => {
      const reg = await navigator.serviceWorker.ready;
      const current = await reg.pushManager.getSubscription();
      if (!on) {
        if (current) {
          await unsubscribeFn({ data: { endpoint: current.endpoint } });
          await current.unsubscribe();
        }
        return false;
      }
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error(m.push_permission_denied());
      const publicKey = key.data?.publicKey;
      if (!publicKey) throw new Error(m.error_generic());
      const sub =
        current ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey),
        }));
      const json = sub.toJSON();
      await subscribeFn({
        data: {
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        },
      });
      return true;
    },
    onSuccess: setSubscribed,
  });

  if (!key.data?.publicKey) return null;
  return (
    <SettingsRow
      label={m.push_this_device()}
      description={supported() ? m.push_this_device_description() : m.push_unsupported()}
    >
      <Switch
        aria-label={m.push_this_device()}
        isSelected={subscribed === true}
        isDisabled={!supported() || subscribed === null || toggle.isPending}
        onChange={(on) => toggle.mutate(on)}
      />
      <FormError message={toggle.error ? toggle.error.message || m.error_generic() : null} />
    </SettingsRow>
  );
}
