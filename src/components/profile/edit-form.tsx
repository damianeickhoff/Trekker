"use client";

import { useActionState, useRef, useState } from "react";
import { saveProfile, type ProfileFormState } from "@/lib/profile-actions";
import { buttonClass, Field } from "../ui";
import { UserAvatar } from "../user-avatar";
import { PRESS } from "../motion";

/**
 * Scales a chosen picture down to 512px on its longer side and re-encodes it
 * as JPEG before it leaves the phone: a camera photo is several megabytes,
 * the avatar is drawn at 88px at most, and the server action's body limit
 * is one megabyte.
 */
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  return blob ? new File([blob], "avatar.jpg", { type: "image/jpeg" }) : file;
}

export function EditProfileForm({ id, name, avatar }: { id: string; name: string; avatar: string | null }) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(saveProfile, {});
  const [preview, setPreview] = useState<string | null>(avatar);
  const [remove, setRemove] = useState(false);
  const picked = useRef<File | null>(null);
  const [shownName, setShownName] = useState(name);

  return (
    <form
      action={(form) => {
        if (picked.current) form.set("avatar", picked.current);
        else form.delete("avatar");
        form.set("removeAvatar", remove ? "1" : "0");
        return action(form);
      }}
      className="flex max-w-[520px] flex-col gap-6"
    >
      <div className="flex items-center gap-4">
        <UserAvatar id={id} name={shownName} src={remove ? null : preview} size={88} ring />
        <div className="flex flex-col items-start gap-2">
          <label className={buttonClass("ghost", "sm", "cursor-pointer")}>
            Choose a picture
            <input
              type="file"
              name="avatar"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const small = await shrink(file).catch(() => file);
                picked.current = small;
                setRemove(false);
                setPreview(URL.createObjectURL(small));
              }}
            />
          </label>
          {(preview || avatar) && !remove && (
            <button
              type="button"
              onClick={() => {
                picked.current = null;
                setRemove(true);
              }}
              className={`${PRESS} text-xs font-semibold text-ink-2 hover:text-ink`}
            >
              Remove picture
            </button>
          )}
        </div>
      </div>
      <Field
        label="Name"
        name="name"
        defaultValue={name}
        maxLength={60}
        required
        autoComplete="nickname"
        onChange={(e) => setShownName(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          {pending ? "Saving" : "Save"}
        </button>
        {state.error && <span className="text-[13px] text-ink-2">{state.error}</span>}
        {state.ok && !pending && <span className="mono-label text-accent-text">{state.ok}</span>}
      </div>
    </form>
  );
}
