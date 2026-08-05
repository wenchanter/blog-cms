"use client";

import { useActionState, useState } from "react";
import type { CategoryFormState } from "@/app/actions/categories";
import { Alert, Button, Field, Input, Textarea } from "@/app/components/ui";
import type { Category } from "@/lib/categories";

/** Mirrors `slugify` in lib/validation.ts for the live preview; the server re-derives it. */
function slugifyPreview(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function CategoryForm({
  action,
  category,
  submitLabel,
}: {
  action: (
    state: CategoryFormState,
    formData: FormData,
  ) => Promise<CategoryFormState>;
  category?: Category;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<
    CategoryFormState,
    FormData
  >(action, undefined);

  // Controlled for the same reason as the post editor: the browser resets the
  // form once the action resolves, which would otherwise discard the input.
  const [values, setValues] = useState({
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    description: category?.description ?? "",
  });
  // An existing slug is a live URL and a foreign key, so never auto-rewrite it.
  const [slugLocked, setSlugLocked] = useState(Boolean(category));

  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state?.values) setValues(state.values);
    // A successful create leaves the form empty and ready for the next one.
    else if (state?.message && !category) {
      setValues({ name: "", slug: "", description: "" });
      setSlugLocked(false);
    }
  }

  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {category && <input type="hidden" name="id" value={category.id} />}

      {state?.message && !state.errors && (
        <Alert tone="success">{state.message}</Alert>
      )}

      <Field label="名称" htmlFor="name" error={errors.name}>
        <Input
          id="name"
          name="name"
          required
          maxLength={80}
          placeholder="工程实践"
          value={values.name}
          onChange={(event) => {
            const name = event.target.value;
            setValues((current) => ({
              ...current,
              name,
              slug: slugLocked ? current.slug : slugifyPreview(name),
            }));
          }}
        />
      </Field>

      <Field
        label="Slug"
        htmlFor="slug"
        error={errors.slug}
        hint={
          category
            ? "修改 slug 会同步更新所有引用该分类的文章。"
            : "小写字母、数字和连字符。中文名称请手动填写。"
        }
      >
        <Input
          id="slug"
          name="slug"
          maxLength={80}
          className="font-mono text-[13px]"
          value={values.slug}
          onChange={(event) => {
            setValues((current) => ({ ...current, slug: event.target.value }));
            setSlugLocked(true);
          }}
        />
      </Field>

      <Field label="描述" htmlFor="description" error={errors.description}>
        <Textarea
          id="description"
          name="description"
          rows={2}
          maxLength={500}
          placeholder="可选"
          value={values.description}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        className="mt-1 self-start"
      >
        {pending ? "保存中…" : submitLabel}
      </Button>
    </form>
  );
}
